import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getSharedLightingMirror } from '../rigMirror/useLightingMirror.js'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { blendEntities, flashEntities, lookIdOfDesk, lookPoses, posedEntities, rigLooksOf, washLevelOf, withWashLevel } from './looks.js'
import { clockFadeOf, showDriver, showOf, showStateAt } from './showClock.js'
import { getServerOffset } from './serverClock.js'

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

const deskLookOf = (s) => (s.present ? (s.looks || []).map(lookIdOfDesk).find(Boolean) || NONE : NONE)

/** The room drawn in a look: posed, the wash at the look's level. Pure. */
export const roomInLook = ({ entities, library, looks, lookId }) => {
    if (!looks || !lookId) return entities
    const poses = lookPoses({ entities, library, lookId, rigLooks: looks })
    if (!poses.size) return entities
    const look = looks.looks.find((l) => l.id === lookId)
    return withWashLevel(posedEntities(entities, poses), washLevelOf(look))
}

/** How far a fade has come, 0..1, at `now`. No fade (or none recorded) is 1. */
export const fadeProgress = (fade, now = Date.now()) => {
    if (!fade || !(fade.fadeMs > 0)) return 1
    return Math.min(1, Math.max(0, (now - fade.firedAt) / fade.fadeMs))
}

export function useRigLookEntities(document, { explicit, mirror, library: baseLibrary = TYPE_LIBRARY } = {}) {
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
    const deskLook = useSyncExternalStore(store.subscribe, read, read)
    const deskFade = useSyncExternalStore(store.subscribe, readFade, readFade)
    const deskPresent = useSyncExternalStore(store.subscribe, readPresent, readPresent)
    const [deskChecked, setDeskChecked] = useState(false)
    useEffect(() => {
        if (!looks || explicit !== undefined) return undefined
        let alive = true
        Promise.resolve(store.probe()).then(() => { if (alive) setDeskChecked(true) }, () => { if (alive) setDeskChecked(true) })
        const release = store.watch()
        return () => { alive = false; release() }
    }, [looks, explicit, store])

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

    const blended = useMemo(() => (shownFrom && t < 1 ? blendEntities(shownFrom, shownTo, t) : shownTo), [shownFrom, shownTo, t])
    const shown = useMemo(() => flashEntities(blended, library), [blended, library])
    const lit = Boolean(looks && lookId && looks.looks.some((l) => l.id === lookId))
    return {
        entities: shown,
        lookId: lit ? lookId : NONE,
        fromDesk: driver === 'desk' && Boolean(deskLook),
        fading: Boolean(shownFrom && t < 1),
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
