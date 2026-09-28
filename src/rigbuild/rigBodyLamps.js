// THE LAMPS WHOSE BODIES A ROOM DRAWS — from the document alone. Pure.
// docs/architecture/RIG_BUILD.md §12.4.
//
// Every surface that draws a room (the space view, the Studio and the rooms beside the
// plot and the cards) draws the same steel around the same lamps: a lamp is any entity
// with a typed `components.fixture` (sheet.js isLamp), its mount and beam come from
// plotData — the function the plot, the patch sheet and the MVR already use — and its
// lens takes the light's colour. A hidden lamp draws no body, and a lamp nested under a
// group is left out (its transform is parent-relative; the rig writes none).
//
// The same list `FixtureBodies` takes in view A, so the four rooms can never disagree
// about where a head is turned.

import { plotData } from './sheet.js'

export { hasRigLamps } from './hasRigLamps.js'

/**
 * @param {object[]} entities  the document's entities (look-posed, if a look is showing)
 * @param {object} library     a type library (libraryWithShow(...) for a show's own types)
 * @returns {{id: string, type: string, mount: number[], hung: boolean, beam: number[], colour: string}[]}
 */
export const rigBodyLamps = (entities = [], library) => {
    const shown = entities.filter((e) => !e.parentId && e.components?.runtime?.visible !== false)
    const byId = new Map(shown.map((e) => [e.id, e]))
    return plotData({ entities: shown, library }).lamps.map((l) => {
        const e = byId.get(l.id)
        return {
            id: l.id,
            type: e.components.fixture.type,
            mount: l.mount,
            hung: l.hung,
            beam: l.beam,
            colour: e.components?.light?.color || '#ffffff'
        }
    })
}
