import { describe, expect, it } from 'vitest'
import { Color, MeshStandardMaterial } from 'three'
import { FLOOR_DEFAULTS, overriddenMaterial, roughnessAt, surfacesOf } from './surfaces.js'

describe('renderSettings.surfaces — the hall’s floor corrected at load', () => {
    it('off unless a room asks; the floor takes its stated defaults', () => {
        expect(surfacesOf({})).toBeNull()
        expect(surfacesOf({ surfaces: { floor: {} } })).toEqual({ floor: FLOOR_DEFAULTS })
        expect(surfacesOf({ surfaces: { floor: { enabled: false } } })).toBeNull()
    })
    it('keeps the sampled hue, scales its level, and sets the finish — on a copy', () => {
        const original = new MeshStandardMaterial({ name: 'floor', color: new Color(0.094, 0.069, 0.046), roughness: 0.95 })
        const m = overriddenMaterial(original, FLOOR_DEFAULTS)
        expect(m).not.toBe(original)
        expect(original.roughness).toBe(0.95)
        expect(m.roughness).toBe(0.6)
        expect(m.color.r / m.color.g).toBeCloseTo(0.094 / 0.069, 6)
        expect(m.color.r).toBeCloseTo(0.094 * 1.7, 6)
    })
    it('the wear varies the finish across the floor within ± variation', () => {
        const values = []
        for (let x = 0; x < 100; x += 3.7) for (let z = 0; z < 24; z += 2.3) values.push(roughnessAt(x, z, FLOOR_DEFAULTS))
        expect(Math.min(...values)).toBeGreaterThanOrEqual(0.35 - 1e-9)
        expect(Math.max(...values)).toBeLessThanOrEqual(0.85 + 1e-9)
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.2)
    })
})
