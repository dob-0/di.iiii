import { describe, it, expect } from 'vitest'
import { area, clipRect, unionArea, paddingShare, emptyShare, emptyArea, countLines, classifyTarget, mainViewStart, rankOffenders, median, toMarkdownTable } from './space-audit-lib.mjs'

const R = (x, y, w, h) => ({ x, y, w, h })

describe('space-audit-lib', () => {
    it('area and clip', () => {
        expect(area(R(0, 0, 3, 4))).toBe(12)
        expect(clipRect(R(-5, -5, 10, 10), R(0, 0, 100, 100))).toEqual(R(0, 0, 5, 5))
        expect(clipRect(R(200, 0, 10, 10), R(0, 0, 100, 100))).toBeNull()
    })
    it('union counts overlaps once', () => {
        expect(unionArea([R(0, 0, 10, 10), R(5, 5, 10, 10)])).toBe(175)
        expect(unionArea([R(0, 0, 10, 10), R(0, 0, 10, 10)])).toBe(100)
        expect(unionArea([R(0, 0, 10, 10), R(20, 0, 10, 10)])).toBe(200)
        expect(unionArea([])).toBe(0)
    })
    it('union clips to the first screen', () => {
        expect(unionArea([R(0, 90, 10, 20)], R(0, 0, 100, 100))).toBe(100)
    })
    it('union of a cross is not double counted', () => {
        expect(unionArea([R(0, 4, 10, 2), R(4, 0, 2, 10)])).toBe(20 + 20 - 4)
    })
    it('padding share', () => {
        expect(paddingShare(R(0, 0, 100, 40), { t: 10, b: 10, l: 0, r: 0 }, {})).toBeCloseTo(0.5)
        expect(paddingShare(R(0, 0, 10, 10), { t: 1, r: 1, b: 1, l: 1 }, { t: 1, r: 1, b: 1, l: 1 })).toBeCloseTo(0.64)
        expect(paddingShare(R(0, 0, 0, 0))).toBe(0)
    })
    it('empty area of a half-empty strip', () => {
        const strip = R(0, 0, 100, 100)
        expect(emptyShare(strip, [R(0, 0, 100, 50)])).toBeCloseTo(0.5)
        expect(emptyArea(strip, [R(0, 0, 100, 50), R(0, 25, 100, 50)])).toBe(2500)
        expect(emptyShare(strip, [R(-50, -50, 300, 300)])).toBe(0)
    })
    it('lines merge rects on one baseline', () => {
        expect(countLines([R(0, 0, 50, 16), R(60, 1, 40, 16), R(0, 20, 80, 16)])).toBe(2)
        expect(countLines([])).toBe(0)
    })
    it('touch targets by pointer', () => {
        expect(classifyTarget(R(0, 0, 20, 30), 'fine')).toEqual({ small: true, oversize: false })
        expect(classifyTarget(R(0, 0, 40, 40), 'coarse')).toEqual({ small: true, oversize: false })
        expect(classifyTarget(R(0, 0, 100, 60), 'fine')).toEqual({ small: false, oversize: true })
        expect(classifyTarget(R(0, 0, 100, 60), 'coarse')).toEqual({ small: false, oversize: false })
    })
    it('main view start', () => {
        expect(mainViewStart(339, 678)).toEqual({ px: 339, share: 339 / 678, belowFold: false })
        expect(mainViewStart(900, 678)).toEqual({ px: 900, share: 1, belowFold: true })
        expect(mainViewStart(null, 678).px).toBeNull()
    })
    it('ranks by summed waste, worst instance kept', () => {
        const rows = [
            { cls: 'a', viewport: 'v1', wastePx2: 100 }, { cls: 'a', viewport: 'v2', wastePx2: 300 },
            { cls: 'b', viewport: 'v1', wastePx2: 350 }, { cls: 'c', viewport: 'v1', wastePx2: 0 }
        ]
        const top = rankOffenders(rows, 5)
        expect(top.map((t) => t.cls)).toEqual(['a', 'b'])
        expect(top[0]).toMatchObject({ score: 400, seen: 2 })
        expect(top[0].worst.viewport).toBe('v2')
    })
    it('median and table', () => {
        expect(median([3, 1, 2])).toBe(2)
        expect(median([1, 2, 3, 4])).toBe(2.5)
        expect(toMarkdownTable(['a', 'b'], [[1, 'x|y']])).toBe('| a | b |\n| --- | --- |\n| 1 | x\\|y |')
    })
})
