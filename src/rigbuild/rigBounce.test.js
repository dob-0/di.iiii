import { describe, expect, it } from 'vitest'
import { bounceOf, bounceSpecOf } from './rigBounce.js'

const spot = (id, intensity, color = '#ffffff', angle = 0.1, extra = {}) => ({
    id, type: 'spotLight', components: { light: { intensity, color, angle }, ...extra }
})
const spec = { area: 10000, reflectance: 0.2 }

describe('bounceOf — the integrating-sphere return', () => {
    it('E = Φ·ρ / (A·(1−ρ)), Φ = Σ I·2π(1−cos θ)', () => {
        const b = bounceOf([spot('a', 1000)], spec)
        const phi = 1000 * 2 * Math.PI * (1 - Math.cos(0.1))
        expect(b.intensity).toBeCloseTo((phi * 0.2) / (10000 * 0.8), 4)
        expect(b.color).toBe('#ffffff')
    })
    it('doubles with twice the light, and is nothing when nothing is lit', () => {
        const one = bounceOf([spot('a', 1000)], spec).intensity
        expect(bounceOf([spot('a', 1000), spot('b', 1000)], spec).intensity).toBeCloseTo(2 * one, 4)
        expect(bounceOf([spot('a', 0)], spec)).toEqual({ intensity: 0, color: '#000000', flux: 0 })
    })
    it('a red look returns red light, not grey', () => {
        const b = bounceOf([spot('a', 1000, '#ff1408')], spec)
        expect(b.color.slice(1, 3)).toBe('ff')
        expect(parseInt(b.color.slice(3, 5), 16)).toBeLessThan(0x30)
    })
    it('leaves strobes and blinders (flashes) out', () => {
        const b = bounceOf([spot('a', 1000), spot('s', 1e6, '#ffffff', 0.5, { rigFlash: { kind: 'strobe', level: 1 } })], spec)
        expect(b.intensity).toBeCloseTo(bounceOf([spot('a', 1000)], spec).intensity, 6)
    })
    it('no enclosure given: no bounce (every other room unchanged)', () => {
        expect(bounceOf([spot('a', 1000)], null)).toBeNull()
        expect(bounceSpecOf([spot('a', 1)])).toBeNull()
        expect(bounceSpecOf([{ id: 'show', components: { rigBounce: { area_m2: 25000, reflectance: 0.18 } } }])).toEqual({ area: 25000, reflectance: 0.18 })
        expect(bounceSpecOf([{ id: 'show', components: { rigBounce: { area_m2: 25000, reflectance: 1 } } }])).toBeNull()
    })
})

describe('the haze glow factor — the haze’s own scatter beside the walls’ return', () => {
    it('no volume or no haze: the walls’ return alone (factor 1)', async () => {
        const { hazeGlowFactor } = await import('./rigBounce.js')
        expect(hazeGlowFactor({ area: 28605, reflectance: 0.163 }, 0.05)).toBe(1)
        expect(hazeGlowFactor({ area: 28605, reflectance: 0.163, volume: 186890 }, 0)).toBe(1)
    })
    it('MOXIR at σ 0.05: τ = σ·4V/A ≈ 1.31, factor (ρ + 1 − e^−τ)/ρ ≈ 5.5', async () => {
        const { hazeGlowFactor } = await import('./rigBounce.js')
        const spec = { area: 28605, reflectance: 0.163, volume: 186890 }
        const tau = (0.05 * 4 * 186890) / 28605
        expect(tau).toBeCloseTo(1.31, 2)
        expect(hazeGlowFactor(spec, 0.05)).toBeCloseTo((0.163 + 1 - Math.exp(-tau)) / 0.163, 9)
        expect(hazeGlowFactor(spec, 0.05)).toBeGreaterThan(5)
        // thinner haze, less glow — and never more than all the flux scattered
        expect(hazeGlowFactor(spec, 0.015)).toBeLessThan(hazeGlowFactor(spec, 0.05))
        expect(hazeGlowFactor(spec, 10)).toBeLessThanOrEqual((0.163 + 1) / 0.163)
    })
})
