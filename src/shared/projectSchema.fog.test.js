import { describe, it, expect } from 'vitest'
import { normalizeProjectDocument } from './projectSchema.js'

describe('worldState.fog', () => {
    it('defaults to null — existing close-world spaces keep their look', () => {
        const doc = normalizeProjectDocument({})
        expect(doc.worldState.fog).toBe(null)
    })

    it('keeps an authored range, clamped sane', () => {
        const doc = normalizeProjectDocument({ worldState: { fog: { near: 40, far: 190 } } })
        expect(doc.worldState.fog).toEqual({ near: 40, far: 190, color: null, enabled: true })
        const junk = normalizeProjectDocument({ worldState: { fog: { near: -5, far: 0 } } })
        expect(junk.worldState.fog).toEqual({ near: 0, far: 1, color: null, enabled: true })
    })

    // A null colour means "follow the background", which is what fog did when it
    // was hardcoded. Authoring a colour is the only way to see fog on a light
    // ground, where fog-the-colour-of-the-background is invisible.
    it('carries an authored colour, and defaults it to null', () => {
        const doc = normalizeProjectDocument({ worldState: { fog: { near: 6, far: 34, color: '#efe7da' } } })
        expect(doc.worldState.fog.color).toBe('#efe7da')
        expect(normalizeProjectDocument({ worldState: { fog: { near: 6, far: 34 } } }).worldState.fog.color).toBe(null)
    })

    it('can be switched off without losing the authored range', () => {
        const doc = normalizeProjectDocument({ worldState: { fog: { near: 6, far: 34, enabled: false } } })
        expect(doc.worldState.fog).toEqual({ near: 6, far: 34, color: null, enabled: false })
    })

    it('rejects a non-object fog', () => {
        const doc = normalizeProjectDocument({ worldState: { fog: 'thick' } })
        expect(doc.worldState.fog).toBe(null)
    })
})
