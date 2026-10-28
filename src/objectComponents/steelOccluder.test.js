import { describe, expect, it } from 'vitest'
import { isSteelEntity } from './steelOccluder.js'
import { normalizeEntity } from '../shared/projectSchema.js'

describe('which entities are steel (by what they are, never by name)', () => {
    it('truss and tower pieces are; a deck is not', () => {
        expect(isSteelEntity({ id: 'a', components: { piece: { kind: 'truss-3m' } } })).toBe(true)
        expect(isSteelEntity({ id: 'a', components: { piece: { kind: 'tower' } } })).toBe(true)
        expect(isSteelEntity({ id: 'a', components: { piece: { kind: 'deck-2x1' } } })).toBe(false)
    })
    it('an entity flagged occluder steel is, whatever it is called', () => {
        expect(isSteelEntity({ id: 'anything', name: 'x', components: { occluder: { kind: 'steel' } } })).toBe(true)
        expect(isSteelEntity({ id: 'crane-bridge', name: 'crane bridge', components: {} })).toBe(false)   // a name proves nothing
        expect(isSteelEntity({ id: 'q', components: { occluder: { kind: 'glass' } } })).toBe(false)
    })
    it('a lamp is never steel, flagged or not', () => {
        expect(isSteelEntity({ id: 'l', components: { light: {}, occluder: { kind: 'steel' } } })).toBe(false)
        expect(isSteelEntity({ id: 'l', components: { fixture: { type: 'x' }, piece: { kind: 'truss-3m' } } })).toBe(false)
        expect(isSteelEntity(null)).toBe(false)
    })
    it('the flag survives the document schema', () => {
        const e = normalizeEntity({ id: 'b', type: 'box', components: { occluder: { kind: 'steel' } } })
        expect(isSteelEntity(e)).toBe(true)
    })
})
