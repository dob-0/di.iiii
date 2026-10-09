import { describe, expect, it } from 'vitest'
import { ACESFilmicToneMapping, AgXToneMapping } from 'three'
import {
    HALF_FLOAT_MAX, REC709_Y, ev100ForExposure, exposureForEv100, illuminanceFromPatch, luminanceOf, meanRgb,
    operatorInputScale, overflowed, profileStats, relativeError, toPhysical
} from './measureMath.js'

describe('EV100 (Lagarde & de Rousiers 2014 §5.1)', () => {
    it('states the MOXIR camera: exposure 3.5, sceneScale 0.02', () => {
        // without the operator's own input scale: the figure the method report gives (≈ 3.6)
        expect(ev100ForExposure(3.5, { sceneScale: 0.02, toneMapping: AgXToneMapping })).toBeCloseTo(Math.log2(1 / (1.2 * 3.5 * 0.02)), 10)
        expect(ev100ForExposure(3.5, { sceneScale: 0.02, toneMapping: AgXToneMapping })).toBeCloseTo(3.573, 3)
        // three's ACES multiplies its input by 1/0.6 more: the same scene is a brighter camera
        expect(ev100ForExposure(3.5, { sceneScale: 0.02, toneMapping: ACESFilmicToneMapping })).toBeCloseTo(2.8365, 4)
    })
    it('round-trips exposure ↔ EV100 for every operator', () => {
        for (const toneMapping of [ACESFilmicToneMapping, AgXToneMapping, undefined]) {
            for (const ev of [-2, 0, 3, 7.5]) {
                const x = exposureForEv100(ev, { sceneScale: 0.02, toneMapping })
                expect(ev100ForExposure(x, { sceneScale: 0.02, toneMapping })).toBeCloseTo(ev, 10)
            }
        }
    })
    it('one stop more EV100 is half the exposure', () => {
        expect(exposureForEv100(4, { sceneScale: 1 }) / exposureForEv100(3, { sceneScale: 1 })).toBeCloseTo(0.5, 12)
    })
    it('counts three.js ACES input scale (1/0.6) and nothing else', () => {
        expect(operatorInputScale(ACESFilmicToneMapping)).toBeCloseTo(1 / 0.6, 12)
        expect(operatorInputScale(AgXToneMapping)).toBe(1)
    })
    it('refuses a missing or zero scale instead of guessing', () => {
        expect(() => exposureForEv100(3, { sceneScale: 0 })).toThrow()
        expect(() => ev100ForExposure(0, { sceneScale: 0.02 })).toThrow()
        expect(() => exposureForEv100('x', { sceneScale: 1 })).toThrow()
    })
})

describe('photometric conversions', () => {
    it('Rec.709 luminance weights sum to 1 (white in = white out)', () => {
        expect(REC709_Y.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
        expect(luminanceOf(2, 2, 2)).toBeCloseTo(2, 12)
        expect(luminanceOf(1, 0, 0)).toBeCloseTo(0.2126, 12)
    })
    it('a ρ = 1 Lambertian patch: E = π·L', () => {
        expect(illuminanceFromPatch(1)).toBeCloseTo(Math.PI, 12)
        expect(illuminanceFromPatch(305 / Math.PI)).toBeCloseTo(305, 10)
        expect(illuminanceFromPatch(1, 0.5)).toBeCloseTo(2 * Math.PI, 12)
    })
    it('scene units → physical only with a known scale', () => {
        expect(toPhysical(6.1, 0.02)).toBeCloseTo(305, 10)
        expect(toPhysical(6.1, null)).toBeNull()
        expect(toPhysical(6.1, 0)).toBeNull()
    })
    it('flags the half-float ceiling', () => {
        expect(overflowed(HALF_FLOAT_MAX)).toBe(true)
        expect(overflowed(Infinity)).toBe(true)
        expect(overflowed(NaN)).toBe(true)
        expect(overflowed(65000, 1, 0)).toBe(false)
    })
    it('averages RGBA pixels and reports an overflowed one', () => {
        const px = new Float32Array([1, 2, 3, 1, 3, 4, 5, 1])
        expect(meanRgb(px)).toEqual({ rgb: [2, 3, 4], overflow: false, pixels: 2 })
        expect(meanRgb(new Float32Array([Infinity, 0, 0, 1])).overflow).toBe(true)
    })
    it('relative error', () => {
        expect(relativeError(101, 100)).toBeCloseTo(0.01, 12)
    })
})

describe('beam profile statistics', () => {
    const gaussian = (sigma, bg = 0, n = 801, span = 6) =>
        Array.from({ length: n }, (_, i) => {
            const x = ((i / (n - 1)) * 2 - 1) * span * sigma
            return { x, L: bg + 100 * Math.exp(-(x * x) / (2 * sigma * sigma)) }
        })
    it('finds the 50 % and 10 % full widths of a Gaussian', () => {
        const s = profileStats(gaussian(0.4))
        expect(s.width50).toBeCloseTo(2 * Math.sqrt(2 * Math.LN2) * 0.4, 3) // FWHM 2.3548σ
        expect(s.width10).toBeCloseTo(2 * Math.sqrt(2 * Math.log(10)) * 0.4, 3) // 4.2919σ
        expect(s.peakX).toBeCloseTo(0, 6)
        expect(s.integral).toBeCloseTo(100 * 0.4 * Math.sqrt(2 * Math.PI), 1)
    })
    it('subtracts the background beside the beam before measuring', () => {
        const s = profileStats(gaussian(0.4, 7))
        expect(s.background).toBeCloseTo(7, 3)
        expect(s.peak).toBeCloseTo(100, 3)
        expect(s.width50).toBeCloseTo(2.3548 * 0.4, 3)
    })
    it('says null when the profile does not fall far enough inside the span', () => {
        // rising to the edge of the span: no fall on the right
        const s = profileStats(Array.from({ length: 101 }, (_, i) => ({ x: i / 100, L: i * i })))
        expect(s.width50).toBeNull()
        expect(s.width10).toBeNull()
    })
})
