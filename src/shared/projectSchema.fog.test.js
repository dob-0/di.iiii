import { describe, it, expect } from 'vitest'
import { normalizeProjectDocument } from './projectSchema.js'

describe('worldState.fog', () => {
    it('defaults to null — existing close-world spaces keep their look', () => {
        const doc = normalizeProjectDocument({})
        expect(doc.worldState.fog).toBe(null)
    })

    it('keeps an authored range, clamped sane', () => {
        const doc = normalizeProjectDocument({ worldState: { fog: { near: 40, far: 190 } } })
        expect(doc.worldState.fog).toEqual({ near: 40, far: 190 })
        const junk = normalizeProjectDocument({ worldState: { fog: { near: -5, far: 0 } } })
        expect(junk.worldState.fog).toEqual({ near: 0, far: 1 })
    })

    it('rejects a non-object fog', () => {
        const doc = normalizeProjectDocument({ worldState: { fog: 'thick' } })
        expect(doc.worldState.fog).toBe(null)
    })
})
