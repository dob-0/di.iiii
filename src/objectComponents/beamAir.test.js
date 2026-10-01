import { describe, expect, it } from 'vitest'
import { atmosphereOf, beamAirRadiance, beamChord, beamIlluminance, hgPhase } from './beamAir.js'

describe('hgPhase — Henyey–Greenstein', () => {
    it('integrates to 1 over the sphere for any g', () => {
        for (const g of [0, 0.5, 0.7, 0.85]) {
            let sum = 0
            const n = 20000
            for (let i = 0; i < n; i += 1) {
                const theta = ((i + 0.5) / n) * Math.PI
                sum += hgPhase(Math.cos(theta), g) * 2 * Math.PI * Math.sin(theta) * (Math.PI / n)
            }
            expect(sum).toBeCloseTo(1, 3)
        }
    })
    it('is isotropic at g = 0 and forward-peaked at g > 0', () => {
        expect(hgPhase(0.3, 0)).toBeCloseTo(1 / (4 * Math.PI), 6)
        expect(hgPhase(1, 0.7)).toBeGreaterThan(50 * hgPhase(0, 0.7))
    })
})

describe('beamIlluminance — the lens-wide virtual source', () => {
    it('is three.js\'s own I/d² with no aperture', () => {
        expect(beamIlluminance(1000, 10, 0, Math.tan(0.1))).toBeCloseTo(10, 6)
    })
    it('tends to I/d² far from the lens and stays finite at it', () => {
        const t = Math.tan(0.0157)
        const far = beamIlluminance(1e6, 2000, 0.08, t)
        expect(far / (1e6 / 2000 ** 2)).toBeGreaterThan(0.99)
        expect(Number.isFinite(beamIlluminance(1e6, 0, 0.08, t))).toBe(true)
        // At the lens: I·tan²θ/a², the beam's flux spread over the lens.
        expect(beamIlluminance(1e6, 0, 0.08, t)).toBeCloseTo((1e6 * t * t) / 0.0064, 3)
    })
})

describe('beamChord — where a view ray is inside the beam', () => {
    const beam = { aperture: 0.08, tanHalf: Math.tan(0.1), length: 10 }
    it('a ray across the beam 5 m down crosses its full diameter', () => {
        const R = 0.08 + 5 * Math.tan(0.1)
        const chord = beamChord([-10, -5, 0], [1, 0, 0], beam)
        expect(chord[1] - chord[0]).toBeCloseTo(2 * R, 5)
        expect(chord[0]).toBeCloseTo(10 - R, 5)
    })
    it('a ray that passes beside it misses', () => {
        expect(beamChord([-10, -5, 3], [1, 0, 0], beam)).toBeNull()
    })
    it('a ray past the end of the throw, or above the lens, misses', () => {
        expect(beamChord([-10, -12, 0], [1, 0, 0], beam)).toBeNull()
        expect(beamChord([-10, 0.5, 0], [1, 0, 0], beam)).toBeNull()
    })
    it('looking straight up the beam from under its end: the whole throw', () => {
        const chord = beamChord([0, -15, 0], [0, 1, 0], beam)
        expect(chord[0]).toBeCloseTo(5, 5)
        expect(chord[1]).toBeCloseTo(15, 5)
    })
    it('from inside the beam, the chord starts at the eye', () => {
        const chord = beamChord([0, -5, 0], [1, 0, 0], beam)
        expect(chord[0]).toBe(0)
        expect(chord[1]).toBeCloseTo(0.08 + 5 * Math.tan(0.1), 5)
    })
})

describe('beamAirRadiance — the shader\'s sum', () => {
    const air = { scattering: 0.03, anisotropy: 0.7 }
    const lamp = { candela: 1e6, aperture: 0.08, tanHalf: Math.tan(0.0157), length: 12, edge: 0.02, samples: 64 }
    it('side-on, a thin beam gives σs · p(90°) · E · chord · T (the small-width limit)', () => {
        const s = 6
        const eye = 14
        const R = lamp.aperture + s * lamp.tanHalf
        const L = beamAirRadiance([-eye, -s, 0], [1, 0, 0], { ...lamp, ...air })
        const apexY = lamp.aperture / lamp.tanHalf
        // the scattering angle at the axis: between the ray from the virtual source and the eye
        const cos = 0 // the source's rays at the axis point straight down; the eye looks across
        const expected = air.scattering * hgPhase(cos, air.anisotropy) * beamIlluminance(1e6, s, lamp.aperture, lamp.tanHalf) * 2 * R * Math.exp(-air.scattering * (s + eye))
        expect(apexY).toBeGreaterThan(0)
        expect(L / expected).toBeGreaterThan(0.95)
        expect(L / expected).toBeLessThan(1.05)
    })
    it('blazes looking back up the beam toward the lamp (forward scattering)', () => {
        const side = beamAirRadiance([-14, -6, 0], [1, 0, 0], { ...lamp, ...air })
        const dir = [0.2, 1, 0]
        const n = Math.hypot(...dir)
        const up = beamAirRadiance([-2.4, -18, 0], dir.map((v) => v / n), { ...lamp, ...air })
        expect(up).toBeGreaterThan(side * 10)
    })
    it('no haze, no light in the air', () => {
        expect(beamAirRadiance([-14, -6, 0], [1, 0, 0], { ...lamp, scattering: 0, anisotropy: 0.7 })).toBe(0)
    })
})

describe('atmosphereOf', () => {
    it('is null without a haze — the old cones', () => {
        expect(atmosphereOf({})).toBeNull()
        expect(atmosphereOf({ atmosphere: { scattering: 0 } })).toBeNull()
        expect(atmosphereOf(null)).toBeNull()
    })
    it('reads scattering and anisotropy, clamped', () => {
        expect(atmosphereOf({ atmosphere: { scattering: 0.04, anisotropy: 0.7 } })).toEqual({ scattering: 0.04, anisotropy: 0.7, haze: null })
        expect(atmosphereOf({ atmosphere: { scattering: 5, anisotropy: 2 } })).toEqual({ scattering: 1, anisotropy: 0.95, haze: null })
    })
    it('a room that works its haze out from its machines needs no hand-set scattering', () => {
        expect(atmosphereOf({ atmosphere: { haze: { volume_m3: 9000 } } })).toEqual({ scattering: 0.03, anisotropy: 0.7, haze: { volume_m3: 9000 } })
        expect(atmosphereOf({ atmosphere: { scattering: 0.02 } }).anisotropy).toBe(0.7)
    })
})

describe('the beam\'s cross-section — beam angle 50 %, field angle 10 %', () => {
    it('is half the centre at the beam angle, whatever the edge', async () => {
        const { beamProfile } = await import('./beamAir.js')
        for (const edge of [0.2, 0.5, 1]) expect(beamProfile(1, edge)).toBeCloseTo(0.5, 9)
        expect(beamProfile(0, 0.5)).toBe(1)
    })
    it('a soft lamp (a wash) is a Gaussian: field ≈ 1.82 × beam', async () => {
        const { beamProfile } = await import('./beamAir.js')
        const field = Math.sqrt(Math.log(10) / Math.LN2)
        expect(beamProfile(field, 1)).toBeCloseTo(0.1, 9)
    })
    it('a hard lamp (a beam fixture) falls off steeply: under 15 % by 1.2 × the beam angle', async () => {
        const { beamProfile } = await import('./beamAir.js')
        expect(beamProfile(1.2, 0.2)).toBeLessThan(0.15)
        expect(beamProfile(1.2, 1)).toBeGreaterThan(0.3)
    })
    it('the hull reaches where the light has fallen to 2 % — the same floor the shader uses', async () => {
        const { beamExtent, beamProfile, PROFILE_FLOOR } = await import('./beamAir.js')
        for (const edge of [0.2, 0.6, 1]) expect(beamProfile(beamExtent(edge), edge)).toBeCloseTo(PROFILE_FLOOR, 9)
        const fs = await import('node:fs')
        const path = await import('node:path')
        const shader = fs.readFileSync(path.resolve(process.cwd(), 'src/objectComponents/beamAirMaterial.js'), 'utf8')
        expect(shader).toContain(`log(1.0 / ${PROFILE_FLOOR})`)
    })
})
