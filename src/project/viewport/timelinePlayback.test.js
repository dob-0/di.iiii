import { describe, expect, it } from 'vitest'
import { hasTimelineTracks, sampleTimeline, timelineTime } from './timelinePlayback.js'

const timeline = {
    duration: 4,
    loop: true,
    tracks: [
        {
            property: 'position',
            keys: [
                { t: 0, value: [0, 0, 0], easing: 'linear' },
                { t: 2, value: [4, 0, 0], easing: 'linear' }
            ]
        },
        {
            property: 'opacity',
            keys: [
                { t: 0, value: 1, easing: 'linear' },
                { t: 4, value: 0, easing: 'ease' }
            ]
        }
    ]
}

describe('timelinePlayback', () => {
    it('interpolates linear segments and holds past the last key', () => {
        expect(sampleTimeline(timeline, 1).position).toEqual([2, 0, 0])
        expect(sampleTimeline(timeline, 3).position).toEqual([4, 0, 0])
    })

    it('loops elapsed time over duration; clamps when loop is off', () => {
        expect(timelineTime(timeline, 5)).toBe(1)
        expect(timelineTime({ ...timeline, loop: false }, 9)).toBe(4)
        expect(timelineTime({ ...timeline, loop: false }, -1)).toBe(0)
    })

    it('eases scalar tracks with smoothstep midpoint intact', () => {
        // smoothstep is symmetric: at half the segment the value is halfway
        expect(sampleTimeline(timeline, 2).opacity).toBeCloseTo(0.5)
        // but eased: at a quarter it lags a linear ramp
        expect(sampleTimeline(timeline, 1).opacity).toBeGreaterThan(0.75)
    })

    it('returns null without keyed tracks', () => {
        expect(sampleTimeline({ duration: 4, tracks: [{ property: 'position', keys: [] }] }, 1)).toBeNull()
        expect(hasTimelineTracks(timeline)).toBe(true)
        expect(hasTimelineTracks(null)).toBe(false)
    })
})
