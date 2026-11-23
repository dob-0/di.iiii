import { describe, expect, it } from 'vitest'

import { ago } from './monitorFormat.js'

describe('ago', () => {
    it('measures against the clock it is given, and against this page\'s own when none is given', () => {
        const at = Date.parse('2026-01-01T12:00:00Z') // a clock that is not this page's
        expect(ago(new Date(at - 12 * 60 * 1000).toISOString(), at)).toBe('12m ago')
        expect(ago(new Date(at - 3 * 60 * 60 * 1000).toISOString(), at)).toBe('3h ago')
        expect(ago(new Date(at - 2000).toISOString(), at)).toBe('now')
        expect(ago(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5m ago') // the one-argument callers are unchanged
        expect(ago(new Date(Date.now() - 5 * 60 * 1000).toISOString(), undefined)).toBe('5m ago')
    })

    it('says never and n/a without the word ago', () => {
        expect(ago(null, 1)).toBe('never')
        expect(ago('not a date', 1)).toBe('n/a')
        expect(ago(null)).toBe('never')
    })
})
