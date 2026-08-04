import { describe, expect, it } from 'vitest'
import { tickGate, stutterGate, ringPosition } from './spatialScore.js'

describe('tickGate', () => {
    it('is open for exactly the duty fraction of every cycle', () => {
        const hz = 6
        const duty = 0.25
        let open = 0
        const steps = 6000
        for (let step = 0; step < steps; step++) {
            open += tickGate((step / steps) * 10, hz, duty)
        }
        expect(open / steps).toBeCloseTo(duty, 1)
    })

    it('opens at the top of each cycle', () => {
        expect(tickGate(0, 6, 0.2)).toBe(1)
        expect(tickGate(1 / 6, 6, 0.2)).toBe(1)
        // Late in the cycle, shut.
        expect(tickGate(0.9 / 6, 6, 0.2)).toBe(0)
    })

    it('only ever returns 0 or 1 — it is a gate, not an envelope', () => {
        for (let step = 0; step < 100; step++) {
            const value = tickGate(step * 0.037, 2.6, 0.14)
            expect(value === 0 || value === 1).toBe(true)
        }
    })
})

describe('stutterGate', () => {
    it('is deterministic — scrubbing replays the same stutter', () => {
        for (let step = 0; step < 50; step++) {
            const t = step * 0.11
            expect(stutterGate(t, 11, 0.7)).toBe(stutterGate(t, 11, 0.7))
        }
    })

    it('holds one decision for a whole tick', () => {
        // Two times inside the same tick agree; the roll happens per tick,
        // not per sample.
        const hz = 11
        const tickStart = 5 / hz
        expect(stutterGate(tickStart + 0.001, hz, 0.5))
            .toBe(stutterGate(tickStart + 0.08 / hz, hz, 0.5))
    })

    it('fires roughly as often as asked', () => {
        const chance = 0.7
        let open = 0
        const ticks = 2000
        for (let tick = 0; tick < ticks; tick++) {
            open += stutterGate((tick + 0.5) / 11, 11, chance)
        }
        expect(open / ticks).toBeGreaterThan(chance - 0.1)
        expect(open / ticks).toBeLessThan(chance + 0.1)
    })
})

describe('ringPosition', () => {
    it('places a voice on the ring at the asked height', () => {
        const [x, y, z] = ringPosition(0, 2.5, 1.6)
        expect(x).toBeCloseTo(2.5, 6)
        expect(y).toBe(1.6)
        expect(z).toBeCloseTo(0, 6)
    })

    it('keeps a constant distance as the bearing sweeps', () => {
        for (let step = 0; step < 12; step++) {
            const [x, , z] = ringPosition((step / 12) * Math.PI * 2, 2.9, 0)
            expect(Math.hypot(x, z)).toBeCloseTo(2.9, 6)
        }
    })
})
