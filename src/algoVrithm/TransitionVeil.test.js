import { describe, expect, it } from 'vitest'
import { GLITCH_TICK_HZ } from './TransitionVeil.jsx'

describe('the glitch veil', () => {
    it('re-rolls below the photosensitive band', () => {
        // Full-field flicker between 15 and 25Hz is the classic photosensitive
        // seizure trigger. The glitch covers the entire view at the crossing
        // point of every handover, so its tick rate is a safety property, not
        // a style choice — anyone "making the glitch faster" has to come
        // through this test and read this comment first.
        expect(GLITCH_TICK_HZ).toBeGreaterThan(0)
        expect(GLITCH_TICK_HZ).toBeLessThan(15)
    })
})
