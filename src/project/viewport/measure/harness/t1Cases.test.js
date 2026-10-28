import { describe, expect, it } from 'vitest'
import { spotLightCone } from '../../../../objectComponents/spotBeam.js'
import { FITTED_FALLOFF_AT_HALF, FITTED_LAMP, T1_CASES, T1_CANDELA, T1_DISTANCE_M, WIDE_LAMP, beamRadiusAt, checkReading } from './t1Cases.js'

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
    it("the rig's fitted cone: the expected half-angle reading is the model's own falloff there (0.646, not 0.5)", () => {
        const c = spotLightCone(FITTED_LAMP)
        const at = smoothstep(Math.cos(c.angle), Math.cos(c.angle * (1 - c.penumbra)), Math.cos(FITTED_LAMP.angle))
        expect(at).toBeCloseTo(FITTED_FALLOFF_AT_HALF, 12)
        // the stated limit: lumens kept at the same peak puts 64.6 % at the published half-angle (a 50 % beam angle
        // would read 0.5); if spotBeam.js changes its fit, this number moves and the header must be re-read
        expect(at).toBeCloseTo(0.646, 3)
        expect(byName['fitted-half-angle'].expected).toBeCloseTo(at * (T1_CANDELA / T1_DISTANCE_M ** 2) * Math.cos(FITTED_LAMP.angle) ** 3, 10)
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

describe('the control', () => {
    it('the work light at its MOXIR level fails the 60° point and would not fail the axis', () => {
        // #a39c92 in linear Rec.709, luminance × 0.1 / sceneScale 0.02
        const lin = (c) => ((c / 255 + 0.055) / 1.055) ** 2.4
        const Y = 0.2126 * lin(0xa3) + 0.7152 * lin(0x9c) + 0.0722 * lin(0x92)
        const extra = (0.1 * Y) / 0.02
        expect(extra).toBeCloseTo(1.7, 1)
        expect(checkReading(byName['off-axis-60'].expected, byName['off-axis-60'].expected + extra).pass).toBe(false)
        expect(checkReading(byName.axis.expected, byName.axis.expected + extra).pass).toBe(true)
    })
})
