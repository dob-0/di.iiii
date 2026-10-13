// The browser's twin of the laser list in shared/laserMoments.cjs — THE laser list of di.iiii, read by the
// show page (server), the scene deck (src/rigbuild/sceneDeck/model.js) and the room's laser view
// (src/rigbuild/laserView.js). Kept equal by src/shared/laserTypes.test.js — change both or neither.
// `drive`: `dmx` from the desk, `frames` from the Nodes editor's Laser Out (shared/laserFrame.cjs).
export const LASER_TYPES = Object.freeze([
    Object.freeze({ id: 'up-la40wf', drive: 'dmx' }),
    Object.freeze({ id: 'ext-lc-ultra-mk2', drive: 'frames' })
])
export const LASER_TYPE_IDS = Object.freeze(LASER_TYPES.map((t) => t.id))

/** The project-carried types (rentalList.types) of a document, or of its entities. */
export const projectTypesOf = (documentOrEntities) => {
    const entities = Array.isArray(documentOrEntities) ? documentOrEntities : documentOrEntities?.entities
    const out = []
    for (const e of Array.isArray(entities) ? entities : []) {
        const types = e?.components?.rentalList?.types
        if (Array.isArray(types)) out.push(...types)
    }
    return out
}

/** The laser type ids for one project: the library's, plus every type it carries with `category: "laser"`. */
export const laserTypeIdsOf = (documentOrEntities) => {
    const ids = new Set(LASER_TYPE_IDS)
    for (const t of projectTypesOf(documentOrEntities)) {
        if (t && typeof t.id === 'string' && String(t.category || '').toLowerCase() === 'laser') ids.add(t.id.toLowerCase())
    }
    return ids
}
