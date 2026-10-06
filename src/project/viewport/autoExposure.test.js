import { describe, expect, it } from 'vitest'
import { ADAPT_TAU_S, EXPOSURE_KEY, GAIN_MAX, GAIN_MIN, autoExposureOf } from './autoExposure.js'

describe('renderSettings.exposure — the camera adapts', () => {
    it('is on by default in a room drawn through the HDR path, with the stated limits', () => {
        expect(autoExposureOf({})).toEqual({ key: EXPOSURE_KEY, min: GAIN_MIN, max: GAIN_MAX, tau: ADAPT_TAU_S })
    })
    it('a room can turn it off, or set its own key and limits', () => {
        expect(autoExposureOf({ exposure: { auto: false } })).toBeNull()
        expect(autoExposureOf({ exposure: { key: 0.05, max: 2 } })).toMatchObject({ key: 0.05, max: 2 })
    })
    it('never opens a dark look more than the stated stops', () => {
        expect(GAIN_MAX).toBeLessThanOrEqual(4)
        expect(GAIN_MIN).toBeGreaterThan(0)
    })
})
