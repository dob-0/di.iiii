import { describe, expect, it } from 'vitest'

import { QUALITY_STEPS, START_QUALITY, TARGET_FPS, hasRoom, cappedDpr, nextQuality, qualityDpr } from './qualityGovernor.js'

describe('the frame-rate governor', () => {
    it('climbs to the best notch on a 60 Hz screen: a rate at the screen\'s own ceiling has room, a slow one has not', () => {
        expect(hasRoom(59.6, 59.9)).toBe(true)                    // at the ceiling of a 60 Hz screen
        expect(nextQuality(2, 59.6, 9000, 59.9)).toBe(1)
        expect(nextQuality(1, 59.6, 9000, 59.9)).toBe(0)          // all the way to full
        expect(nextQuality(2, 59.6, 3000, 59.9)).toBe(2)          // not before it has held
        expect(hasRoom(56, 59.9)).toBe(false)                     // under the ceiling: this notch is already work
        expect(hasRoom(40, 40)).toBe(false)                       // a weak phone steady at 40 is not at a ceiling
        expect(nextQuality(2, 40, 9000, 40)).toBe(3)              // it steps down
        expect(hasRoom(120, 0)).toBe(true)
    })

    it('starts a room at the middle notch: bloom still on, resolution capped for a phone, room to go both ways', () => {
        const step = QUALITY_STEPS[START_QUALITY]
        expect(START_QUALITY).toBeGreaterThan(0)
        expect(START_QUALITY).toBeLessThan(QUALITY_STEPS.length - 1)
        expect(step.bloom).toBe(true)
        expect(qualityDpr(START_QUALITY, { dprMin: 1, dprMax: 2 }, 3)).toBe(1.25) // a phone of DPR 3 draws at 1.25
        expect(nextQuality(START_QUALITY, 90, 9000)).toBe(START_QUALITY - 1)      // a strong card climbs
        expect(nextQuality(START_QUALITY, 30)).toBe(START_QUALITY + 1)            // a weak one steps down
    })

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
