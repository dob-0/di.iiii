// A PROJECT'S TYPES, AND ONLY THOSE (owner, 2026-10-13: "why is the whole fixture list loaded if
// you only need to see what is in the show?"). The room and the viewer load the library's file
// for each type the project uses — a lamp's `components.fixture.type`, an item on its rental
// list — and nothing else. A project's own types (rentalList.types) ride in the document and
// are joined by libraryWithShow (rental.js) as before. The whole library: ./index.js.
import { useEffect, useMemo, useState } from 'react'
import index from './library/index.json'

const loaders = import.meta.glob(['./library/*.json', '!./library/index.json'], { import: 'default' })
const KNOWN = new Set(index.types.map((t) => t.id))
const ORDER = new Map(index.types.map((t, i) => [t.id, i]))

/** The library type ids a project uses, in the library's order. Pure. */
export const typeIdsUsedBy = (entities = []) => {
    const ids = new Set()
    for (const e of Array.isArray(entities) ? entities : []) {
        const t = e?.components?.fixture?.type
        if (typeof t === 'string') ids.add(t.trim().toLowerCase())
        for (const item of e?.components?.rentalList?.items || []) {
            if (typeof item?.type === 'string') ids.add(item.type.trim().toLowerCase())
        }
    }
    return [...ids].filter((id) => KNOWN.has(id)).sort((a, b) => ORDER.get(a) - ORDER.get(b))
}

const cache = new Map()
const loadType = (id) => {
    if (!cache.has(id)) cache.set(id, loaders[`./library/${id}.json`]())
    return cache.get(id)
}

/** The library cut to the types a project uses: `{ ...header, types }`. Loads each type's file once. */
export const loadProjectLibrary = async (entities) => {
    const ids = typeIdsUsedBy(entities)
    const types = await Promise.all(ids.map(loadType))
    return { library: index.library, howToRead: index.howToRead, generatedFrom: index.generatedFrom, types }
}

const EMPTY = Object.freeze({ library: index.library, types: Object.freeze([]) })
/** What useProjectLibrary returns while a project's types are on their way (empty, and not the answer yet). */
export const PENDING = Object.freeze({ library: index.library, types: Object.freeze([]), pending: true })

/**
 * The project's library as a hook: PENDING until its first types are in, then the same object until the set
 * of types changes and the new set is in (a view can memo on it). `entities` null, or none of the library's types used → empty.
 */
export function useProjectLibrary(entities) {
    const key = useMemo(() => (entities ? typeIdsUsedBy(entities).join(',') : ''), [entities])
    const [state, setState] = useState({ key: '', library: EMPTY })
    useEffect(() => {
        if (!key) return undefined
        let live = true
        loadProjectLibrary(key.split(',').map((type) => ({ components: { fixture: { type } } })))
            .then((library) => { if (live) setState({ key, library }) })
            .catch((error) => { console.error('[projectTypes] a fixture type did not load', error) })
        return () => { live = false }
    }, [key])
    if (!key) return EMPTY
    // a new kind placed: the lamps already drawn keep their types while its file loads (no blink)
    return state.key ? state.library : PENDING
}
