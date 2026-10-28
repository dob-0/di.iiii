// WHERE A BEAM STOPS IN THE NODES SCENE — physics first: a lamp's beam ends at the first surface it meets.
//
// The cast (src/objectComponents/beamReach.js, mounted in SpotLightObject) looks only at meshes under a group
// tagged `userData.svBuilding`; Studio tags its architecture objects (studio/utils/pickPriority.js), and a node
// scene had nothing tagged, so a Lamp's beam there ran on to its miss length through every shape. The solid
// shapes below are tagged instead. Not tagged: lights and lamps (a beam does not stop on another lamp's light),
// a Line (no surface), the camera, screens and sound, and containers (a Geo would tag everything inside it,
// including a lamp's own body).
export const BEAM_STOPPING_NODE_KINDS = Object.freeze(new Set([
    'geom.cube', 'geom.sphere', 'geom.plane', 'geom.cylinder', 'geom.cone', 'geom.torus',
    'geom.circle', 'geom.model', 'geom.constructor'
]))

export const nodeStopsBeams = (typeId) => BEAM_STOPPING_NODE_KINDS.has(typeId)

// The node's group userData: the tag for a solid shape, nothing for the rest. A fresh object each time — the
// group owns its userData, and other code may write to it.
export const beamStopUserData = (typeId) => (nodeStopsBeams(typeId) ? { svBuilding: true } : undefined)
