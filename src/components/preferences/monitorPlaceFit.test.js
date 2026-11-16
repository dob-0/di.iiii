import { describe, expect, it } from 'vitest'
import { chipPriority, fitPriority, shortLabel } from './monitorPlaceFit.js'

const item = (id, w, p) => ({ id, w, p })

describe('fitPriority', () => {
    it('keeps everything when it fits', () => {
        const r = fitPriority([item('a', 50, 1), item('b', 50, 2)], 110, 8, 30)
        expect(r).toEqual({ shown: ['a', 'b'], hidden: [] })
    })
    it('drops the least important first and leaves room for the +N button', () => {
        const items = [item('a', 60, 3), item('b', 60, 1), item('c', 60, 4), item('d', 60, 2)]
        // 4 x 60 + 3 x 8 = 264 > 200; without c: 192 + 8 + 30 = 230 > 200; without c and a: 128 + 38 = 166 <= 200
        const r = fitPriority(items, 200, 8, 30)
        expect(r.hidden).toEqual(['a', 'c'])
        expect(r.shown).toEqual(['b', 'd'])
    })
    it('of equal priority the later chip goes first, and the order of the rest is kept', () => {
        const r = fitPriority([item('a', 50, 2), item('b', 50, 2), item('c', 50, 2)], 130, 0, 30)
        expect(r.shown).toEqual(['a', 'b'])
        expect(r.hidden).toEqual(['c'])
    })
    it('hides all when nothing fits, never throws on empty or unmeasured input', () => {
        expect(fitPriority([item('a', 80, 1)], 40, 0, 30)).toEqual({ shown: [], hidden: ['a'] })
        expect(fitPriority([], 100)).toEqual({ shown: [], hidden: [] })
        expect(fitPriority(null, 100)).toEqual({ shown: [], hidden: [] })
        // before the first measure (width 0) everything is shown
        expect(fitPriority([item('a', 80, 1)], 0)).toEqual({ shown: ['a'], hidden: [] })
    })
    it('a shrinking width only ever hides more', () => {
        const items = [item('a', 60, 1), item('b', 60, 2), item('c', 60, 3), item('d', 60, 4)]
        let last = -1
        for (let w = 300; w >= 40; w -= 20) {
            const n = fitPriority(items, w, 8, 30).hidden.length
            expect(n).toBeGreaterThanOrEqual(last)
            last = n
        }
    })
})

describe('chip priority and short labels', () => {
    it('ranks a chip that needs him first, then tiers, then counts', () => {
        expect(chipPriority({ id: 'tier:prod', tierId: 'prod', tone: 'warning' })).toBe(1)
        expect(chipPriority({ id: 'tier:dev', tierId: 'dev', tone: 'success' })).toBe(2)
        expect(chipPriority({ id: 'machines', tone: 'success' })).toBe(3)
        expect(chipPriority({ id: 'people', tone: 'default' })).toBe(4)
    })
    it('shortens the count labels and leaves tier names alone', () => {
        expect(shortLabel({ id: 'services', label: 'Services' })).toBe('svc')
        expect(shortLabel({ id: 'tier:prod', label: 'prod' })).toBe('prod')
    })
})
