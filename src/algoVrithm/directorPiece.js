import { ALGO_VRITHM_SPACE_ID } from './algoVrithmRouting.js'
import { ASSET_FOLDER, ASSET_LIBRARY } from './assetLibrary.js'
import AssetClip, { resolvePlacement } from './sequences/AssetClip.jsx'
import { SEQUENCES } from './sequences/index.js'
import {
    LIGHT_INTENSITIES,
    LIGHT_KINDS
} from '../timeline/worldLights.js'
import {
    LIGHT_SWATCHES,
    WORLD_SWATCHES,
    paletteWarning
} from './palette.js'

// This piece, described for the director.
//
// It used to live in src/raw/director/pieces.js — inside the TOOL — which is
// what made the general director an editor for one artwork and pulled this
// piece's 88 MB media bin into every bundle. A piece describes itself; the
// tool reads descriptors through the works registry and imports nothing from
// any work. See src/works/works.js.

export const ALGOVRITHM_PIECE = {
    id: ALGO_VRITHM_SPACE_ID,
    label: 'algovrithm',
    baseline: SEQUENCES,
    // Where "save to this space" writes. The director's hook used to have this
    // id compiled into it; naming it here is what let that hook become general.
    savesToSpace: ALGO_VRITHM_SPACE_ID,
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

export default ALGOVRITHM_PIECE
