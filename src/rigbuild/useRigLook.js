import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { getSharedLightingMirror } from '../rigMirror/useLightingMirror.js'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { lookIdOfDesk, lookPoses, posedEntities, rigLooksOf } from './looks.js'

// THE ROOM FOLLOWS THE LOOK (docs/architecture/RIG_BUILD.md §11.4). While the desk plays
// one of the room's designed looks on a layer — fired by a cue, by the desk itself, or by
// a phone — every lamp of that look is drawn posed by its rule and lit in its colour.
// `explicit` (a look id, or '' for none) overrides the desk: the cards page's own GO when
// there is no desk here. Only rooms that carry designed looks ever watch; the document is
// never written.

const NONE = ''

export function useRigLookEntities(document, { explicit, mirror, library: baseLibrary = TYPE_LIBRARY } = {}) {
    const list = document?.entities
    const entities = useMemo(() => list || [], [list])
    const library = useMemo(() => libraryWithShow(baseLibrary, entities), [baseLibrary, entities])
    const looks = useMemo(() => rigLooksOf(entities), [entities])
    const store = mirror || getSharedLightingMirror()
    const read = () => {
        const s = store.getSnapshot()
        if (!s.present) return NONE
        return (s.looks || []).map(lookIdOfDesk).find(Boolean) || NONE
    }
    const deskLook = useSyncExternalStore(store.subscribe, read, read)
    useEffect(() => {
        if (!looks || explicit !== undefined) return undefined
        store.probe()
        return store.watch()
    }, [looks, explicit, store])
    const lookId = explicit !== undefined ? explicit : deskLook
    const poses = useMemo(() => (looks && lookId ? lookPoses({ entities, library, lookId, rigLooks: looks }) : null), [looks, lookId, entities, library])
    const shown = useMemo(() => posedEntities(entities, poses), [entities, poses])
    return { entities: shown, lookId: poses?.size ? lookId : NONE, fromDesk: explicit === undefined && Boolean(deskLook) }
}

export default useRigLookEntities
