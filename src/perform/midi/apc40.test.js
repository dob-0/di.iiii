import { describe, it, expect } from 'vitest'
import { apc40Banked } from './apc40.js'

describe('apc40Banked with a bank count: the columns go round', () => {
    it('a row bound to the second 8 columns shows the first 8 in bank 2, and the first row the second 8', () => {
        const map = [
            { match: { kind: 'note', number: 32, channel: 1 }, action: 'column', args: { column: 0 } },
            { match: { kind: 'note', number: 24, channel: 1 }, action: 'column', args: { column: 8 } },
            { match: { kind: 'note', number: 0, channel: 1 }, action: 'fxPress', args: { type: 'top.cuts', param: 'hit' } }
        ]
        expect(apc40Banked(map, 0, 2)).toBe(map)
        const second = apc40Banked(map, 1, 2)
        expect(second[0].args.column).toBe(8)
        expect(second[1].args.column).toBe(0)
        expect(second[2]).toBe(map[2])
        // without a count the old rule stands: only the first 8 columns move
        expect(apc40Banked(map, 1)[1].args.column).toBe(8)
    })
})
