// flashRule.js from WCAG 2.2 SC 2.3.1's own definition: a flash is a pair of
// opposing changes of 10 % or more of full; three or fewer in any one second
// pass. And it is the ONE source: the offline checks count with it, no copy.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
    FLASH_LIMIT_PER_SECOND, FLASH_THRESHOLD, changeTimes, flashLimitOf, flashStep,
    mostChangesInWindow, worstFlashesPerSecond,
} from './flashRule.js'

// A square wave of `perSecond` flashes (one period = one up + one down),
// sampled every `stepMs` for `seconds`, swinging `low`..`high`.
const square = (perSecond, { stepMs = 1000 / 60, seconds = 5, low = 0, high = 1 } = {}) => {
    const samples = []
    for (let i = 0; i * stepMs < seconds * 1000; i++) {
        const at = i * stepMs
        samples.push({ at, value: Math.floor(at / 1000 * perSecond * 2) % 2 ? high : low })
    }
    return samples
}
const flashesOf = (samples) => worstFlashesPerSecond(changeTimes(samples))

describe('flashRule — WCAG 2.2 SC 2.3.1', () => {
    it('states the rule: 10 % of full, a one-second window, three a second', () => {
        expect(FLASH_THRESHOLD).toBe(0.1)
        expect(FLASH_LIMIT_PER_SECOND).toBe(3)
    })

    it('2 flashes a second passes', () => {
        expect(flashesOf(square(2))).toBe(2)
        expect(flashesOf(square(2))).toBeLessThanOrEqual(FLASH_LIMIT_PER_SECOND)
    })

    it('3 flashes a second is at the limit, still within it', () => {
        expect(flashesOf(square(3, { stepMs: 25 }))).toBe(3)
    })

    it('4 flashes a second is over the limit', () => {
        expect(flashesOf(square(4))).toBe(4)
        expect(flashesOf(square(4))).toBeGreaterThan(FLASH_LIMIT_PER_SECOND)
    })

    it('a 9 % swing is no flash at any speed; a 10 % swing is', () => {
        expect(changeTimes(square(10, { low: 0.5, high: 0.59 }))).toEqual([])
        expect(flashesOf(square(10, { low: 0.5, high: 0.6 }))).toBe(10)
    })

    it('hysteresis: a slow ramp is changes, not jitter', () => {
        // 0 → 1 over a second in 1 % steps: one rise, counted once at 10 %.
        const ramp = Array.from({ length: 101 }, (_, i) => ({ at: i * 10, value: i / 100 }))
        expect(changeTimes(ramp)).toEqual([100])
    })

    it('flashStep never mutates the state it is given', () => {
        const s = Object.freeze({ hi: 1, lo: 1, dir: 0, turned: 0 })
        expect(flashStep(s, 0).turned).toBe(-1)
        expect(s.hi).toBe(1)
    })

    it('the window is shorter than one second, as the offline checks always counted', () => {
        expect(mostChangesInWindow([0, 999])).toBe(2)
        expect(mostChangesInWindow([0, 1000])).toBe(1)
    })

    it('the limit cannot be switched off by accident, only made stricter', () => {
        for (const off of [undefined, null, '', 0, -1, NaN, 'no', Infinity]) expect(flashLimitOf(off), String(off)).toBe(3)
        expect(flashLimitOf(100)).toBe(3)
        expect(flashLimitOf(2)).toBe(2)
        expect(flashLimitOf('1')).toBe(1)
    })
})

describe('flashRule — the one source', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const repo = join(here, '../../..')
    for (const script of ['scripts/measure/flashrate.cjs', 'scripts/place/scenes_flash.cjs']) {
        it(`${script} counts with flashRule.js and holds no copy of the count`, () => {
            const src = readFileSync(join(repo, script), 'utf8')
            expect(src).toContain('src/project/nodes/flashRule.js')
            expect(src).toContain('rule.changeTimes(')
            expect(src).not.toMatch(/>=\s*0\.1\b/)
            expect(src).not.toMatch(/while \(tr\[b\]/)
        })
    }
})
