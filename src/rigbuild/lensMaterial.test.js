import { describe, expect, it } from 'vitest'
import { LENS_SIDE_GLOW, lensGlowOf, lensLuminance } from './lensMaterial.js'

describe('the lens as a source', () => {
    const glow = lensGlowOf({ intensity: 1e6, aperture: 0.08, angle: 0.0157, penumbra: 0.1 })
    it('down the beam: the lamp’s intensity over the lens, I / (π a²)', () => {
        expect(glow[0]).toBeCloseTo(1e6 / (Math.PI * 0.0064), 0)
        expect(lensLuminance(glow, 1)).toBeCloseTo(glow[0] + LENS_SIDE_GLOW, 0)
    })
    it('half of it at the beam angle, the glass glow only from the side or behind', () => {
        const atBeam = Math.cos(0.0157)
        expect((lensLuminance(glow, atBeam) - LENS_SIDE_GLOW) / glow[0]).toBeCloseTo(0.5, 2)
        expect(lensLuminance(glow, Math.cos(0.5))).toBeCloseTo(LENS_SIDE_GLOW, 3)
        expect(lensLuminance(glow, -0.5)).toBe(LENS_SIDE_GLOW)
    })
    it('a lamp that is off has no source in its lens', () => {
        expect(lensGlowOf({ intensity: 1e6, on: false })[0]).toBe(0)
    })
})
