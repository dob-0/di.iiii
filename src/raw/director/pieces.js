import { ASSET_FOLDER, ASSET_LIBRARY } from '../../algoVrithm/assetLibrary.js'
import AssetClip, { resolvePlacement } from '../../algoVrithm/sequences/AssetClip.jsx'
import { SEQUENCES } from '../../algoVrithm/sequences/index.js'
import {
    LIGHT_INTENSITIES,
    LIGHT_KINDS,
    LIGHT_SWATCHES,
    WORLD_SWATCHES,
    paletteWarning
} from '../../algoVrithm/palette.js'

// WHAT A PIECE IS, as far as the director is concerned.
//
// The director used to import algovrithm directly, which made it that piece's
// editor rather than a tool. Everything piece-specific now arrives through one
// of these descriptors, and THIS FILE is the only part of the director that
// knows algovrithm exists. A second piece is a second entry here plus its own
// modules; the panel does not change.
//
// What is deliberately NOT in a descriptor: the timeline maths, the light
// model, the clock and the source patcher. Those are the tool — every piece
// gets the same ones, and a piece that wanted its own would be a different
// tool rather than a different descriptor.
//
// Fields:
//   id           stable key. Also the save allow-list key (see vite.config.js)
//                — a piece the server does not know cannot be written to,
//                and the browser never sends a path.
//   label        what the picker shows
//   baseline     the committed edit list. Saving diffs the draft against this,
//                so it must be the array as it is ON DISK, not a copy of the
//                draft — see handleSave in DirectorPanel.jsx.
//   assetLibrary droppable assets, already resolved to ids/kinds/urls
//   assetFolder  where those live, shown in the panel so the author knows
//                where to put a new file
//   AssetClip    the component an asset row renders through
//   resolvePlacement  how a row's polar numbers become a position
//   palette      the swatches and light vocabulary the pickers offer. A
//                piece's colours are an argument it is making, not a default
//                the tool should impose — algovrithm's live in its own
//                palette.js and stay there.

export const ALGOVRITHM_PIECE = {
    id: 'algovrithm',
    label: 'algovrithm',
    baseline: SEQUENCES,
    assetLibrary: ASSET_LIBRARY,
    assetFolder: ASSET_FOLDER,
    AssetClip,
    resolvePlacement,
    palette: {
        worldSwatches: WORLD_SWATCHES,
        lightSwatches: LIGHT_SWATCHES,
        lightKinds: LIGHT_KINDS,
        lightIntensities: LIGHT_INTENSITIES,
        warn: paletteWarning
    }
}

export const PIECES = {
    [ALGOVRITHM_PIECE.id]: ALGOVRITHM_PIECE
}

export const getPiece = (id) => PIECES[id] || ALGOVRITHM_PIECE

export const PIECE_IDS = Object.keys(PIECES)
