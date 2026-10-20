import { useEffect, useState } from 'react'

// DOES A DOCUMENT'S GRAPH MAKE A ROOM? (2026-10-15)
//
// The public page draws a document with nodes through the node lane's RawViewport (PublicGraphSurface, "a graph
// publishes as the room it makes", 5c6e9045), because only it draws spatial nodes beside the entities. But a graph
// that draws nothing in the room — a VJ Deck feeding the screens, a TOP network, a desk's macro — made the page pick
// that surface too, and RawViewport has none of the room's own light: no HDR path, no tone mapping at the room's
// exposure, no haze, no bloom, no Show/Tech plan (RenderSettingsEffect never mounts there). MOXIR v2-11 holds one
// VJ Deck node: its room page was drawn near black while the Studio, which always draws the room with StudioViewport,
// was lit — measured mean luma 10.5 vs 68.5 /255, same look, same camera (room-vs-studio-report.md).
//
// So the graph surface is chosen only when the graph DRAWS in the room: a Scene (World) node, or a node whose type
// renders 'spatial-3d' (RawViewport's own isSpatialNode). Everything else is drawn by StudioViewport, the same
// renderer the Studio uses.

export const WORLD_NODE_TYPE = 'universe.world'

/** Pure: does any node draw in the room? `typeOf(typeId)` is the node registry's getNodeType. */
export const graphMakesRoom = (nodes, typeOf) => (Array.isArray(nodes) ? nodes : []).some((node) => (
    node?.typeId === WORLD_NODE_TYPE || typeOf?.(node?.typeId)?.render === 'spatial-3d'
))

// the node registry, once loaded (it is one module for the page's life)
let registry = null
const loadRegistry = () => import('../nodeRegistry.js').then((m) => { registry = m; return m })

/**
 * The same answer for a component: false at once for a document with no nodes (nearly every page: the 136 KB node
 * registry is never loaded for it), null while the registry loads the first time, then true / false — computed
 * synchronously ever after, so a document re-read (a sync tick) never blanks the room.
 */
export function useGraphMakesRoom(nodes) {
    const list = Array.isArray(nodes) ? nodes : null
    const has = Boolean(list && list.length)
    const [loaded, setLoaded] = useState(() => Boolean(registry))
    const [failed, setFailed] = useState(false)
    useEffect(() => {
        if (!has || registry) return undefined
        let gone = false
        loadRegistry()
            .then(() => { if (!gone) setLoaded(true) })
            // the registry did not load (a stale chunk after a deploy): keep the old rule, the graph surface
            .catch(() => { if (!gone) setFailed(true) })
        return () => { gone = true }
    }, [has])
    if (!has) return false
    if (failed) return true
    if (!registry && !loaded) return null
    return graphMakesRoom(list, registry.getNodeType)
}
