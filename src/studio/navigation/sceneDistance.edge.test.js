// Edges of the scene-distance helpers that sceneDistance.test.js (on #892) leaves open. Pure functions only.
import { describe, expect, it } from 'vitest'
import { centreMedian, isSeeThrough, medianDistance, nextSceneDistance } from './sceneDistance.js'
import { NAVIGATION_PRESETS } from './mappings.js'

describe('which tool takes its speed from the view', () => {
    it('the Blender tool does, the Sketchfab tool does not', () => {
        expect(NAVIGATION_PRESETS.blender.speedFromView).toBe(true)
        expect(NAVIGATION_PRESETS.studio.speedFromView).toBeFalsy()
    })
})

describe('medianDistance: junk never decides', () => {
    it('drops NaN, Infinity and negatives; a lone hit is the answer', () => {
        expect(medianDistance([NaN, Infinity, -3, 0, 8])).toBe(8)
        expect(medianDistance([NaN, -1])).toBeNull()
        expect(medianDistance([])).toBeNull()
    })
})

describe('centreMedian: grid edges', () => {
    it('a centre exactly half full still decides (the half is "at least")', () => {
        const w = 3, h = 3, grid = [9, 9, 9, 9, 4, 9, 9, 9, 9] // one centre cell: full
        expect(centreMedian(grid, w, h)).toBe(4)
        const w2 = 6, h2 = 3, g2 = new Array(w2 * h2).fill(50)
        g2[1 * w2 + 2] = 7; g2[1 * w2 + 3] = 0 // centre = 2 cells, one hit: exactly half
        expect(centreMedian(g2, w2, h2)).toBe(7)
    })
    it('nothing anywhere is null', () => {
        expect(centreMedian(new Array(12).fill(0), 4, 3)).toBeNull()
    })
})

describe('isSeeThrough: slots and holes', () => {
    it('a hidden material, a missing one and an all-faded array are see-through; a nearly opaque fade is not', () => {
        expect(isSeeThrough({ visible: false })).toBe(true)
        expect(isSeeThrough(null)).toBe(true)
        expect(isSeeThrough([{ depthWrite: false }, null])).toBe(true)
        expect(isSeeThrough({ transparent: true, opacity: 0.99 })).toBe(false)
    })
})

describe('nextSceneDistance: the range and the first notch', () => {
    it('inside a run the clamp to the controls\' range still wins over the ratio', () => {
        expect(nextSceneDistance({ measured: 900, previous: 450, consecutive: true, max: 500 })).toBe(500)
        expect(nextSceneDistance({ measured: 0.01, previous: 0.4, consecutive: true, min: 0.35 })).toBe(0.35)
    })
    it('the first notch of a run (not consecutive) takes the measure even when it is far from the previous distance', () => {
        expect(nextSceneDistance({ measured: 40, previous: 1, consecutive: false })).toBe(40)
    })
    it('nothing measured and nothing before is null, whatever the range', () => {
        expect(nextSceneDistance({ measured: 0, previous: 0, min: 1, max: 5 })).toBeNull()
    })
})
