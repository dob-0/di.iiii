import { describe, expect, it } from 'vitest'
import { createRandom } from './random.js'

describe('createRandom', () => {
    it('gives the same sequence for the same seed', () => {
        // This is the whole point: the point cloud must look identical on
        // every load, or the composition changes under you between reviewing
        // it and showing it.
        const a = createRandom(20260725)
        const b = createRandom(20260725)
        const first = Array.from({ length: 32 }, () => a())
        const second = Array.from({ length: 32 }, () => b())
        expect(first).toEqual(second)
    })

    it('gives a different sequence for a different seed', () => {
        const a = createRandom(1)
        const b = createRandom(2)
        expect(a()).not.toBe(b())
    })

    it('stays within 0..1', () => {
        const random = createRandom(99)
        for (let index = 0; index < 5000; index++) {
            const value = random()
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(1)
        }
    })

    it('spreads across the range rather than clustering', () => {
        // A generator that returned near-identical values would scatter every
        // point to the same spot and the bug would only show up visually.
        const random = createRandom(7)
        const buckets = new Array(10).fill(0)
        for (let index = 0; index < 10000; index++) {
            buckets[Math.floor(random() * 10)]++
        }
        buckets.forEach((count) => {
            expect(count).toBeGreaterThan(700)
            expect(count).toBeLessThan(1300)
        })
    })
})
