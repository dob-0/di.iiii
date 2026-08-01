import { describe, expect, it } from 'vitest'
import { ritualDurationSec, SEQUENCES } from './index.js'
import { clipProgress, fadeEnvelope } from '../ritualClock.js'
import { analyseEditList } from '../editList.js'

describe('algovrithm edit list', () => {
    it('opens on the first frame of the piece', () => {
        expect(Math.min(...SEQUENCES.map((s) => s.startSec))).toBe(0)
    })

    it('runs 30-60 seconds — the length the piece is designed for', () => {
        const total = ritualDurationSec()
        expect(total).toBeGreaterThanOrEqual(30)
        expect(total).toBeLessThanOrEqual(60)
    })

    it('derives the total from the last clip rather than declaring it', () => {
        expect(ritualDurationSec()).toBe(Math.max(...SEQUENCES.map((s) => s.endSec)))
        // A clip added past the end lengthens the piece instead of squeezing
        // the others — the whole point of timing in seconds.
        expect(ritualDurationSec([...SEQUENCES, { endSec: 90 }])).toBe(90)
    })

    it('gives every sequence a forward window', () => {
        SEQUENCES.forEach((sequence) => {
            expect(sequence.endSec).toBeGreaterThan(sequence.startSec)
            expect(sequence.startSec).toBeGreaterThanOrEqual(0)
        })
    })

    it('overlaps consecutive sequences so handovers cross-fade instead of cutting', () => {
        // A gap would leave the piece empty; butting windows exactly end-to-end
        // would produce a hard cut, which is what Backdrop.jsx and the fade
        // envelopes exist to avoid.
        for (let index = 1; index < SEQUENCES.length; index++) {
            const previous = SEQUENCES[index - 1]
            const current = SEQUENCES[index]
            expect(current.startSec).toBeLessThan(previous.endSec)
        }
    })

    it('leaves no dead frame — some sequence is always on screen', () => {
        const total = ritualDurationSec()
        for (let step = 0; step <= 200; step++) {
            const playheadSec = (step / 200) * total
            const live = SEQUENCES.filter(
                (sequence) => clipProgress(playheadSec, sequence.startSec, sequence.endSec) !== null
            )
            expect(live.length).toBeGreaterThan(0)
        }
    })

    it('agrees with the director panel that the shipped edit is clean', () => {
        // Same check the panel draws as a red band, asserted on the committed
        // edit list so a bad paste-back cannot land silently.
        const analysis = analyseEditList(SEQUENCES)
        expect(analysis.gaps).toEqual([])
        expect(analysis.cuts).toEqual([])
    })

    it('declares a backdrop for every sequence so the room can blend', () => {
        SEQUENCES.forEach((sequence) => {
            expect(sequence.backdrop).toBeTruthy()
            expect(sequence.backdrop.color).toMatch(/^#[0-9a-f]{6}$/i)
            expect(sequence.backdrop.fogFar).toBeGreaterThan(sequence.backdrop.fogNear)
        })
    })

    it('holds the opening tunnel roughly 5 seconds before the handover starts', () => {
        const handover = SEQUENCES[1].startSec
        expect(handover).toBeGreaterThan(3)
        expect(handover).toBeLessThan(7)
    })
})

describe('fadeEnvelope', () => {
    it('is silent at both edges and full in the middle', () => {
        expect(fadeEnvelope(0, 0.15)).toBe(0)
        expect(fadeEnvelope(1, 0.15)).toBe(0)
        expect(fadeEnvelope(0.5, 0.15)).toBeCloseTo(1, 5)
    })

    it('is at full strength on frame one when fadeIn is 0', () => {
        // The opening sequence relies on this — otherwise the piece starts on
        // an empty room. A zero-width smoothstep must hard-step, not divide by
        // zero and produce NaN.
        expect(fadeEnvelope(0, 0, 0.4)).toBe(1)
        expect(Number.isNaN(fadeEnvelope(0, 0, 0.4))).toBe(false)
    })

    it('still fades out normally with an instant fade-in', () => {
        expect(fadeEnvelope(1, 0, 0.4)).toBe(0)
        expect(fadeEnvelope(0.5, 0, 0.4)).toBeCloseTo(1, 5)
    })
})

describe('clipProgress in seconds', () => {
    it('returns a local 0..1 regardless of how long the clip is', () => {
        // A sequence's own code never learns its length — stretch the clip and
        // its animation stretches with it.
        expect(clipProgress(5, 0, 10)).toBe(0.5)
        expect(clipProgress(20, 0, 40)).toBe(0.5)
        expect(clipProgress(12, 4, 20)).toBe(0.5)
    })

    it('is null off the window so an unplayed sequence costs nothing', () => {
        expect(clipProgress(3.9, 4, 20)).toBeNull()
        expect(clipProgress(20.1, 4, 20)).toBeNull()
    })
})
