import { describe, expect, it } from 'vitest'
import {
    LARGE_GLB_THRESHOLD_BYTES,
    formatAssetSize,
    shouldSuggestGlbOptimization
} from './assetOptimization.js'

describe('asset optimization suggestions', () => {
    it('suggests optimization only for large, unoptimized GLB files', () => {
        expect(
            shouldSuggestGlbOptimization({ name: 'gallery.glb', size: LARGE_GLB_THRESHOLD_BYTES })
        ).toBe(true)
        expect(
            shouldSuggestGlbOptimization({
                name: 'gallery.glb',
                size: LARGE_GLB_THRESHOLD_BYTES - 1
            })
        ).toBe(false)
        expect(
            shouldSuggestGlbOptimization({
                name: 'gallery.optimized.glb',
                size: LARGE_GLB_THRESHOLD_BYTES
            })
        ).toBe(false)
        expect(
            shouldSuggestGlbOptimization({
                name: 'gallery.fbx',
                size: LARGE_GLB_THRESHOLD_BYTES * 2
            })
        ).toBe(false)
    })

    it('formats asset sizes for the decision dialog', () => {
        expect(formatAssetSize(512 * 1024)).toBe('512 KB')
        expect(formatAssetSize(12.25 * 1024 * 1024)).toBe('12.3 MB')
    })
})
