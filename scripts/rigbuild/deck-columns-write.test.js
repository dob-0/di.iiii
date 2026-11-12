// deck-columns-write.mjs (owner N3919): the plan names each column's cue, keeps the rest of the deck, and refuses a vague or missing cue.
import { describe, it, expect } from 'vitest'
import { planColumns } from './deck-columns-write.mjs'

const document = { nodes: [{ id: 'n1', typeId: 'vj.deck', values: { deck: { columns: 3, other: 7 } } }], mappingState: { cues: [{ id: 'v2-07-red' }, { id: 'v2-09-ice' }, { id: 'v2-070-x' }] } }

describe('planColumns', () => {
    it('resolves by prefix, keeps other deck fields, pads to the column count', () => {
        const p = planColumns({ document, map: ['v2-07', 'v2-09'] })
        expect(p.columnCues).toEqual(['v2-07-red', 'v2-09-ice', ''])
        expect(p.deck.other).toBe(7)
    })
    it('refuses a cue that matches none', () => {
        expect(() => planColumns({ document, map: ['v2-99'] })).toThrow(/matches 0/)
    })
})
