import { describe, expect, it } from 'vitest'
import {
    getSpaceSlugLimits,
    isValidSpaceSlug,
    slugifySpaceName
} from './spaceNames.js'

describe('slugifySpaceName', () => {
    it('sanitizes and lowercases names', () => {
        expect(slugifySpaceName('Hello World!')).toBe('hello-world')
        expect(slugifySpaceName('  Fancy__Name ')).toBe('fancy-name')
    })

    it('limits slug length', () => {
        const long = 'A'.repeat(60)
        expect(slugifySpaceName(long)).toHaveLength(getSpaceSlugLimits().max)
    })
})

describe('isValidSpaceSlug', () => {
    it('accepts safe slugs and rejects invalid ones', () => {
        expect(isValidSpaceSlug('abc')).toBe(true)
        expect(isValidSpaceSlug('abc-123')).toBe(true)
        expect(isValidSpaceSlug('ab')).toBe(false)
        expect(isValidSpaceSlug('bad slug')).toBe(false)
        expect(isValidSpaceSlug('')).toBe(false)
    })
})

describe('getSpaceSlugLimits', () => {
    it('returns min and max bounds', () => {
        expect(getSpaceSlugLimits()).toEqual({ min: 3, max: 48 })
    })
})
