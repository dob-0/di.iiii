import { describe, expect, it } from 'vitest'
import { cutawayPlan, computeRoomFrame, layersForPreset, planWithLayers } from './smartViewGeometry.js'

// Cinema House 2026-11-01: on the room page (Cut off by default, N730) Top and Floor drew every ceiling slab.
describe('plan views cut the roof even when the building stands whole', () => {
    const frame = computeRoomFrame({ archBox: { min: [-8.5, -0.3, -72.3], max: [32.2, 7.6, 0.2] }, roofMinY: 2.33 })
    const whole = { roof: true, walls: true, machines: true, outside: true, cut: false }
    const fromAbove = cutawayPlan([11.8, 242, -36], frame)
    it('the room page default drops the cut (the bug, measured live: drawPlan.roof null)', () => {
        expect(planWithLayers(fromAbove, frame, whole).roof).toBe(null)
    })
    it('Top and Floor cut at the roof line while the camera sits at them', () => {
        for (const id of ['top', 'floor']) expect(planWithLayers(fromAbove, frame, layersForPreset(whole, id)).roof).toBeCloseTo(2.28, 2)
    })
    it('any other view, or the visitor taking the camera, keeps the building whole', () => {
        expect(layersForPreset(whole, 'high')).toBe(whole)
        expect(layersForPreset(whole, null)).toBe(whole)
        expect(planWithLayers(fromAbove, frame, layersForPreset(whole, null)).roof).toBe(null)
    })
})
