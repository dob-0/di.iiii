import { describe, expect, it } from 'vitest'
import {
    COMFORTABLE_SPEED,
    COMFORT_RAMP,
    comfortEase,
    isTravelling,
    resolveTravel,
    travelSpeed
} from './viewerTravel.js'
import { SEQUENCES, ritualDurationSec } from './sequences/index.js'

const clip = (travel, startSec = 0, endSec = 10) => ({
    id: 'c', startSec, endSec, travel
})

describe('comfortEase', () => {
    it('starts at 0 and completes exactly at 1', () => {
        // A move that does not complete leaves the viewer short of where the
        // edit list says they are, and every later clip inherits the error.
        expect(comfortEase(0)).toBe(0)
        expect(comfortEase(1)).toBeCloseTo(1, 9)
    })

    it('is monotonic — the viewer never slides backwards mid-move', () => {
        let previous = -1
        for (let step = 0; step <= 200; step++) {
            const value = comfortEase(step / 200)
            expect(value).toBeGreaterThanOrEqual(previous)
            previous = value
        }
    })

    it('holds constant velocity through the middle', () => {
        // The whole comfort argument. Smoothstep accelerates at every instant;
        // this must not, or the piece trades nausea for prettiness.
        const at = (t) => comfortEase(t)
        const step = 0.01
        const mid = 0.5
        const v1 = at(mid) - at(mid - step)
        const v2 = at(mid + step) - at(mid)
        expect(v2).toBeCloseTo(v1, 9)
    })

    it('accelerates in and decelerates out rather than jerking', () => {
        // Velocity at the very start and very end must be near zero: an instant
        // velocity change is the most uncomfortable thing a passive move does.
        const step = 0.005
        const startVelocity = comfortEase(step) - comfortEase(0)
        const cruiseVelocity = comfortEase(0.5 + step) - comfortEase(0.5)
        const endVelocity = comfortEase(1) - comfortEase(1 - step)
        expect(startVelocity).toBeLessThan(cruiseVelocity)
        expect(endVelocity).toBeLessThan(cruiseVelocity)
    })

    it('degrades to linear when the ramp is removed', () => {
        expect(comfortEase(0.3, 0)).toBeCloseTo(0.3, 9)
    })

    it('survives a ramp past the point where the two ends meet', () => {
        // Ramps longer than half would overlap and stop describing a trapezoid.
        expect(comfortEase(1, 0.9)).toBeCloseTo(1, 9)
        expect(comfortEase(0.5, 0.9)).toBeGreaterThan(0)
    })

    it('clamps outside 0..1', () => {
        expect(comfortEase(-3)).toBe(0)
        expect(comfortEase(4)).toBeCloseTo(1, 9)
    })
})

describe('resolveTravel', () => {
    it('is zero before a move starts', () => {
        expect(resolveTravel([clip([0, 0, 5], 4, 10)], 2)).toEqual([0, 0, 0])
    })

    it('reaches the full displacement by the end of the window', () => {
        const [, , z] = resolveTravel([clip([0, 0, 5], 0, 10)], 10)
        expect(z).toBeCloseTo(5, 6)
    })

    it('KEEPS the displacement after the window closes', () => {
        // The point of accumulating. If travel reset when a clip ended, the
        // viewer would snap back across the room at every handover.
        const [, , z] = resolveTravel([clip([0, 0, 5], 0, 10)], 999)
        expect(z).toBeCloseTo(5, 6)
    })

    it('accumulates across sequences', () => {
        const list = [clip([0, 0, 5], 0, 10), { ...clip([0, 0, 3], 10, 20), id: 'd' }]
        expect(resolveTravel(list, 20)[2]).toBeCloseTo(8, 6)
    })

    it('ignores sequences with no travel', () => {
        expect(resolveTravel([{ id: 'a', startSec: 0, endSec: 5 }], 3)).toEqual([0, 0, 0])
    })

    it('rejects a malformed or NaN travel rather than killing the camera', () => {
        // A NaN reaches the camera matrix and the entire scene stops rendering,
        // with nothing in the console to say why.
        expect(resolveTravel([clip([0, NaN, 5])], 5)).toEqual([0, 0, 0])
        expect(resolveTravel([clip([1, 2])], 5)).toEqual([0, 0, 0])
        expect(resolveTravel([clip('forward')], 5)).toEqual([0, 0, 0])
    })

    it('applies a zero-width clip fully instead of dividing by zero', () => {
        const [, , z] = resolveTravel([clip([0, 0, 5], 8, 8)], 9)
        expect(Number.isNaN(z)).toBe(false)
        expect(z).toBeCloseTo(5, 6)
    })
})

describe('travelSpeed', () => {
    it('reports roughly distance over duration at cruise', () => {
        const list = [clip([0, 0, 10], 0, 10)]
        // Cruise is faster than the naive average because the ramps give some
        // of the time back — but it should be the same order, not double.
        const speed = travelSpeed(list, 5)
        expect(speed).toBeGreaterThan(1)
        expect(speed).toBeLessThan(1.5)
    })

    it('is zero when nothing is moving', () => {
        expect(travelSpeed([{ id: 'a', startSec: 0, endSec: 5 }], 2)).toBeCloseTo(0, 9)
        expect(isTravelling([clip([0, 0, 5], 0, 10)], 50)).toBe(false)
    })

    it('detects an active move', () => {
        expect(isTravelling([clip([0, 0, 5], 0, 10)], 5)).toBe(true)
    })
})

describe('the shipped edit list', () => {
    it('never carries the viewer faster than a comfortable pace', () => {
        // The guard that matters. Shortening a clip's window without shortening
        // its travel distance silently speeds the move up, and the first sign
        // is somebody taking the headset off.
        const total = ritualDurationSec()
        for (let step = 0; step <= 400; step++) {
            const playheadSec = (step / 400) * total
            expect(travelSpeed(SEQUENCES, playheadSec)).toBeLessThan(COMFORTABLE_SPEED)
        }
    })

    it('only ever translates the viewer, never rotates them', () => {
        // Rotational vection is far worse than linear. There is no rotation
        // field by design; this asserts nobody added one.
        SEQUENCES.forEach((sequence) => {
            expect(sequence.travelRotation).toBeUndefined()
            if (sequence.travel) expect(sequence.travel).toHaveLength(3)
        })
    })

    it('keeps the viewer at standing height throughout', () => {
        // Vertical drift is one of the least comfortable axes and reads as
        // falling. Flying is a deliberate choice, not something to arrive at by
        // accident.
        const total = ritualDurationSec()
        for (let step = 0; step <= 100; step++) {
            expect(resolveTravel(SEQUENCES, (step / 100) * total)[1]).toBe(0)
        }
    })

    it('ramps rather than jerking into its moves', () => {
        expect(COMFORT_RAMP).toBeGreaterThan(0)
        expect(COMFORT_RAMP).toBeLessThan(0.5)
    })
})
