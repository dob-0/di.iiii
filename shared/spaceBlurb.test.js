import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const { SPACE_BLURB_MAX, normalizeSpaceBlurb } = createRequire(import.meta.url)('./spaceBlurb.cjs')

describe('a space\'s one line for visitors', () => {
    it('collapses to one line and trims', () => {
        expect(normalizeSpaceBlurb('  a\n\tb   c ')).toBe('a b c')
    })

    it('empty and null clear it', () => {
        expect(normalizeSpaceBlurb('')).toBeNull()
        expect(normalizeSpaceBlurb('   ')).toBeNull()
        expect(normalizeSpaceBlurb(null)).toBeNull()
    })

    it('refuses what is not a string, and what is longer than the limit', () => {
        expect(normalizeSpaceBlurb(7)).toBeUndefined()
        expect(normalizeSpaceBlurb({})).toBeUndefined()
        expect(normalizeSpaceBlurb('x'.repeat(SPACE_BLURB_MAX))).toHaveLength(SPACE_BLURB_MAX)
        expect(normalizeSpaceBlurb('x'.repeat(SPACE_BLURB_MAX + 1))).toBeUndefined()
    })

    it('keeps Armenian as written', () => {
        expect(normalizeSpaceBlurb('Դիլիջան')).toBe('Դիլիջան')
    })
})
