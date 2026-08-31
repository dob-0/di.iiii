import { WORKS } from '../../works/works.js'
import { workPieceLoader } from '../../works/routes.jsx'

// WHAT A PIECE IS, as far as the director is concerned.
//
// The director used to import algovrithm directly, which made it that piece's
// editor rather than a tool. A descriptor was introduced to fix that, and this
// file carried the claim "THIS FILE is the only part of the director that
// knows algovrithm exists" — which was not true: thirteen sibling files
// imported the piece for the timeline maths, the clock, the light model and
// the camera. Those are the TOOL and now live in src/timeline; the descriptor
// itself is the PIECE's and now lives beside it, in src/algoVrithm.
//
// So this file names no work at all. It asks the registry which works declare
// a director, and loads a descriptor on demand.
//
// Fields a descriptor carries:
//   id           stable key, and the space the piece lives at
//   label        what the picker shows
//   baseline     the committed edit list. Saving diffs the draft against this,
//                so it must be the array as it is ON DISK, not a copy of the
//                draft — see handleSave in DirectorPanel.jsx.
//   savesToSpace the space "save to this space" writes timing into, or absent
//                if the piece does not persist
//   assetLibrary droppable assets, already resolved to ids/kinds/urls
//   assetFolder  where those live, shown in the panel so the author knows
//                where to put a new file
//   AssetClip    the component an asset row renders through
//   resolvePlacement  how a row's polar numbers become a position
//   palette      the swatches and light vocabulary the pickers offer. A
//                piece's colours are an argument it is making, not a default
//                the tool should impose.
//
// Deliberately NOT in a descriptor: the timeline maths, the light model, the
// clock and the source patcher. Those are the tool — every piece gets the same
// ones, and a piece that wanted its own would be a different tool rather than
// a different descriptor.

export const PIECE_IDS = WORKS.filter((work) => work.director).map((work) => work.id)

/**
 * Load a piece's descriptor. Async because a descriptor reaches the piece's
 * own modules — its sequences, its media bin — and the director must not put
 * those in the bundle everyone downloads. Returns null for an id no work
 * claims, and under DI_PROFILE=local for every work, since that build carries
 * no works at all. DirectorPanelWindow renders its empty state for both, which
 * is the truthful answer in each case.
 */
export const loadPiece = async (id) => {
    const load = workPieceLoader(id)
    if (!load) return null
    const module = await load()
    return module?.default ?? null
}
