import { describe, it, expect } from 'vitest'
import {
    hammingHex, median, blurFloorFor, selectFrames, framesVerdict,
    ABSOLUTE_BLUR_FLOOR, MIN_USABLE_FRAMES
} from './frames-lib.mjs'

const frame = (name, sharpness, hash) => ({ path: `/f/${name}.jpg`, sharpness, hash, source: 'video' })

describe('hammingHex', () => {
    it('is zero for the same hash and counts differing bits', () => {
        expect(hammingHex('0000000000000000', '0000000000000000')).toBe(0)
        expect(hammingHex('0000000000000001', '0000000000000000')).toBe(1)
        expect(hammingHex('000000000000000f', '0000000000000000')).toBe(4)
        expect(hammingHex('ffffffffffffffff', '0000000000000000')).toBe(64)
    })

    it('treats an unusable hash as infinitely far, never as a match', () => {
        expect(hammingHex('', '0000000000000000')).toBe(Infinity)
        expect(hammingHex('abc', '0000000000000000')).toBe(Infinity)
        expect(hammingHex(null, '0000000000000000')).toBe(Infinity)
    })
})

describe('median and the blur floor', () => {
    it('takes the middle of an odd list and the mean of two middles', () => {
        expect(median([3, 1, 2])).toBe(2)
        expect(median([1, 2, 3, 4])).toBe(2.5)
        expect(median([])).toBe(0)
    })

    it('reads the floor off the batch but never drops below the absolute floor', () => {
        const bright = [frame('a', 1000, '0'.repeat(16)), frame('b', 1000, '1'.repeat(16))]
        expect(blurFloorFor(bright)).toBeCloseTo(350)
        const smeared = [frame('a', 4, '0'.repeat(16)), frame('b', 6, '1'.repeat(16))]
        expect(blurFloorFor(smeared)).toBe(ABSOLUTE_BLUR_FLOOR)
    })

    it('honours an explicit floor', () => {
        expect(blurFloorFor([frame('a', 900, '0'.repeat(16))], 42)).toBe(42)
    })
})

describe('selectFrames', () => {
    const distinct = (index) => index.toString(16).padStart(16, '0')
    // Eight bits apart each step: a walk down a hall, not a camera standing still.
    const APART = ['0000000000000000', '00000000000000ff', '000000000000ff00', '0000000000ff0000']

    it('keeps sharp, distinct frames', () => {
        const candidates = APART.map((hash, i) => frame(`f${i}`, 500, hash))
        const { kept, rejected } = selectFrames(candidates)
        expect(kept).toHaveLength(4)
        expect(rejected).toHaveLength(0)
    })

    it('throws out the blurry ones with a reason', () => {
        const candidates = [
            frame('sharp1', 800, distinct(1)),
            frame('smeared', 5, distinct(0xff00)),
            frame('sharp2', 900, distinct(0xff0000))
        ]
        const { kept, rejected } = selectFrames(candidates)
        expect(kept.map((entry) => entry.path)).toEqual(['/f/sharp1.jpg', '/f/sharp2.jpg'])
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toBe('blurry')
    })

    it('throws out an unreadable frame (sharpness -1) rather than guessing', () => {
        const { kept, rejected } = selectFrames([
            frame('ok', 700, distinct(1)),
            { path: '/f/broken.jpg', sharpness: -1, hash: '', source: 'photo' }
        ])
        expect(kept).toHaveLength(1)
        expect(rejected[0].reason).toBe('blurry')
    })

    it('drops the same picture twice and keeps the sharper of the pair', () => {
        const same = distinct(0b1010)
        const { kept, rejected } = selectFrames([
            frame('soft', 400, same),
            frame('crisp', 900, same)
        ])
        expect(kept).toHaveLength(1)
        expect(kept[0].path).toBe('/f/crisp.jpg')
        expect(rejected[0].path).toBe('/f/soft.jpg')
        expect(rejected[0].reason).toBe('near-duplicate')
    })

    it('does not unseat the standing frame on a hair of difference', () => {
        const same = distinct(0b1010)
        const { kept } = selectFrames([frame('first', 800, same), frame('second', 810, same)])
        expect(kept).toHaveLength(1)
        expect(kept[0].path).toBe('/f/first.jpg')
    })

    it('a slow pan is not a duplicate — each frame differs by more than the threshold', () => {
        const candidates = [
            frame('a', 600, '0000000000000000'),
            frame('b', 600, '00000000000000ff'), // 8 bits apart
            frame('c', 600, '000000000000ffff') // another 8
        ]
        const { kept } = selectFrames(candidates)
        expect(kept).toHaveLength(3)
    })
})

describe('framesVerdict', () => {
    it('says plainly when the footage is too thin', () => {
        const verdict = framesVerdict(12, [{ reason: 'blurry' }, { reason: 'near-duplicate' }])
        expect(verdict.ok).toBe(false)
        expect(verdict.lines.join(' ')).toContain('NOT ENOUGH')
        expect(verdict.lines.join(' ')).toContain(String(MIN_USABLE_FRAMES))
    })

    it('counts both reasons and passes a healthy batch', () => {
        const verdict = framesVerdict(120, [
            { reason: 'blurry' }, { reason: 'blurry' }, { reason: 'near-duplicate' }
        ])
        expect(verdict.ok).toBe(true)
        expect(verdict.blurry).toBe(2)
        expect(verdict.duplicates).toBe(1)
        expect(verdict.lines).toHaveLength(1)
    })
})
