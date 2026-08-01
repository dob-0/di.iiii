import { describe, expect, it } from 'vitest'
import {
    BREATH_PERIOD_SEC,
    COLOR_HOLD_SEC,
    apertureOpening,
    breathe,
    colorWalk,
    drift,
    viewerInfluence
} from './lightField.js'
import { WALK_RAMP } from './palette.js'

describe('breathe', () => {
    it('stays inside 0..1', () => {
        for (let t = 0; t < BREATH_PERIOD_SEC * 3; t += 0.37) {
            const value = breathe(t)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(1)
        }
    })

    it('repeats on its period', () => {
        expect(breathe(0)).toBeCloseTo(breathe(BREATH_PERIOD_SEC), 6)
        expect(breathe(3)).toBeCloseTo(breathe(3 + BREATH_PERIOD_SEC), 6)
    })

    it('holds near its extremes rather than sweeping through them', () => {
        // The difference between breathing and throbbing. A raw sine spends
        // most of its time mid-swing; this should linger at the ends.
        const quarter = BREATH_PERIOD_SEC / 4
        const atPeak = breathe(quarter)
        const justOffPeak = breathe(quarter + BREATH_PERIOD_SEC * 0.04)
        expect(Math.abs(atPeak - justOffPeak)).toBeLessThan(0.02)
    })

    it('is genuinely slow — a full breath takes over twenty seconds', () => {
        expect(BREATH_PERIOD_SEC).toBeGreaterThan(20)
    })
})

describe('colorWalk', () => {
    it('always sits between two ADJACENT walk-ramp entries', () => {
        // This is what keeps the gradient off mauve: WALK_RAMP is ordered so
        // neighbours are safe to interpolate, and the walk must never skip.
        // Checked as "this pair occurs consecutively SOMEWHERE" rather than by
        // indexOf: the walk is a palindrome, so skyBlue and iceBlue each appear
        // twice and indexOf would always resolve to the first occurrence.
        const adjacent = new Set(
            WALK_RAMP.map((color, index) => `${color}->${WALK_RAMP[(index + 1) % WALK_RAMP.length]}`)
        )
        for (let t = 0; t < COLOR_HOLD_SEC * WALK_RAMP.length * 1.5; t += 1.3) {
            const { from, to } = colorWalk(t)
            expect(adjacent.has(`${from}->${to}`)).toBe(true)
        }
    })

    it('reports a 0..1 crossing amount', () => {
        for (let t = 0; t < 200; t += 0.7) {
            const { amount } = colorWalk(t)
            expect(amount).toBeGreaterThanOrEqual(0)
            expect(amount).toBeLessThanOrEqual(1)
        }
    })

    it('starts a hold at the colour itself, not mid-blend', () => {
        expect(colorWalk(0).amount).toBeCloseTo(0, 6)
        expect(colorWalk(COLOR_HOLD_SEC).amount).toBeCloseTo(0, 6)
    })

    it('eases the handover at both ends', () => {
        // A linear crossfade has a visible start and stop; this must not.
        const early = colorWalk(COLOR_HOLD_SEC * 0.02).amount
        const middle = colorWalk(COLOR_HOLD_SEC * 0.5).amount
        expect(early).toBeLessThan(0.01)
        expect(middle).toBeCloseTo(0.5, 2)
    })

    it('does not share a period with the breath', () => {
        // Sharing a factor gives the room an audible loop, and the whole
        // illusion is that nothing repeats.
        expect(BREATH_PERIOD_SEC % COLOR_HOLD_SEC).not.toBe(0)
        expect(COLOR_HOLD_SEC % BREATH_PERIOD_SEC).not.toBe(0)
    })
})

describe('viewerInfluence', () => {
    it('is strongest underfoot and gone at the radius', () => {
        expect(viewerInfluence(0, 9)).toBeCloseTo(1, 6)
        expect(viewerInfluence(9, 9)).toBeCloseTo(0, 6)
        expect(viewerInfluence(20, 9)).toBe(0)
    })

    it('falls off with no edge to find', () => {
        // If a visitor can locate the boundary of their own effect they start
        // operating it, and this piece has nothing to operate.
        const nearEdge = viewerInfluence(8.6, 9)
        expect(nearEdge).toBeGreaterThan(0)
        expect(nearEdge).toBeLessThan(0.02)
    })

    it('decreases monotonically', () => {
        let previous = Infinity
        for (let d = 0; d <= 9; d += 0.25) {
            const value = viewerInfluence(d, 9)
            expect(value).toBeLessThanOrEqual(previous)
            previous = value
        }
    })
})

describe('drift', () => {
    it('stays within its amplitude', () => {
        for (let t = 0; t < 400; t += 2.1) {
            const offset = drift(t, 0.3, 1.6)
            expect(Math.abs(offset.x)).toBeLessThanOrEqual(1.6)
            expect(Math.abs(offset.z)).toBeLessThanOrEqual(1.6)
            // Vertical movement is deliberately a fraction of lateral — a
            // light volume that rises as far as it slides reads as an object
            // bobbing rather than as air moving.
            expect(Math.abs(offset.y)).toBeLessThanOrEqual(1.6 * 0.35 + 1e-9)
        }
    })

    it('gives different seeds different paths', () => {
        expect(drift(5, 0).x).not.toBeCloseTo(drift(5, 0.5).x, 3)
    })
})

describe('apertureOpening', () => {
    it('is already open when the sequence starts', () => {
        // Turrell's apertures do not switch on. A light that appears from
        // nothing is an event, and this room is avoiding events.
        expect(apertureOpening(0, 0.5)).toBeGreaterThan(0.15)
    })

    it('opens over the first part and then stays open', () => {
        const early = apertureOpening(0.1, 0.5)
        const mid = apertureOpening(0.5, 0.5)
        const late = apertureOpening(1, 0.5)
        expect(mid).toBeGreaterThan(early)
        expect(late).toBeCloseTo(mid, 5)
    })

    it('never exceeds one, so it cannot blow the panel out', () => {
        for (let p = 0; p <= 1; p += 0.05) {
            expect(apertureOpening(p, 1)).toBeLessThanOrEqual(1)
        }
    })
})
