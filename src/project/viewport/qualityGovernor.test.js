import { describe, expect, it } from 'vitest'

import { QUALITY_STEPS, TARGET_FPS, cappedDpr, nextQuality, qualityDpr } from './qualityGovernor.js'

describe('the frame-rate governor', () => {
    it('steps down a notch under the target and not at it', () => {
        expect(nextQuality(0, TARGET_FPS - 5)).toBe(1)
        expect(nextQuality(0, TARGET_FPS + 1)).toBe(0)
        expect(nextQuality(QUALITY_STEPS.length - 1, 10)).toBe(QUALITY_STEPS.length - 1)
    })

    it('keeps R3F\'s re-apply of the Canvas dpr under the notch (it snapped back to full before)', () => {
        const cap = qualityDpr(4, { dprMin: 1, dprMax: 2 }, 2)
        expect(cap).toBe(1)
        // what R3F's configure() asks for on every parent render: the Canvas prop [1, 2]
        expect(cappedDpr([1, 2], cap, 2)).toBe(1)
        expect(cappedDpr([1, 2], Infinity, 2)).toBe(2)
        expect(cappedDpr([1, 2], Infinity, 1.25)).toBe(1.25)
        expect(cappedDpr(1.5, 1.25, 2)).toBe(1.25)
    })
})

describe('no see-saw', () => {
    it('does not climb back to a notch that was too slow a moment ago', async () => {
        const { mayRaiseTo, RETRY_AFTER_MS } = await import('./qualityGovernor.js')
        const tooSlowAt = { 2: 10000 }
        expect(mayRaiseTo(2, tooSlowAt, 20000)).toBe(false)
        expect(mayRaiseTo(2, tooSlowAt, 10000 + RETRY_AFTER_MS)).toBe(true)
        expect(mayRaiseTo(1, tooSlowAt, 20000)).toBe(true)
    })
})
