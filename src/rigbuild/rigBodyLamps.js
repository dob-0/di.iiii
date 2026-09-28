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

// A lens as lit as its lamp: a look that holds a lamp at 0 leaves its lens dark glass,
// not a lit dot of its colour (a view note, looks.js posedEntities `rigShown`).
const DARK_LENS = 0.06
export const lensColour = (hex, level) => {
    const l = Number(level)
    if (!Number.isFinite(l) || l >= 1) return hex
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex))
    if (!m) return hex
    const k = DARK_LENS + (1 - DARK_LENS) * Math.max(0, l)
    const n = parseInt(m[1], 16)
    return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('')}`
}

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
            colour: lensColour(e.components?.light?.color || '#ffffff', e.components?.rigShown?.level)
        }
    })
}
