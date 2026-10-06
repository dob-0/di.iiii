import { describe, expect, it } from 'vitest'
import { bloomOf } from './bloom.js'

describe('renderSettings.bloom', () => {
    it('is off unless a room asks — every room made before it draws as it did', () => {
        expect(bloomOf({})).toBeNull()
        expect(bloomOf({ bloom: {} })).toBeNull()
        expect(bloomOf({ bloom: { enabled: 'yes' } })).toBeNull()
        expect(bloomOf(null)).toBeNull()
    })
    it('defaults to a physically small glow, clamped', () => {
        expect(bloomOf({ bloom: { enabled: true } })).toEqual({ strength: 0.03, radius: 0.4, threshold: 1 })
        expect(bloomOf({ bloom: { enabled: true, strength: 9, radius: -1, threshold: 0 } })).toEqual({ strength: 1, radius: 0, threshold: 0.01 })
    })
})
