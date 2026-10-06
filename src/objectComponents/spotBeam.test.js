import { describe, expect, it } from 'vitest'
import {
    BEAM_FADE_AT_MOUTH,
    DEFAULT_HAZE,
    UNLIMITED_THROW,
    beamFadeAt,
    beamCastsLight,
    beamFadeColors,
    beamIsVisible,
    spotBeamShape
} from './spotBeam.js'

describe('the beam in the air', () => {
    it('is off unless a room has switched it on', () => {
        // The compatibility promise: no `components.beam`, no cone. Every room
        // published before this lands looks exactly as it did.
        expect(beamIsVisible(undefined)).toBe(false)
        expect(beamIsVisible({})).toBe(false)
        expect(beamIsVisible({ visible: false })).toBe(false)
        expect(beamIsVisible({ visible: 'yes' })).toBe(false)
        expect(beamIsVisible({ visible: true })).toBe(true)
    })

    it('is as long as the lamp reaches and as wide as the lamp opens', () => {
        const { length, radius } = spotBeamShape({ distance: 12, angle: Math.PI / 6 })
        expect(length).toBe(12)
        expect(radius).toBeCloseTo(Math.tan(Math.PI / 6) * 12, 9)
    })

    it('hangs from the lamp, opening downward', () => {
        // A three.js cone is centred on itself with its tip at +Y. Half a length
        // down puts the tip at the lamp and the mouth at the far end of the
        // throw, along the -Y a spot is aimed down.
        expect(spotBeamShape({ distance: 10 }).position).toEqual([0, -5, 0])
    })

    it('gives an unlimited lamp a throw anyway', () => {
        // distance 0 means "no limit" to three.js, which is not a length.
        expect(spotBeamShape({ distance: 0 }).length).toBe(UNLIMITED_THROW)
        expect(spotBeamShape({}).length).toBe(UNLIMITED_THROW)
        expect(spotBeamShape({ distance: -4 }).length).toBe(UNLIMITED_THROW)
    })

    it('thickens with the haze and with how hard the lamp is driven', () => {
        const dim = spotBeamShape({ haze: 0.2, intensity: 2 }).opacity
        const thick = spotBeamShape({ haze: 0.8, intensity: 2 }).opacity
        expect(thick).toBeGreaterThan(dim)
        expect(spotBeamShape({ haze: 0.5, intensity: 4 }).opacity)
            .toBeGreaterThan(spotBeamShape({ haze: 0.5, intensity: 1 }).opacity)
    })

    it('goes out with the lamp — a fixture the desk has at zero shows no air', () => {
        // liveLight() hands a blacked-out fixture intensity 0; the beam must not
        // keep glowing in a room where the lamp is off.
        expect(spotBeamShape({ haze: 1, intensity: 0 }).opacity).toBe(0)
    })

    it('never reaches an opacity that reads as a solid object', () => {
        for (const intensity of [0, 2, 20, 500]) {
            for (const haze of [0, 0.5, 1, 40]) {
                const { opacity } = spotBeamShape({ haze, intensity })
                expect(opacity, `${haze}/${intensity}`).toBeGreaterThanOrEqual(0)
                expect(opacity, `${haze}/${intensity}`).toBeLessThanOrEqual(0.28)
            }
        }
    })

    it('does not get thicker and thicker as a lamp is driven harder', () => {
        // A lamp at 14 is not seven times as hazy as one at 2 — it is the same
        // air. The first cut scaled straight off intensity and the screenshot
        // showed two plastic cones standing in the room.
        expect(spotBeamShape({ haze: 1, intensity: 20 }).opacity)
            .toBeCloseTo(spotBeamShape({ haze: 1, intensity: 2 }).opacity, 9)
        expect(spotBeamShape({ haze: 1, intensity: 1 }).opacity)
            .toBeLessThan(spotBeamShape({ haze: 1, intensity: 2 }).opacity)
    })

    it('fades along the throw: full at the lamp, nearly gone at the mouth', () => {
        const at = (y) => beamFadeAt(y, 10)
        expect(at(5)).toBeCloseTo(1, 6)
        expect(at(-5)).toBeCloseTo(BEAM_FADE_AT_MOUTH, 6)
        expect(at(0)).toBeLessThan(at(2.5))
        expect(at(0)).toBeGreaterThan(at(-2.5))
        // Nonsense in, still a number between the two ends.
        expect(at(999)).toBeCloseTo(1, 6)
        expect(beamFadeAt(0, 0)).toBeGreaterThan(0)
    })

    it('hands the cone one greyscale fade per vertex, so the lamp keeps its colour', () => {
        const positions = [0, 5, 0, 1, -5, 0, 0, 0, 1]
        const colors = beamFadeColors(positions, 10)
        expect(colors).toHaveLength(9)
        expect(colors[0]).toBeCloseTo(1, 6)
        expect(colors[0]).toBe(colors[1])
        expect(colors[1]).toBe(colors[2])
        expect(colors[3]).toBeCloseTo(BEAM_FADE_AT_MOUTH, 6)
        expect(beamFadeColors(undefined, 10)).toHaveLength(0)
    })

    it('survives a document with nothing in it', () => {
        const shape = spotBeamShape()
        expect(shape.length).toBe(UNLIMITED_THROW)
        expect(shape.radius).toBeGreaterThan(0)
        expect(shape.opacity).toBeCloseTo(DEFAULT_HAZE * 0.16, 9)
        expect(spotBeamShape({ angle: Number.NaN, distance: 'x', intensity: null }).radius).toBeGreaterThan(0)
    })

    it('clamps a silly angle instead of drawing an infinite disc', () => {
        expect(spotBeamShape({ angle: 3, distance: 10 }).radius).toBeLessThan(10 * Math.tan(Math.PI / 2 - 0.009))
        expect(spotBeamShape({ angle: -1, distance: 10 }).radius).toBeGreaterThan(0)
    })

    it('casts real light unless the beam is drawn AND marked only', () => {
        // Every lamp saved before `only` existed keeps its light.
        expect(beamCastsLight(null)).toBe(true)
        expect(beamCastsLight(undefined)).toBe(true)
        expect(beamCastsLight({ visible: true, haze: 0.4 })).toBe(true)
        // The cone with no light behind it — a rig bigger than a browser can light.
        expect(beamCastsLight({ visible: true, only: true })).toBe(false)
        // A lamp with no beam and no light would be nothing at all.
        expect(beamCastsLight({ visible: false, only: true })).toBe(true)
        expect(beamCastsLight({ visible: true, only: 'yes' })).toBe(true)
    })
})

// MOXIR render audit (A), 2026-10-01: a rig lamp's `angle` is half its BEAM angle — the
// 50 % point of the datasheet — but three.js reads a SpotLight's angle as the 0 % CUTOFF.
// The pools on the floor were narrower than the beams that land on them, and the washes
// put ~2.4× too little light on the surfaces. The real light's cone is fitted instead.
describe('a rig lamp\'s real light, fitted to its beam angle', async () => {
    const { spotLightCone } = await import('./spotBeam.js')
    // three's spot falloff: smoothstep(cos(cutoff), cos(cutoff·(1−penumbra)), cos θ)
    const falloff = (theta, { angle, penumbra }) => {
        const lo = Math.cos(angle)
        const hi = Math.cos(angle * (1 - penumbra))
        const t = Math.min(1, Math.max(0, (Math.cos(theta) - lo) / (hi - lo)))
        return t * t * (3 - 2 * t)
    }
    it('crosses 50 % at the beam half-angle, for a wash and for a narrow beam', () => {
        for (const [half, penumbra] of [[0.1309, 0.5], [0.0157, 0.1], [0.218, 0.3]]) {
            const cone = spotLightCone({ angle: half, penumbra })
            expect(cone.angle).toBeGreaterThan(half)
            expect(falloff(half, cone)).toBeCloseTo(0.5, 2)
            expect(falloff(0, cone)).toBe(1)
        }
    })
    it('gives a wash a soft, wide field and a beam a hard edge (field = the 10 % point)', () => {
        const field = (cone) => { let t = 0; while (falloff(t, cone) > 0.1) t += cone.angle / 2000; return t }
        const wash = spotLightCone({ angle: 0.1309, penumbra: 0.5 })
        const beam = spotLightCone({ angle: 0.0157, penumbra: 0.1 })
        // three's falloff is a smoothstep in cos θ (quadratic in θ): at its softest the 10 %
        // edge is √(0.804/0.5) ≈ 1.27× the 50 % point — short of a real wash's ~1.8, the most
        // three can give. A beam's edge is harder: ~1.1×.
        expect(field(wash) / 0.1309).toBeGreaterThan(1.24)
        expect(field(beam) / 0.0157).toBeGreaterThan(1.05)
        expect(field(beam) / 0.0157).toBeLessThan(1.15)
        expect(wash.penumbra).toBeLessThanOrEqual(1)
        expect(beam.penumbra).toBeGreaterThan(0)
    })
})
