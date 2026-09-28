import { describe, expect, it } from 'vitest'
import { createBrokenLockDetector } from './brokenLockDetector.js'

const run = (moves) => {
    const d = createBrokenLockDetector()
    let broken = false
    for (const [x, y] of moves) broken = d.push(x, y).broken || broken
    return broken
}
const repeat = (pattern, n) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length])

describe('broken shapes are still caught (live capture, KDE Wayland + Firefox, July 2026)', () => {
    it('all-zero deltas', () => {
        expect(run(repeat([[0, 0]], 35))).toBe(true)
    })
    it('the captured ±1..±4 noise stream (the one scripts/input-check.mjs replays)', () => {
        expect(run(repeat([[-2, 1], [0, 1], [1, 0], [2, 0], [-1, 1], [4, 0], [0, 0]], 35))).toBe(true)
    })
    it('a constant ±1,0 crawl', () => {
        expect(run(repeat([[1, 0]], 35))).toBe(true)
        expect(run(repeat([[-1, 0]], 35))).toBe(true)
    })
    it('not before a full window', () => {
        expect(run(repeat([[0, 0]], 29))).toBe(false)
    })
})

describe('slow real looking keeps the lock', () => {
    it('one count per frame at DPR 1.5 (measured: movementX 1,0,1,1,0,… on Chromium 153 X11)', () => {
        expect(run(repeat([[1, 0], [0, 0], [1, 0]], 90))).toBe(false)
    })
    it('a slow pan at 240 Hz with vertical hand wander', () => {
        expect(run(repeat([[2, 0], [1, 1], [2, 0], [1, -1], [2, 1], [1, 0], [2, -1]], 120))).toBe(false)
    })
    it('a slow diagonal look up-right', () => {
        expect(run(repeat([[1, -1], [2, -1], [1, 0], [1, -2]], 60))).toBe(false)
    })
    it('any big move clears the window', () => {
        const d = createBrokenLockDetector()
        for (let i = 0; i < 29; i++) d.push(0, 0)
        d.push(40, 3)
        expect(d.streak).toBe(0)
        for (let i = 0; i < 29; i++) expect(d.push(0, 0).broken).toBe(false)
    })
})
