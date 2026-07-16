import { getNodeType } from '../nodeRegistry.js'

// Pure node-value construction for node-graph authoring: given a node type
// and where it was placed, compute the initial `values` payload (3D spatial
// lift for world-placed nodes, a floating-window frame for panel nodes).
// No dispatch, no side effects — the caller owns turning this into an op.
// workspaceTop/topZIndex are passed in rather than read from a shared
// context so this stays usable outside Beta's floating-window shell.
export const buildNodeValues = (definitionId, params, place, { workspaceTop = 0, topZIndex = 6 } = {}) => {
    const type = getNodeType(definitionId)
    const render = type?.render || 'hidden'
    const values = { ...(params || {}) }
    if (render === 'spatial-3d' && place?.point) {
        const liftY = definitionId === 'geom.cube' ? 0.5 : 1.2
        values.position = [
            place.point[0] || 0,
            Math.max(liftY, (place.point[1] || 0) + liftY),
            place.point[2] || 0
        ]
    }
    if (render === 'panel-2d') {
        const isWorldNode = definitionId === 'universe.world'
        const defaultW = isWorldNode ? 680 : 360
        const defaultH = isWorldNode ? 480 : 280
        const defaultX = isWorldNode
            ? Math.max(16, (place?.clientX ?? 400) - 340)
            : ((place?.clientX ?? 280) - 180)
        values.frame = {
            x: defaultX,
            y: Math.max(workspaceTop + 24, (place?.clientY ?? (workspaceTop + 180)) - 36),
            width: defaultW,
            height: defaultH,
            zIndex: topZIndex + 1,
            title: params?.title || type?.label || definitionId,
            visible: true
        }
    }
    return values
}

// A root node (e.g. Beta's "Node 0") is a normal, deletable node in the
// document, but the topbar/back-navigation UI in both Beta and Studio's
// graph views depends on one existing — deleting it silently removes that
// whole UI with no way back except a page reload. Callers should confirm
// with the user before deleting a node this returns true for; the actual
// confirmation UI/wording stays with the caller since that's lane-specific.
export const isRootGraphNode = (node, rootTypeId) =>
    Boolean(node && rootTypeId && node.typeId === rootTypeId)
