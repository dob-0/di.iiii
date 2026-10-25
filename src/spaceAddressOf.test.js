import { describe, expect, it } from 'vitest'
import { spaceAddressOf } from './SpaceSurfaceApp.jsx'

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
