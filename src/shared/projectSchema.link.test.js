import { describe, it, expect } from 'vitest'
import { normalizeEntity, sanitizeLinkHref } from './projectSchema.js'

// components.link is untrusted document input that a visitor's click follows.
// The normaliser is the one funnel every document passes through (ESM here,
// shared/projectSchema.cjs on the server — serverXR/src/schemaSync.test.js
// holds the two to the same answer), so an unsafe scheme is dropped there,
// not only at click time.
const linkOf = (link) => normalizeEntity({ id: 'e', type: 'image', components: { link } }).components.link

describe('components.link normalisation', () => {
    it('keeps an in-platform path and an https url', () => {
        expect(linkOf({ enabled: true, href: '/main/deck' })).toEqual({ enabled: true, href: '/main/deck', label: '' })
        expect(linkOf({ enabled: true, href: 'https://thedi.studio/deck' }).href).toBe('https://thedi.studio/deck')
        expect(linkOf({ enabled: true, href: 'http://example.org' }).href).toBe('http://example.org')
    })

    it.each([
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        ' javascript:alert(1)',
        'java\tscript:alert(1)',
        'java\nscript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        'blob:https://x/y'
    ])('drops the unsafe href %j', (href) => {
        expect(linkOf({ enabled: true, href }).href).toBe('')
    })

    it('keeps a label, trimmed, and caps runaway strings', () => {
        expect(linkOf({ enabled: true, href: '/a', label: '  Deck  ' }).label).toBe('Deck')
        expect(sanitizeLinkHref(`https://x.org/${'a'.repeat(5000)}`)).toBe('')
    })

    it('leaves an entity with no link without one', () => {
        expect(normalizeEntity({ id: 'e', type: 'image', components: {} }).components.link).toBeUndefined()
    })

    it('a disabled link keeps its href (the author can switch it back on)', () => {
        expect(linkOf({ enabled: false, href: '/main' })).toEqual({ enabled: false, href: '/main', label: '' })
    })
})
