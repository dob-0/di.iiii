import { describe, expect, it } from 'vitest'
import { spotLightCone } from '../../../../objectComponents/spotBeam.js'
import { FITTED_LAMP, T1_CASES, T1_CANDELA, T1_DISTANCE_M, WIDE_LAMP, beamRadiusAt, checkReading } from './t1Cases.js'

const smoothstep = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
}
const byName = Object.fromEntries(T1_CASES.flatMap((c) => c.probes.map((p) => [p.name, p])))

describe('T1 reference values (inverse square and cosine law)', () => {
    it('on axis: I/d² = 305 lx for 30 500 cd at 10 m', () => {
        expect(byName.axis.expected).toBeCloseTo(305, 10)
    })
    it('cosine law and cos³ on the plane', () => {
        expect(byName['tilt-30'].expected).toBeCloseTo(264.1377, 3)
        expect(byName['tilt-60'].expected).toBeCloseTo(152.5, 10)
        expect(byName['off-axis-30'].expected).toBeCloseTo(198.1034, 3)
        expect(byName['off-axis-60'].expected).toBeCloseTo(38.125, 10)
    })
    it('the wide lamp lights 60° off axis at full intensity (three falloff = 1 there)', () => {
        const cone = WIDE_LAMP.angle
        const pen = Math.cos(cone * (1 - WIDE_LAMP.penumbra))
        expect(smoothstep(Math.cos(cone), pen, Math.cos((60 * Math.PI) / 180))).toBe(1)
    })
    it("the rig's fitted cone gives three's falloff 0.5 at the beam half-angle", () => {
        const c = spotLightCone(FITTED_LAMP)
        const at = smoothstep(Math.cos(c.angle), Math.cos(c.angle * (1 - c.penumbra)), Math.cos(FITTED_LAMP.angle))
        expect(at).toBeCloseTo(0.5, 6)
        expect(byName['fitted-half-angle'].expected).toBeCloseTo(0.5 * (T1_CANDELA / T1_DISTANCE_M ** 2) * Math.cos(FITTED_LAMP.angle) ** 3, 10)
    })
    it('the beam self-check radius grows with the throw', () => {
        expect(beamRadiusAt(0)).toBe(0.05)
        expect(beamRadiusAt(10)).toBeCloseTo(0.05 + 10 * Math.tan((2 * Math.PI) / 180), 12)
    })
    it('a reading passes inside 1 % only', () => {
        expect(checkReading(305, 307.9).pass).toBe(true)
        expect(checkReading(305, 310).pass).toBe(false) // the work light's +5 lx: the control must fail
        expect(checkReading(305, NaN).pass).toBe(false)
    })
})
