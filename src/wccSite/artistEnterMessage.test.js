import { describe, expect, it } from 'vitest'
import { readArtistEnterMessage } from './artistEnterMessage.js'

const ORIGIN = 'https://di-studio.xyz'
const msg = (overrides = {}) => ({
    origin: ORIGIN,
    data: { type: 'dii-wcc-artist-enter', projectId: 'alla-virabyan' },
    ...overrides
})

describe('readArtistEnterMessage', () => {
    it('accepts a well-formed same-origin message', () => {
        expect(readArtistEnterMessage(msg(), ORIGIN)).toBe('alla-virabyan')
    })

    // Regression guard: the handler once accepted messages from ANY origin.
    it('rejects cross-origin messages even with a valid payload', () => {
        expect(readArtistEnterMessage(msg({ origin: 'https://evil.example' }), ORIGIN)).toBeNull()
        expect(readArtistEnterMessage(msg({ origin: 'null' }), ORIGIN)).toBeNull()
    })

    it('rejects wrong types and missing project ids', () => {
        expect(readArtistEnterMessage(msg({ data: { type: 'other' } }), ORIGIN)).toBeNull()
        expect(readArtistEnterMessage(msg({ data: { type: 'dii-wcc-artist-enter' } }), ORIGIN)).toBeNull()
        expect(readArtistEnterMessage(null, ORIGIN)).toBeNull()
    })
})
