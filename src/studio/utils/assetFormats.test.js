import { describe, expect, it } from 'vitest'
import { canPlaceInScene } from './assetFormats.js'
import { MODEL_FORMATS, detectModelFormatFromMeta } from '../../utils/modelFormats.js'

// Regression: OBJ/STL loaders existed for years but Studio's placement
// whitelist only knew glb/gltf, so "+ Add" and viewport drop rejected files
// the renderer could display; FBX uploaded fine and rendered nothing.
describe('model format placement', () => {
    it('every format ModelObject can load is placeable in the scene', () => {
        for (const name of ['a.glb', 'b.gltf', 'c.obj', 'd.stl', 'e.fbx']) {
            expect(canPlaceInScene({ name, mimeType: 'application/octet-stream' }), name).toBe(true)
        }
    })

    it('detects fbx from name and mime', () => {
        expect(detectModelFormatFromMeta({ name: 'rig.fbx' })).toBe(MODEL_FORMATS.FBX)
        expect(detectModelFormatFromMeta({ name: 'x', mimeType: 'application/fbx' })).toBe(MODEL_FORMATS.FBX)
    })

    it('mtl companion files stay non-placeable (paired, not standalone)', () => {
        expect(canPlaceInScene({ name: 'tex.mtl', mimeType: 'application/octet-stream' })).toBe(false)
    })
})
