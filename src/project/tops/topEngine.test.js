import { describe, expect, it } from 'vitest'
import { CLOCK_WRAP_SECONDS, clockSecondsFor } from './topEngine.js'
import { TOP_OPERATORS } from './topOperators.js'

// The engine's per-frame render loop needs a real WebGL context to exercise
// (topEngine.js's own comment: "8-bit textures and WebGL1 on purpose"), and
// this suite runs under jsdom, which has none — checkShader() already
// degrades to a no-op for the same reason. What is testable without a GPU is
// the clock itself (pure) and which operators declare they depend on it.
describe('the engine clock', () => {
    it('advances with elapsed time', () => {
        expect(clockSecondsFor(0)).toBe(0)
        expect(clockSecondsFor(1000)).toBe(1)
        expect(clockSecondsFor(2500)).toBe(2.5)
        expect(clockSecondsFor(5000)).toBeGreaterThan(clockSecondsFor(1000))
    })

    it('wraps rather than growing forever, so a long-running show stays in highp range', () => {
        expect(clockSecondsFor(CLOCK_WRAP_SECONDS * 1000)).toBe(0)
        expect(clockSecondsFor(CLOCK_WRAP_SECONDS * 1000 + 5000)).toBeCloseTo(5)
    })

    it('never goes negative — a clock that has not started yet reads as 0, not NaN', () => {
        expect(clockSecondsFor(-500)).toBe(0)
    })
})

// The engine itself has no per-operator dirty-tracking: frame() (topEngine.js)
// draws every operator in wiring order on every requestAnimationFrame,
// whether or not its picture could possibly have changed — there is no
// "only redraw what changed" optimisation here to preserve. `animated` is
// still real, checked data: it names the operators whose OWN picture cannot
// be treated as static just because their params and inputs are, because
// they read the clock. A future scheduler would consult exactly this flag.
describe('which operators the clock drives', () => {
    it('marks Clouds and Shape animated — their fragments read `time`', () => {
        expect(TOP_OPERATORS['top.noise'].animated).toBe(true)
        expect(TOP_OPERATORS['top.noise'].fragment).toContain('time')
        expect(TOP_OPERATORS['top.shape'].animated).toBe(true)
        expect(TOP_OPERATORS['top.shape'].fragment).toContain('time')
    })

    it('leaves every other operator unmarked — none of the rest reads `time`', () => {
        for (const [id, operator] of Object.entries(TOP_OPERATORS)) {
            if (id === 'top.noise' || id === 'top.shape') continue
            expect(Boolean(operator.animated), id).toBe(false)
            expect(/\btime\b/.test(operator.fragment), `${id} reads time but is not marked animated`).toBe(false)
        }
    })
})
