import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getSharedLightingMirror } from '../rigMirror/useLightingMirror.js'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { blendEntities, flashEntities, lookIdOfDesk, lookPoses, posedEntities, rigLooksOf, washLevelOf, withWashLevel } from './looks.js'

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
    const deskLook = useSyncExternalStore(store.subscribe, read, read)
    const deskFade = useSyncExternalStore(store.subscribe, readFade, readFade)
    useEffect(() => {
        if (!looks || explicit !== undefined) return undefined
        store.probe()
        return store.watch()
    }, [looks, explicit, store])
    const lookId = explicit !== undefined ? explicit : deskLook
    const fade = explicit === undefined && deskFade && deskFade.lookId === lookIdToDesk(lookId, deskFade) ? deskFade : null
    const fromId = fade?.from ? lookIdOfDesk(fade.from) || NONE : NONE

    const shownTo = useMemo(() => roomInLook({ entities, library, looks, lookId }), [entities, library, looks, lookId])
    const shownFrom = useMemo(() => (fade && fromId !== lookId ? roomInLook({ entities, library, looks, lookId: fromId }) : null), [fade, fromId, lookId, entities, library, looks])

    // The fade clock: re-renders only while a fade is under way; t is read from the clock
    // in render, so the first frame of a new fade is already the look it comes FROM.
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!shownFrom || fadeProgress(fade) >= 1) return undefined
        const timer = setInterval(() => {
            setTick((n) => n + 1)
            if (fadeProgress(fade) >= 1) clearInterval(timer)
        }, FADE_FRAME_MS)
        return () => clearInterval(timer)
    }, [fade, shownFrom])
    const t = shownFrom ? fadeProgress(fade) : 1

    const blended = useMemo(() => (shownFrom && t < 1 ? blendEntities(shownFrom, shownTo, t) : shownTo), [shownFrom, shownTo, t])
    const shown = useMemo(() => flashEntities(blended, library), [blended, library])
    const lit = Boolean(looks && lookId && looks.looks.some((l) => l.id === lookId))
    return { entities: shown, lookId: lit ? lookId : NONE, fromDesk: explicit === undefined && Boolean(deskLook), fading: Boolean(shownFrom && t < 1) }
}

// The desk's id for the look the room shows, in the form the fade record carries it.
const lookIdToDesk = (lookId, fade) => (fade && lookIdOfDesk(fade.lookId) === lookId ? fade.lookId : null)

export default useRigLookEntities
