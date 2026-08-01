import { describe, expect, it } from 'vitest'
import { stepSeparation } from './MetaballField.jsx'

// The pair oscillator is the only thing in this sequence that is not either a
// constant or a shader, and the entire look depends on one claim: that it
// SWINGS — the two sources fuse, hold, and pull apart again, forever, without
// settling at an equilibrium and without collapsing into each other. A spring
// that quietly damps out leaves five frozen dumbbells hanging around the
// visitor and nothing in the sequence would report it.

const STEP = 1 / 240
const START = 1.15

// From MetaballField.jsx: two sources read as one form below this
// half-separation. Above it they are visibly two.
const FUSION = 0.71

// The integrator's floor. The physics is supposed to turn the pair around well
// before this, so if a run ever touches it the constants have drifted.
const FLOOR = 0.12

const run = (seconds, { separation = START, velocity = 0 } = {}) => {
    const trace = []
    let state = { separation, velocity }
    for (let step = 0; step < Math.round(seconds / STEP); step++) {
        state = stepSeparation(state.separation, state.velocity, STEP)
        trace.push(state.separation)
    }
    return trace
}

describe('the pair oscillator', () => {
    it('fuses and parts again rather than settling', () => {
        const trace = run(8)

        // Count the turnarounds at the far end — one per merge cycle.
        let partings = 0
        for (let index = 1; index < trace.length - 1; index++) {
            if (trace[index] > trace[index - 1] && trace[index] >= trace[index + 1]) partings++
        }

        expect(partings).toBeGreaterThanOrEqual(2)
        expect(Math.min(...trace)).toBeLessThan(FUSION)
        expect(Math.max(...trace)).toBeGreaterThan(FUSION)
    })

    it('turns around on its own repulsion, never on the floor', () => {
        // The floor exists to survive a bad dt, not to be part of the motion.
        // If this fails, the pair is bouncing off a clamp and the merge will
        // read as a collision rather than as an orbit seen edge-on.
        expect(Math.min(...run(20))).toBeGreaterThan(FLOOR * 1.5)
    })

    it('does not lose or gain energy over the length of the piece', () => {
        // Undamped by design: the beat is eight seconds but the piece loops all
        // day in an exhibition, so a slow drift either way would eventually
        // flatten the swing or throw the pair out of its own bounding sphere —
        // and the bound is what keeps the shader cheap.
        const early = run(4)
        const late = run(120).slice(-960)

        expect(Math.max(...late)).toBeLessThan(Math.max(...early) * 1.05)
        expect(Math.max(...late)).toBeGreaterThan(Math.max(...early) * 0.9)
    })

    it('is deterministic — the same start gives the same swing', () => {
        // What gets approved is what the audience sees on every load.
        expect(run(3)).toEqual(run(3))
    })

    it('holds still when released at its own equilibrium', () => {
        // Sanity check on the force law: s³ = REPULSION / ATTRACTION.
        const equilibrium = Math.cbrt(0.382 / 1.9)
        const trace = run(2, { separation: equilibrium })

        trace.forEach((separation) => {
            expect(Math.abs(separation - equilibrium)).toBeLessThan(0.01)
        })
    })

    it('survives a long frame without flinging the pair apart', () => {
        // A tab regaining focus or an XR session starting hands the sequence a
        // delta far larger than the fixed step. The caller clamps it, but the
        // clamp is only useful if one oversized step cannot destroy the state.
        const state = stepSeparation(0.2, -3, 0.25)

        expect(Number.isFinite(state.separation)).toBe(true)
        expect(state.separation).toBeGreaterThanOrEqual(FLOOR)
    })
})
