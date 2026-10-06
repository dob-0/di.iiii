import { describe, expect, it } from 'vitest'
import { beamProfileAt } from './beamAir.js'
import { GOBO_PATTERNS, PRISM_SPREAD_DEG, beamOpticsOf, beamShape, frostWiden, goboMask, opticsSpreadTan } from './beamOptics.js'

// The light across the beam at depth s, summed over a grid (flux, in arbitrary units).
const flux = (optics, { R = 0.2, p = 6, s = 12, half = 4, n = 240 } = {}) => {
    let sum = 0
    const h = (2 * half) / n
    for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
            sum += beamShape(-half + (i + 0.5) * h, -half + (j + 0.5) * h, R, p, s, optics)
        }
    }
    return sum * h * h
}

describe('beamOpticsOf', () => {
    it('is nothing in the path when the beam says nothing', () => {
        expect(beamOpticsOf(null)).toEqual({ prism: null, honeycomb: null, frost: 0, gobo: null })
        expect(beamOpticsOf({ optics: { gobo: { pattern: 99 } } }).gobo).toBeNull()
    })
    it('cleans what a look or the desk sends', () => {
        const o = beamOpticsOf({ optics: { prism: { facets: 16, rotation: 0.3 }, honeycomb: {}, frost: 2, gobo: { pattern: 4 } } })
        expect(o).toEqual({ prism: { facets: 16, rotation: 0.3 }, honeycomb: { rotation: 0 }, frost: 1, gobo: { pattern: 4, rotation: 0 } })
    })
})

describe('the beam with nothing in its path is the plain beam', () => {
    it('beamShape = the profile', () => {
        const none = beamOpticsOf(null)
        for (const u of [0, 0.5, 1, 1.4]) expect(beamShape(u * 0.2, 0, 0.2, 6, 12, none)).toBeCloseTo(beamProfileAt(u, 6), 12)
    })
})

describe('a prism splits the light, it does not make more', () => {
    const plain = flux(beamOpticsOf(null))
    it('16 facets far from the lens: the same flux, in a ring', () => {
        const optics = beamOpticsOf({ optics: { prism: { facets: 16 } } })
        expect(flux(optics) / plain).toBeGreaterThan(0.9)
        expect(flux(optics) / plain).toBeLessThan(1.1)
        // the centre is dark, the ring is lit, at s · tan(spread) out
        const d = 12 * Math.tan((PRISM_SPREAD_DEG * Math.PI) / 180)
        expect(beamShape(0, 0, 0.2, 6, 12, optics)).toBeLessThan(0.01)
        expect(beamShape(d, 0, 0.2, 6, 12, optics)).toBeGreaterThan(0.04)
    })
    it('the honeycomb: the same flux in seven beams', () => {
        const optics = beamOpticsOf({ optics: { honeycomb: {} } })
        expect(flux(optics) / plain).toBeGreaterThan(0.9)
        expect(flux(optics) / plain).toBeLessThan(1.1)
    })
    it('near the lens the parts still overlap: drawn as one wider beam, still the same flux', () => {
        const optics = beamOpticsOf({ optics: { prism: { facets: 16 } } })
        expect(flux(optics, { s: 0.5 }) / flux(beamOpticsOf(null), { s: 0.5 })).toBeGreaterThan(0.85)
    })
})

describe('frost and gobos', () => {
    it('frost widens the angle; the candela falls by its square (beamAirMaterial)', () => {
        expect(frostWiden(0)).toBe(1)
        expect(frostWiden(1)).toBe(3)
    })
    it('every gobo blocks some light and lets some through', () => {
        for (let pattern = 1; pattern <= GOBO_PATTERNS; pattern += 1) {
            let open = 0
            const n = 4000
            for (let i = 0; i < n; i += 1) {
                const u = Math.sqrt((i + 0.5) / n)
                const a = i * 2.39996323
                open += goboMask(pattern, u, a)
            }
            expect(open / n, `gobo ${pattern}`).toBeGreaterThan(0.05)
            expect(open / n, `gobo ${pattern}`).toBeLessThan(0.95)
        }
    })
    it('the hull reaches the split beams: wider by the prism\'s and the honeycomb\'s spread', () => {
        expect(opticsSpreadTan(beamOpticsOf(null))).toBe(0)
        expect(opticsSpreadTan(beamOpticsOf({ optics: { prism: {}, honeycomb: {} } }))).toBeGreaterThan(Math.tan((PRISM_SPREAD_DEG * Math.PI) / 180))
    })
})
