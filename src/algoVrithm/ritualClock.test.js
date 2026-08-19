import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MAX_STEP_SEC, clipProgress, fadeEnvelope, sourceProgress, useRitualClock } from './ritualClock.js'

// The clock deliberately does not tick itself — a window.requestAnimationFrame
// loop in the hook froze the piece inside a headset, because R3F hands a
// presenting root over to gl.xr.setAnimationLoop and skips window rAF for it
// entirely (see RitualClockDriver.jsx). These tests drive `advance` directly,
// which is exactly what the driver does from useFrame.

const tick = (result, deltaSec, times = 1) => {
    act(() => {
        for (let index = 0; index < times; index++) result.current.advance(deltaSec)
    })
}

describe('sourceProgress', () => {
    it('changes nothing for a clip that has never been cut', () => {
        expect(sourceProgress(0.4, undefined)).toBe(0.4)
        expect(sourceProgress(0, undefined)).toBe(0)
    })

    it('passes an off-screen clip straight through as null', () => {
        expect(sourceProgress(null, [0, 0.5])).toBeNull()
    })

    it('maps the window into the clip\'s own slice of material', () => {
        expect(sourceProgress(0, [0.25, 0.75])).toBeCloseTo(0.25, 6)
        expect(sourceProgress(0.5, [0.25, 0.75])).toBeCloseTo(0.5, 6)
        expect(sourceProgress(1, [0.25, 0.75])).toBeCloseTo(0.75, 6)
    })

    it('ignores a malformed range rather than rendering NaN', () => {
        expect(sourceProgress(0.5, [Number.NaN, 1])).toBe(0.5)
        expect(sourceProgress(0.5, [0, undefined])).toBe(0.5)
    })

    it('plays one animation ONCE across a cut pair, not twice', () => {
        // A clip 0..8s cut at 4s. Walk the playhead across both halves and the
        // material must advance monotonically 0 -> 1 exactly once. Before
        // source ranges each half ran its own full 0..1, at double speed.
        const head = { startSec: 0, endSec: 4, source: [0, 0.5] }
        const tail = { startSec: 4, endSec: 8, source: [0.5, 1] }
        const at = (clip, seconds) =>
            sourceProgress(clipProgress(seconds, clip.startSec, clip.endSec), clip.source)

        expect(at(head, 0)).toBeCloseTo(0, 6)
        expect(at(head, 2)).toBeCloseTo(0.25, 6)
        expect(at(head, 4)).toBeCloseTo(0.5, 6)
        expect(at(tail, 4)).toBeCloseTo(0.5, 6)
        expect(at(tail, 6)).toBeCloseTo(0.75, 6)
        expect(at(tail, 8)).toBeCloseTo(1, 6)
    })

    it('leaves the pair at full strength across the cut and fading only at the true ends', () => {
        // The reason no sequence file needed changing: the existing envelopes
        // come out right on their own. A fade at the cut would be a dissolve,
        // which is the one thing a cut is not.
        const head = { startSec: 0, endSec: 4, source: [0, 0.5] }
        const tail = { startSec: 4, endSec: 8, source: [0.5, 1] }
        const envelopeAt = (clip, seconds) =>
            fadeEnvelope(sourceProgress(clipProgress(seconds, clip.startSec, clip.endSec), clip.source))

        expect(envelopeAt(head, 0)).toBeCloseTo(0, 6)      // fades in at the true start
        expect(envelopeAt(head, 4)).toBeCloseTo(1, 6)      // still up when it hands over
        expect(envelopeAt(tail, 4)).toBeCloseTo(1, 6)      // arrives up, no fade at the cut
        expect(envelopeAt(tail, 8)).toBeCloseTo(0, 6)      // fades out at the true end
    })
})

describe('useRitualClock', () => {
    it('exposes advance and does not move on its own', async () => {
        const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))

        expect(typeof result.current.advance).toBe('function')
        expect(result.current.playheadSec).toBe(0)

        // Nothing but advance() may move the playhead. If the hook grew a
        // self-driven loop again this would drift off zero.
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(result.current.playheadSec).toBe(0)
    })

    it('autoplays from zero so the audience never has to start it', () => {
        const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))

        expect(result.current.isPlaying).toBe(true)
        tick(result, 0.05, 10)
        expect(result.current.playheadSec).toBeCloseTo(0.5, 5)
    })

    it('keeps a stable advance across renders so useFrame never resubscribes', () => {
        const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))
        const first = result.current.advance

        tick(result, 0.5)
        expect(result.current.playheadSec).toBeGreaterThan(0)
        expect(result.current.advance).toBe(first)
    })

    describe('looping', () => {
        it('wraps past the end and carries the overshoot', () => {
            const { result } = renderHook(
                () => useRitualClock({ durationSec: 1, loop: true })
            )

            tick(result, 0.09, 11) // 0.99
            expect(result.current.playheadSec).toBeCloseTo(0.99, 5)

            // 0.99 + 0.09 = 1.08 -> 0.08. Snapping to 0 instead would drop
            // 0.08s at the seam every single pass.
            tick(result, 0.09)
            expect(result.current.playheadSec).toBeCloseTo(0.08, 5)
        })

        it('keeps running for many passes', () => {
            const { result } = renderHook(
                () => useRitualClock({ durationSec: 0.5, loop: true })
            )

            tick(result, 0.1, 60) // twelve times round
            expect(result.current.playheadSec).toBeGreaterThanOrEqual(0)
            expect(result.current.playheadSec).toBeLessThan(0.5)
            expect(result.current.isPlaying).toBe(true)
        })

        it('holds on the final frame when loop is off', () => {
            const { result } = renderHook(
                () => useRitualClock({ durationSec: 1, loop: false })
            )

            tick(result, 0.1, 30)
            expect(result.current.playheadSec).toBe(1)
        })
    })

    describe('frame delta guards', () => {
        it('clamps a long stall instead of skipping the opening', () => {
            const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))

            // A headset handover or a backgrounded tab. Advancing by the whole
            // gap would put the visitor past the opening the moment they get
            // the glasses on.
            tick(result, 30)
            expect(result.current.playheadSec).toBeCloseTo(MAX_STEP_SEC, 5)
        })

        it('ignores a negative or non-finite delta', () => {
            const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))

            tick(result, 1)
            const before = result.current.playheadSec

            tick(result, -5)
            tick(result, Number.NaN)
            tick(result, undefined)

            expect(result.current.playheadSec).toBe(before)
        })

        it('never yields NaN when the edit list has no duration', () => {
            const { result } = renderHook(
                () => useRitualClock({ durationSec: 0, loop: true })
            )

            tick(result, 0.1, 5)
            // NaN here would propagate into every sequence's progress and
            // render an empty room rather than fail loudly.
            expect(Number.isNaN(result.current.playheadSec)).toBe(false)
            expect(result.current.playheadSec).toBe(0)
        })
    })

    describe('transport', () => {
        it('does not advance while paused', () => {
            const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))

            tick(result, 0.05, 10)
            act(() => result.current.pause())
            tick(result, 0.05, 20)

            expect(result.current.isPlaying).toBe(false)
            expect(result.current.playheadSec).toBeCloseTo(0.5, 5)
        })

        it('scales the step by the playback rate', () => {
            const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))

            act(() => result.current.setRate(0.25))
            tick(result, 0.1)

            expect(result.current.playheadSec).toBeCloseTo(0.025, 5)
        })

        it('seeking pauses, and resumes from where it was left', () => {
            const { result } = renderHook(() => useRitualClock({ durationSec: 10 }))

            act(() => result.current.seek(4))
            expect(result.current.isPlaying).toBe(false)
            expect(result.current.playheadSec).toBe(4)

            act(() => result.current.play())
            tick(result, 0.1)
            expect(result.current.playheadSec).toBeCloseTo(4.1, 5)
        })
    })

    describe('restartKey', () => {
        it('rewinds and resumes when the key changes', () => {
            // Entering VR flips this. Without the rewind, a visitor who spends
            // half a minute getting the headset on arrives mid-piece.
            const { result, rerender } = renderHook(
                ({ restartKey }) => useRitualClock({ durationSec: 10, restartKey }),
                { initialProps: { restartKey: false } }
            )

            tick(result, 0.1, 20)
            act(() => result.current.pause())
            expect(result.current.playheadSec).toBeCloseTo(2, 5)

            rerender({ restartKey: true })

            expect(result.current.playheadSec).toBe(0)
            expect(result.current.isPlaying).toBe(true)

            tick(result, 0.1)
            expect(result.current.playheadSec).toBeCloseTo(0.1, 5)
        })
    })
})
