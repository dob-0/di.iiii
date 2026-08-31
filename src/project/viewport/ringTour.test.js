import { describe, it, expect } from 'vitest'
import { ringTourYaw } from './ringTour.js'

const CFG = { stops: 8, dwell: 6, turn: 2, delay: 9.2, startAngle: 0 }
const STEP = (2 * Math.PI) / 8

describe('ringTourYaw', () => {
    it('leaves the visitor alone until the intro delay has passed', () => {
        expect(ringTourYaw(0, CFG)).toBeNull()
        expect(ringTourYaw(9.1, CFG)).toBeNull()
        expect(ringTourYaw(9.2, CFG)).toBe(0)
    })

    it('holds still for the whole dwell so the screen can actually be watched', () => {
        expect(ringTourYaw(9.2 + 0.5, CFG)).toBe(0)
        expect(ringTourYaw(9.2 + 5.9, CFG)).toBe(0)
    })

    it('eases exactly one stop across the turn', () => {
        const mid = ringTourYaw(9.2 + 6 + 1, CFG)
        expect(mid).toBeGreaterThan(0)
        expect(mid).toBeLessThan(STEP)
        expect(ringTourYaw(9.2 + 8, CFG)).toBeCloseTo(STEP, 6)
    })

    // Regression guard: wrapping stop angles into [0, 2pi) would send the
    // visitor spinning back the long way round the ring on the closing step --
    // seven-eighths of a turn in the wrong direction, and in a headset that is
    // the move most likely to make someone ill. Stops must accumulate.
    it('keeps turning the same way past a full circle', () => {
        const leg = 6 + 2
        const lastOfFirstLap = ringTourYaw(9.2 + leg * 7, CFG)
        const firstOfSecondLap = ringTourYaw(9.2 + leg * 8, CFG)
        expect(lastOfFirstLap).toBeCloseTo(STEP * 7, 6)
        expect(firstOfSecondLap).toBeCloseTo(STEP * 8, 6)
        expect(firstOfSecondLap).toBeGreaterThan(lastOfFirstLap)
    })

    it('never goes backwards across a whole lap', () => {
        let previous = -Infinity
        for (let t = 9.2; t < 9.2 + 8 * 8; t += 0.25) {
            const yaw = ringTourYaw(t, CFG)
            expect(yaw).toBeGreaterThanOrEqual(previous)
            previous = yaw
        }
    })

    it('reverses when direction is -1', () => {
        expect(ringTourYaw(9.2 + 8, { ...CFG, direction: -1 })).toBeCloseTo(-STEP, 6)
    })

    it('stops on the last object when loop is off', () => {
        const cfg = { ...CFG, loop: false }
        const parked = ringTourYaw(9.2 + 8 * 40, cfg)
        expect(parked).toBeCloseTo(STEP * 7, 6)
    })

    it('starts from the authored facing', () => {
        expect(ringTourYaw(9.2, { ...CFG, startAngle: Math.PI })).toBeCloseTo(Math.PI, 6)
    })
})
