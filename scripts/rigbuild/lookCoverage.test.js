import { describe, it, expect } from 'vitest'
import { unposedLamps, orphanKeys } from './lookCoverage.mjs'

describe('look coverage guard', () => {
    it('lists the lamps posed in no look', () => {
        const a = new Map([['l1', {}], ['l2', {}]])
        const b = new Map([['l2', {}]])
        expect(unposedLamps(['l1', 'l2', 'l3', 'l4'], [a, b])).toEqual(['l3', 'l4'])
        expect(unposedLamps(['l1'], [])).toEqual(['l1'])
    })

    it('lists the look keys no lamp group holds, with how many looks name them', () => {
        const looks = [
            { aims: { 'a/x': {}, 'ghost/x': {} }, levels: { 'a/x': 1, 'ghost/x': 1 }, colours: { 'b/y': '#fff' } },
            { aims: { 'ghost/x': {}, 'gone/y': {} } },
            {}
        ]
        expect(orphanKeys(looks, new Set(['a/x', 'b/y']))).toEqual([{ key: 'ghost/x', looks: 2 }, { key: 'gone/y', looks: 1 }])
        expect(orphanKeys(null, new Set())).toEqual([])
    })
})
