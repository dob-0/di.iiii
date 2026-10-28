// SOLID STEEL STOPS A BEAM (owner, 2026-10-14, physics first: "nothing passes through a wall, roof, floor - or steel").
// beamReach.js only counted the building (the hall model); the rig's own steel — a crane bridge, a truss, a girder — is
// a separate entity and stopped nothing. Which entities are steel is decided here, by what they ARE, never by a name:
//   - a build piece whose catalogue record is a truss or a tower (components.piece, src/rigbuild/pieces.js), or
//   - an entity that says so: `components.occluder = { kind: 'steel' }` (a crane bridge, a girder, a pipe, a scaffold
//     that is a plain box or a model, not a catalogue piece). The flag is data on the entity, written by the build
//     (scripts/rigbuild/epic-build.mjs) or by hand; nothing here knows what a project calls its crane.
// A lamp is never steel (its body and mount never stop its own beam); a stage deck is not counted (not asked).
import { pieceOf } from '../rigbuild/pieces.js'

export const OCCLUDER_COMPONENT = 'occluder'
export const STEEL_KIND = 'steel'
const STEEL_PIECE_CATEGORIES = new Set(['truss', 'tower'])

export const isSteelEntity = (entity) => {
    const c = entity?.components
    if (!c || c.light || c.fixture) return false
    if (c[OCCLUDER_COMPONENT]?.kind === STEEL_KIND) return true
    const category = c.piece?.kind ? pieceOf(c.piece.kind)?.category : null
    return STEEL_PIECE_CATEGORIES.has(category)
}
