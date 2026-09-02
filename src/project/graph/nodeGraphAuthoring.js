import { getNodeType } from '../nodeRegistry.js'

// Pure node-value construction for node-graph authoring: given a node type
// and where it was placed, compute the initial `values` payload (3D spatial
// lift for world-placed nodes, a floating-window frame for panel nodes).
// No dispatch, no side effects — the caller owns turning this into an op.
// workspaceTop/topZIndex are passed in rather than read from a shared
// context so this stays usable outside Raw's floating-window shell.
// Where to stand a new object so it does not land inside something already
// there. A widening ring rather than a line: a row marches off into the
// distance and is off-camera by the fifth object, while a ring keeps everything
// in shot and reads as a scene being arranged rather than a queue.
const PLACEMENT_STEP = 1.4
const PLACEMENT_CLEARANCE = 0.9

// True when nothing has actually chosen where this object stands: either no
// position at all, or the type's own declared default, which is what the
// palette hands in for every node it creates.
const isUnchosenPosition = (type, position) => {
    if (position === undefined) return true
    if (!Array.isArray(position)) return true
    const declared = (type?.inputs || []).find((port) => port.id === 'position')?.default
    if (!Array.isArray(declared)) return false
    return declared.length === position.length
        && declared.every((value, index) => value === position[index])
}

export const findFreeSpot = (occupied = [], liftY = 0.5) => {
    const taken = (occupied || []).filter((spot) => Array.isArray(spot) && spot.length >= 3)
    const clear = (x, z) => taken.every((spot) => Math.hypot((spot[0] || 0) - x, (spot[2] || 0) - z) >= PLACEMENT_CLEARANCE)
    if (clear(0, 0)) return [0, liftY, 0]
    // Rings of 8, stepping outward. Bounded: 6 rings is 48 places, and a room
    // with 48 things in it does not need this to be clever.
    for (let ring = 1; ring <= 6; ring += 1) {
        const radius = ring * PLACEMENT_STEP
        for (let i = 0; i < 8; i += 1) {
            const angle = (i / 8) * Math.PI * 2
            const x = Math.round(Math.cos(angle) * radius * 1000) / 1000
            const z = Math.round(Math.sin(angle) * radius * 1000) / 1000
            if (clear(x, z)) return [x, liftY, z]
        }
    }
    return [0, liftY, 0]
}

// `occupied` is the 3D positions of the spatial nodes already in the scope the
// new node is joining. Optional: callers that do not pass it get the old
// behaviour, which is why every existing call site is unchanged.
export const buildNodeValues = (definitionId, params, place, { workspaceTop = 0, topZIndex = 6, occupied = [] } = {}) => {
    const type = getNodeType(definitionId)
    const render = type?.render || 'hidden'
    const values = { ...(params || {}) }
    if (render === 'spatial-3d') {
        // A Geo is a PLACE: it stands on the floor and its children carry
        // their own lifts. Lifting it 1.2 like a primitive left every geo's
        // contents floating at eye height — two geos read as one broken pair
        // of hovering clones (measured, 2026-08-20).
        const liftY = definitionId === 'geom.geo' ? 0 : definitionId === 'geom.cube' ? 0.5 : 1.2
        if (place?.point) {
            // Placed by pointing INTO the room: put it where they pointed.
            values.position = [
                place.point[0] || 0,
                Math.max(liftY, (place.point[1] || 0) + liftY),
                place.point[2] || 0
            ]
        } else if (isUnchosenPosition(type, values.position)) {
            // Placed from the graph canvas, where there is no 3D point.
            //
            // The test is "did anyone actually CHOOSE this position", not "is it
            // missing" — the palette hands every type's declared defaults in as
            // params, so `position` is always already set to the type's own
            // default by the time this runs. Checking for undefined looked
            // right, passed its unit tests, and did nothing at all in the app:
            // every object still took the type default and the second thing you
            // made landed exactly inside the first.
            values.position = findFreeSpot(occupied, liftY)
        }
    }
    if (render === 'panel-2d') {
        const isWorldNode = definitionId === 'universe.world'
        // A type can declare the size it actually needs (`defaultFrame` in the
        // registry). Without that every panel opened at one generic card size,
        // which is fine for a text note and useless for a timeline.
        const defaultW = type?.defaultFrame?.width ?? (isWorldNode ? 680 : 360)
        const defaultH = type?.defaultFrame?.height ?? (isWorldNode ? 480 : 280)
        // Placed on the CANVAS (place.graphX present — Raw's palette): the
        // window lives in graph space and has no position of its own yet, so
        // it sits beside its card and follows it until someone moves it
        // (resolveGraphWindowFrame). Legacy callers that pass only client
        // coordinates keep the old viewport-pixel frame.
        const onCanvas = Number.isFinite(Number(place?.graphX)) && Number.isFinite(Number(place?.graphY))
        const defaultX = isWorldNode
            ? Math.max(16, (place?.clientX ?? 400) - 340)
            : ((place?.clientX ?? 280) - 180)
        values.frame = onCanvas
            ? {
                space: 'graph',
                width: defaultW,
                height: defaultH,
                zIndex: topZIndex + 1,
                title: params?.title || type?.label || definitionId,
                visible: true
            }
            : {
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

// A root node (e.g. Raw's "Node 0") is a normal, deletable node in the
// document, but the topbar/back-navigation UI in both Raw and Studio's
// graph views depends on one existing — deleting it silently removes that
// whole UI with no way back except a page reload. Callers should confirm
// with the user before deleting a node this returns true for; the actual
// confirmation UI/wording stays with the caller since that's lane-specific.
export const isRootGraphNode = (node, rootTypeId) =>
    Boolean(node && rootTypeId && node.typeId === rootTypeId)
