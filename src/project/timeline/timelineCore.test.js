import { describe, expect, it } from 'vitest'
import {
    analyseTimeline,
    canSplitClip,
    clipEnd,
    clipProgress,
    clipSpeed,
    formatFrames,
    formatTimecode,
    MAX_CLIP_SPEED,
    MIN_CLIP_FRAMES,
    MIN_CLIP_SPEED,
    moveClip,
    removeClip,
    rippleFrom,
    setClipDuration,
    setClipDurationRipple,
    setClipSpeed,
    sortByStart,
    sourceFrameAt,
    splitClip,
    timelinePosition,
    totalDuration,
    trimClip,
    validateClips
} from './timelineCore.js'

const clip = (id, at, dur, extra = {}) => ({ id, source: 's0', at, dur, in: 0, ...extra })

// Three clips, 60fps, with a deliberate 10-frame cross-fade between b and c.
const chain = () => [
    clip('a', 0, 120),
    clip('b', 120, 120),
    clip('c', 230, 120)
]

describe('geometry', () => {
    it('reports the end and the total', () => {
        expect(clipEnd(clip('a', 30, 90))).toBe(120)
        expect(totalDuration(chain())).toBe(350)
    })

    it('orders by position, then by end', () => {
        const out = sortByStart([clip('c', 230, 120), clip('a', 0, 120), clip('b', 120, 120)])
        expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    })

    it('formats both timecode forms', () => {
        expect(formatTimecode(90, 60)).toBe('0:01.5')
        expect(formatTimecode(3690, 60)).toBe('1:01.5')
        expect(formatFrames(3690, 60)).toBe('1:01:30')
        expect(formatTimecode(-10, 60)).toBe('0:00.0')
    })
})

describe('moving and trimming', () => {
    it('moves without changing length, and never goes negative', () => {
        const out = moveClip(chain(), 'b', 200)
        expect(out[1]).toMatchObject({ at: 200, dur: 120 })
        expect(moveClip(chain(), 'b', -50)[1].at).toBe(0)
    })

    it('trims the head by walking the in-point, keeping speed', () => {
        const out = trimClip([clip('a', 0, 120, { in: 0, srcDur: 120 })], 'a', 'start', 30)
        expect(out[0]).toMatchObject({ at: 30, dur: 90, in: 30, srcDur: 90 })
        expect(clipSpeed(out[0])).toBe(1)
    })

    it('trims the head by re-stretching when retiming', () => {
        const out = trimClip([clip('a', 0, 120, { srcDur: 120 })], 'a', 'start', 30, { retime: true })
        expect(out[0]).toMatchObject({ at: 30, dur: 90, in: 0, srcDur: 120 })
    })

    it('keeps the opposite edge put when trimming the tail', () => {
        const out = trimClip([clip('a', 60, 120, { srcDur: 120 })], 'a', 'end', 120)
        expect(out[0]).toMatchObject({ at: 60, dur: 60 })
    })

    it('refuses to trim a clip below the minimum', () => {
        const out = trimClip([clip('a', 0, 120)], 'a', 'start', 119)
        expect(out[0].dur).toBe(MIN_CLIP_FRAMES)
    })
})

describe('ripple', () => {
    it('slides later clips by the delta and preserves the cross-fade', () => {
        const before = chain()
        const overlapBefore = clipEnd(before[1]) - before[2].at
        const out = setClipDurationRipple(before, 'a', 180)

        expect(out[0].dur).toBe(180)
        expect(out[1].at).toBe(180)
        expect(out[2].at).toBe(290)
        expect(clipEnd(out[1]) - out[2].at).toBe(overlapBefore)
    })

    it('leaves everything alone when the duration does not change', () => {
        const before = chain()
        expect(setClipDurationRipple(before, 'a', 120)).toBe(before)
    })

    it('does not move clips that start at or before the target', () => {
        const out = setClipDurationRipple(chain(), 'b', 180)
        expect(out[0].at).toBe(0)
        expect(out[2].at).toBe(290)
    })

    it('pushes everything from a pivot onwards', () => {
        const out = rippleFrom(chain(), 'b', 60)
        expect(out.map((c) => c.at)).toEqual([0, 180, 290])
    })

    it('resizing without ripple leaves neighbours where they are', () => {
        const out = setClipDuration(chain(), 'a', 180)
        expect(out[1].at).toBe(120)
    })
})

describe('the razor', () => {
    it('splits the window and the material at the same proportion', () => {
        const out = splitClip([clip('a', 0, 120, { in: 0, srcDur: 120 })], 'a', 30)
        expect(out).toHaveLength(2)
        expect(out[0]).toMatchObject({ id: 'a', at: 0, dur: 30, in: 0, srcDur: 30 })
        expect(out[1]).toMatchObject({ id: 'a-b', at: 30, dur: 90, in: 30, srcDur: 90 })
    })

    it('keeps both halves at the original speed', () => {
        const fast = [clip('a', 0, 120, { in: 0, srcDur: 240 })]
        const out = splitClip(fast, 'a', 60)
        expect(clipSpeed(out[0])).toBe(2)
        expect(clipSpeed(out[1])).toBe(2)
    })

    it('stays continuous when splitting an already-split clip', () => {
        const once = splitClip([clip('a', 0, 120, { in: 0, srcDur: 120 })], 'a', 60)
        const twice = splitClip(once, 'a-b', 90)
        const [, head, tail] = twice
        expect(head.in + head.srcDur).toBe(tail.in)
    })

    it('gives the tail a fresh id even when the obvious one is taken', () => {
        const taken = [clip('a', 0, 120), clip('a-b', 200, 60)]
        const out = splitClip(taken, 'a', 60)
        expect(out.map((c) => c.id)).toEqual(['a', 'a-b2', 'a-b'])
    })

    it('returns the same reference when the cut is impossible', () => {
        const before = [clip('a', 0, 120)]
        expect(splitClip(before, 'a', 0)).toBe(before)
        expect(splitClip(before, 'a', 120)).toBe(before)
        expect(splitClip(before, 'nope', 60)).toBe(before)
        expect(canSplitClip(before, 'a', 1)).toBe(false)
        expect(canSplitClip(before, 'a', 60)).toBe(true)
    })
})

describe('speed', () => {
    it('retimes without moving or resizing', () => {
        const out = setClipSpeed([clip('a', 30, 120, { srcDur: 120 })], 'a', 2)
        expect(out[0]).toMatchObject({ at: 30, dur: 120, srcDur: 240 })
        expect(clipSpeed(out[0])).toBe(2)
    })

    it('clamps to the usable range', () => {
        const one = [clip('a', 0, 120, { srcDur: 120 })]
        expect(clipSpeed(setClipSpeed(one, 'a', 99)[0])).toBe(MAX_CLIP_SPEED)
        expect(clipSpeed(setClipSpeed(one, 'a', 0)[0])).toBe(MIN_CLIP_SPEED)
    })

    it('holds the last frame past the end of a fast clip', () => {
        const fast = clip('a', 0, 120, { in: 0, srcDur: 240 })
        expect(clipProgress(fast, 60)).toBe(1)
        expect(clipProgress(fast, 120)).toBe(2)
        expect(sourceFrameAt(fast, 120)).toBe(239)
    })

    it('reads the right source frame partway through', () => {
        const c = clip('a', 100, 120, { in: 500, srcDur: 120 })
        expect(sourceFrameAt(c, 100)).toBe(500)
        expect(sourceFrameAt(c, 160)).toBe(560)
    })
})

describe('analysis', () => {
    it('finds a gap that no adjacent pair reveals', () => {
        // a covers 0-300, b sits inside it, c starts after a ends. The hole
        // between a and c is invisible to a pairwise scan because b overlaps
        // both of its neighbours.
        const clips = [clip('a', 0, 300), clip('b', 50, 100), clip('c', 400, 100)]
        const { gaps } = analyseTimeline(clips)
        expect(gaps).toEqual([{ at: 300, until: 400 }])
    })

    it('reports a leading gap', () => {
        expect(analyseTimeline([clip('a', 60, 120)]).gaps).toEqual([{ at: 0, until: 60 }])
    })

    it('separates hard cuts from cross-fades', () => {
        const { cuts, overlaps } = analyseTimeline(chain())
        expect(cuts).toEqual([{ at: 120 }])
        expect(overlaps).toEqual([{ at: 230, until: 240 }])
    })

    it('is empty-safe', () => {
        expect(analyseTimeline([])).toEqual({ gaps: [], cuts: [], overlaps: [], total: 0, orderedIds: [] })
    })
})

describe('playhead', () => {
    it('reports what is live and what is next', () => {
        const { live, next, framesToNext } = timelinePosition(chain(), 235)
        expect(live.map((c) => c.id)).toEqual(['b', 'c'])
        expect(next).toBeNull()
        expect(timelinePosition(chain(), 60).next.id).toBe('b')
        expect(timelinePosition(chain(), 60).framesToNext).toBe(60)
        expect(framesToNext).toBeNull()
    })
})

describe('validation', () => {
    it('passes a clean list', () => {
        expect(validateClips(chain())).toEqual([])
    })

    it('catches the failures that are otherwise silent', () => {
        const errs = validateClips([
            { id: 'a', at: 0.5, dur: 120, in: 0 },
            { id: 'a', at: 0, dur: 1, in: 0 },
            { id: 'c', at: 0, dur: 120, in: -1, srcDur: 0 }
        ])
        expect(errs).toEqual([
            'clip a has non-integer or negative at',
            'duplicate clip id a',
            `clip a is shorter than ${MIN_CLIP_FRAMES} frames`,
            'clip c has non-integer or negative in',
            'clip c has non-integer or empty srcDur'
        ])
    })

    it('every operation leaves the list valid', () => {
        let clips = chain()
        clips = splitClip(clips, 'a', 60)
        clips = setClipSpeed(clips, 'a-b', 2.5)
        clips = trimClip(clips, 'b', 'start', 130)
        clips = setClipDurationRipple(clips, 'c', 200)
        clips = moveClip(clips, 'a', 5)
        clips = removeClip(clips, 'a-b')
        expect(validateClips(clips)).toEqual([])
    })
})
