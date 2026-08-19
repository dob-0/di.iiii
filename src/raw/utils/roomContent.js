import { getNodeType } from '../../project/nodeRegistry.js'

// The room behind the graph earns its place only when something would stand
// in it (owner, 2026-08-20: "its clear till you add geo"). A clear desk is
// flat paper — the graph surface's own grid — and the room appears the moment
// the first thing exists at this level to stand in it.
//
// A node counts when it renders spatial-3d IN THE CURRENT SCOPE, with one
// exception: an unparented Light draws nothing (it is the scope's light rig,
// not a lamp — RawViewport returns null for it), so it cannot be the reason
// a room appears. A World/Scene does not count either: it is panel-2d and the
// backdrop deliberately does not see through it, so a desk holding only a
// Scene card would otherwise show an empty room pretending to be the scene.
export function scopeHasRoomContent(nodes, scopeId) {
    const scope = scopeId || null
    return (nodes || []).some((node) => {
        if ((node.parentId || null) !== scope) return false
        if (getNodeType(node?.typeId)?.render !== 'spatial-3d') return false
        if (node.typeId === 'world.light' && !node.parentId) return false
        return true
    })
}
