import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getSharedLightingMirror } from '../rigMirror/useLightingMirror.js'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { blendEntities, flashEntities, lookIdOfDesk, lookPoses, posedEntities, rigLooksOf, washLevelOf, withLookWash, withWashLevel } from './looks.js'
import { clockFadeOf, showDriver, showOf, showStateAt } from './showClock.js'
import { dmxEntities } from './dmxPose.js'
import { isAssumedMode, typeById } from './fixtureTypes.js'
import { getServerOffset } from './serverClock.js'
import { motionFrame, motionOf, motionPlan, serverNowOf, withMotion } from './lookMotion.js'

// THE ROOM FOLLOWS THE LOOK (docs/architecture/RIG_BUILD.md §11.4). While the desk plays
// one of the room's designed looks on a layer — fired by a cue, by the desk itself, or by
// a phone — every lamp of that look is drawn posed by its rule and lit in its colour.
// `explicit` (a look id, or '' for none) overrides the desk: the cards page's own GO when
// there is no desk here. Only rooms that carry designed looks ever watch; the document is
// never written.
//
// Since rigbuilder.7 (§15.6): a cue's FADE is drawn — the desk says which look the layer
// came from and when (the mirror's `lookFade`), and for `fadeMs` the room is drawn part
// way between the two, re-drawn about 30 times a second and not at all once it lands.
// The baked column wash follows the look's level, and strobes and blinders draw as a
// flash (RigFlashes.jsx), never as a cone.
//
// Hosted playback (§16, showClock.js): where no desk answers, a document that carries a
// show (cues with rig looks + mappingState.showEpoch) is played by the WALL CLOCK —
// every viewer computes the same cue at the same instant, with no desk and no account.
// Precedence: a page's own GO > the desk > the show's clock > the room as saved.

const NONE = ''
const FADE_FRAME_MS = 33
// A moving look redraws the lamps this often (about 30 Hz; the desk's own frame grid is 40 Hz, fx.js FRAME_MS 25).
const MOTION_FRAME_MS = 33
const NO_FIXTURES = Object.freeze([])
const NO_DRIVEN = new Map()

/** Does the room hold a lamp a desk could drive — joined to a fixture, of a type with a channel list? */
export const hasDmxLamps = (entities = [], library) => entities.some((e) => {
    const f = e?.components?.fixture
    if (e?.type !== 'spotLight' || !f?.type || !Number.isInteger(Number(f.index))) return false
    const type = typeById(library, f.type)
    return Boolean(type?.modes?.some((m) => Array.isArray(m.channels) && m.channels.length))
})

// Is a lamp's DMX drawn from an ASSUMED list (the words the visualiser shows)?
export const assumedDriven = (driven) => [...(driven?.values?.() || [])].some((d) => d.assumed)
export { isAssumedMode }

const deskLookOf = (s) => (s.present ? (s.looks || []).map(lookIdOfDesk).find(Boolean) || NONE : NONE)

/** The room drawn in a look: posed, the wash at the look's level. Pure. */
export const roomInLook = ({ entities, library, looks, lookId }) => {
    if (!looks || !lookId) return entities
    const poses = lookPoses({ entities, library, lookId, rigLooks: looks })
    if (!poses.size) return entities
    const look = looks.looks.find((l) => l.id === lookId)
    return withWashLevel(posedEntities(entities, poses), washLevelOf(look))
}

// Where a look's radial motion measures from: the DJ (the booth), else null (the middle of the moving lamps).
const djCentre = (entities) => {
    const dj = entities.find((e) => e.id === 'rig-dj-table')
    const p = dj?.components?.transform?.position
    return Array.isArray(p) ? [p[0], 0, p[2]] : null
}

/** How far a fade has come, 0..1, at `now`. No fade (or none recorded) is 1. */
export const fadeProgress = (fade, now = Date.now()) => {
    if (!fade || !(fade.fadeMs > 0)) return 1
    return Math.min(1, Math.max(0, (now - fade.firedAt) / fade.fadeMs))
}

export function useRigLookEntities(document, { explicit, mirror, library: baseLibrary = TYPE_LIBRARY, now: clockNow = () => Date.now() } = {}) {
    const list = document?.entities
    const entities = useMemo(() => list || [], [list])
    const library = useMemo(() => libraryWithShow(baseLibrary, entities), [baseLibrary, entities])
    const looks = useMemo(() => rigLooksOf(entities), [entities])
    const store = mirror || getSharedLightingMirror()
    const read = () => deskLookOf(store.getSnapshot())
    const readFade = () => {
        const s = store.getSnapshot()
        return s.present ? s.lookFade || null : null
    }
    const readPresent = () => Boolean(store.getSnapshot().present)
    const readFixtures = () => {
        const s = store.getSnapshot()
        return s.present ? s.fixtures || NO_FIXTURES : NO_FIXTURES
    }
    const dmxLamps = useMemo(() => hasDmxLamps(entities, library), [entities, library])
    const deskLook = useSyncExternalStore(store.subscribe, read, read)
    const deskFade = useSyncExternalStore(store.subscribe, readFade, readFade)
    const deskPresent = useSyncExternalStore(store.subscribe, readPresent, readPresent)
    const deskFixtures = useSyncExternalStore(store.subscribe, readFixtures, readFixtures)
    const [deskChecked, setDeskChecked] = useState(false)
    useEffect(() => {
        if ((!looks && !dmxLamps) || explicit !== undefined) return undefined
        let alive = true
        Promise.resolve(store.probe()).then(() => { if (alive) setDeskChecked(true) }, () => { if (alive) setDeskChecked(true) })
        const release = store.watch()
        return () => { alive = false; release() }
    }, [looks, dmxLamps, explicit, store])

    const mapping = document?.mappingState
    const show = useMemo(() => (looks ? showOf({ mappingState: mapping }) : null), [looks, mapping])
    const driver = showDriver({ explicit, deskChecked, deskPresent, show })
    const clock = useShowClockState(show, driver === 'clock')

    const lookId = explicit !== undefined
        ? explicit
        : driver === 'desk' ? deskLook
            : driver === 'clock' && clock.state ? clock.state.lookId : NONE
    const fade = explicit !== undefined
        ? null
        : driver === 'desk'
            ? (deskFade && deskFade.lookId === lookIdToDesk(lookId, deskFade) ? deskFade : null)
            : driver === 'clock' ? clock.fade : null
    const fromId = fade?.from ? lookIdOfDesk(fade.from) || NONE : NONE

    const shownTo = useMemo(() => roomInLook({ entities, library, looks, lookId }), [entities, library, looks, lookId])
    const shownFrom = useMemo(() => (fade && fromId !== lookId ? roomInLook({ entities, library, looks, lookId: fromId }) : null), [fade, fromId, lookId, entities, library, looks])

    // The fade clock: t moves ONLY on its own tick (~30 Hz while a fade is under way, never
    // otherwise), never on a render — a room that hands these entities up to its parent
    // (RoomLookFollower) re-renders on them, and a t read from the clock in render made
    // every render a new drawing: an update loop (seen in dev, 2026-09-28).
    const [tick, setTick] = useState(0)
    useEffect(() => {
        if (!shownFrom || fadeProgress(fade) >= 1) return undefined
        const timer = setInterval(() => {
            setTick((n) => n + 1)
            if (fadeProgress(fade) >= 1) clearInterval(timer)
        }, FADE_FRAME_MS)
        return () => clearInterval(timer)
    }, [fade, shownFrom])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock's beat
    const t = useMemo(() => (shownFrom ? fadeProgress(fade) : 1), [shownFrom, fade, tick])

    const faded = useMemo(() => (shownFrom && t < 1 ? blendEntities(shownFrom, shownTo, t) : shownTo), [shownFrom, shownTo, t])
    // One wash per look (§15.13): the playing look's wash shown, the previous look's cross-faded
    // out on the same tick as the lamps. A project with only the single `rig-wash` passes through
    // untouched (the same array), drawn at the look's level by roomInLook as before.
    const assets = document?.assets
    const blended = useMemo(() => withLookWash(faded, { fromLookId: shownFrom ? fromId : '', toLookId: lookId, t: shownFrom ? t : 1, assets }), [faded, shownFrom, fromId, lookId, t, assets])
    const flashed = useMemo(() => flashEntities(blended, library), [blended, library])
    // A MOVING LOOK (lookMotion.js): the look's `motion` is played on the lit lamps of its kinds, a level multiplier per lamp
    // from the SERVER's time (the clock offset measured once for the page) counted from the moment the scene was fired, so
    // every viewer is on the same beat. Level only: no lamp is moved or turned. Redrawn ~30 times a second, and not at all
    // for a look that holds still (the same array passes through).
    const playing = lookId && looks ? looks.looks.find((l) => l.id === lookId) || null : null
    const plan = useMemo(() => {
        if (!playing || !motionOf(playing)) return null
        const level = new Map(shownTo.map((e) => [e.id, e.components?.rigShown?.level ?? 1]))
        return motionPlan({ entities: shownTo, look: playing, levelOf: (id) => level.get(id) ?? 1, centre: djCentre(entities) })
    }, [playing, shownTo, entities])
    const [beat, setBeat] = useState(0)
    useEffect(() => {
        if (!plan) return undefined
        const timer = setInterval(() => setBeat((n) => n + 1), MOTION_FRAME_MS)
        return () => clearInterval(timer)
    }, [plan])
    const epoch = explicit !== undefined ? 0 : driver === 'clock' ? clock.state?.firedAt || 0 : (fade?.firedAt || 0)
    const offsetMs = driver === 'clock' ? clock.offset?.offset || 0 : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `beat` is the clock's tick; the time is read inside the memo
    const frame = useMemo(() => (plan ? motionFrame(plan, serverNowOf(clockNow(), offsetMs), epoch) : null), [plan, epoch, offsetMs, beat])
    // DMX WINS (RIG_BUILD.md §18.4): while the desk is live, every lamp joined to a patched
    // fixture with a known channel list is drawn from what the desk sends, attribute by
    // attribute. A page's own GO (`explicit`) means no desk is being followed.
    const dmxOn = explicit === undefined && deskPresent && dmxLamps && deskFixtures.length > 0
    const dmx = useMemo(() => (dmxOn
        ? dmxEntities({ shown: flashed, document: entities, fixtures: deskFixtures, library })
        : { entities: flashed, driven: NO_DRIVEN }), [dmxOn, flashed, entities, deskFixtures, library])
    // Motion rides on top of whatever draws the lamps, DMX included: the desk's values are the level, the look's motion is the beat.
    const shown = useMemo(() => withMotion(dmx.entities, frame), [dmx.entities, frame])
    const lit = Boolean(looks && lookId && looks.looks.some((l) => l.id === lookId))
    return {
        entities: shown,
        driven: dmx.driven,
        lookId: lit ? lookId : NONE,
        fromDesk: driver === 'desk' && Boolean(deskLook),
        fading: Boolean(shownFrom && t < 1),
        moving: Boolean(plan),
        driver,
        show: driver === 'clock' ? show : null,
        clock: driver === 'clock' ? clock.state : null,
        clockOffset: clock.offset
    }
}

// THE CLOCK, RUNNING: the show's state now, re-computed at each cue's boundary (one
// timer, never a per-frame loop), on the server's time as measured once for the page
// (serverClock.js). `fade` carries `firedAt` back on THIS tab's clock, which is the one
// fadeProgress reads.
export function useShowClockState(show, running, { now = () => Date.now(), offsetSource = getServerOffset } = {}) {
    const [offset, setOffset] = useState({ offset: 0, error: null, measured: false })
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!running) return undefined
        let alive = true
        Promise.resolve(offsetSource()).then((o) => { if (alive && o) setOffset(o) }, () => {})
        return () => { alive = false }
    }, [running, offsetSource])
    const serverNow = now() + offset.offset
    const state = running && show ? showStateAt(show, serverNow) : null
    const nextInMs = state?.nextInMs
    const index = state?.index
    const cycle = state?.cycle
    useEffect(() => {
        if (!running || nextInMs == null) return undefined
        const timer = setTimeout(() => setTick((n) => n + 1), Math.max(20, nextInMs + 15))
        return () => clearTimeout(timer)
    }, [running, nextInMs, index, cycle])
    // One fade object per firing (a new cue, or the same cue on the next pass), so the
    // room's memos see a change only when the show moves on.
    const firedAt = state?.firedAt
    const lookId = state?.lookId
    const fromLookId = state?.fromLookId
    const fadeMs = state?.fadeMs
    const fade = useMemo(() => {
        if (lookId == null) return null
        const f = clockFadeOf({ lookId, fromLookId, fadeMs, firedAt })
        return { ...f, firedAt: f.firedAt - offset.offset }
    }, [lookId, fromLookId, fadeMs, firedAt, offset.offset])
    return { state, fade, offset }
}

// The desk's id for the look the room shows, in the form the fade record carries it.
const lookIdToDesk = (lookId, fade) => (fade && lookIdOfDesk(fade.lookId) === lookId ? fade.lookId : null)

export default useRigLookEntities
