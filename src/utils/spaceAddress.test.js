import { describe, expect, it } from 'vitest'
import { spaceAddressOf } from './spaceAddress.js'

describe('spaceAddressOf', () => {
    it('is the slug when the space has one', () => {
        expect(spaceAddressOf({ id: 'dilijan', slug: 'dilijan-camp' }, 'dilijan')).toBe('dilijan-camp')
    })
    it('is the id otherwise', () => {
        expect(spaceAddressOf({ id: 'open', slug: null }, 'open')).toBe('open')
        expect(spaceAddressOf(null, 'open')).toBe('open')
        expect(spaceAddressOf({ slug: '  ' }, 'open')).toBe('open')
    })
})

describe('spaceAddressOf with the space alone', () => {
    it('takes the id from the space', () => {
        expect(spaceAddressOf({ id: 'open' })).toBe('open')
        expect(spaceAddressOf({ id: 'dilijan', slug: 'dilijan-camp' })).toBe('dilijan-camp')
    })
})
