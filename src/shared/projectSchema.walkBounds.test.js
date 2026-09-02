import { describe, it, expect } from 'vitest'
import { normalizeProjectDocument, normalizeWalkBounds } from './projectSchema.js'

// worldState.walkBounds — where a visitor can stand in walk mode. A room loaded as one
// model is a single entity at its origin, so the walker's own guess (entity extent plus
// a margin) is a 36 m square and the walls are walked straight through; this is how a
// room says where its walls are.
describe('worldState.walkBounds', () => {
    it('defaults to null — the walker keeps guessing from the entities', () => {
        const doc = normalizeProjectDocument({})
        expect(doc.worldState.walkBounds).toBe(null)
    })

    it('keeps an authored box', () => {
        const doc = normalizeProjectDocument({ worldState: { walkBounds: { minX: -14, maxX: 13.8, minZ: -8.3, maxZ: 7.4 } } })
        expect(doc.worldState.walkBounds).toEqual({ minX: -14, maxX: 13.8, minZ: -8.3, maxZ: 7.4 })
    })

    it('drops a box that is not a box rather than pinning the visitor to a line', () => {
        expect(normalizeWalkBounds({ minX: 5, maxX: 5, minZ: -1, maxZ: 1 })).toBe(null)
        expect(normalizeWalkBounds({ minX: 5, maxX: -5, minZ: -1, maxZ: 1 })).toBe(null)
    })

    it('drops a partial or non-numeric box', () => {
        expect(normalizeWalkBounds({ minX: -1, maxX: 1 })).toBe(null)
        expect(normalizeWalkBounds({ minX: 'a', maxX: 1, minZ: -1, maxZ: 1 })).toBe(null)
        expect(normalizeWalkBounds('room')).toBe(null)
        expect(normalizeWalkBounds(null)).toBe(null)
    })
})
