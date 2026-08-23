import { describe, expect, it } from 'vitest'
import { GLYPH_TABLE, layoutText } from './markerFont.js'
import { claimHref, claimMessage, formatPrice } from './claimLink.js'
import { CATEGORIES, ITEMS } from './content.js'
import { APP_PAGE_GARAGE, getAppLocationState } from '../utils/spaceRouting.js'

describe('markerFont', () => {
    it('wobbles a given string the same way every time', () => {
        // The seed is derived from the text, so a re-render must not re-roll the
        // handwriting. Two different layouts of one word would flicker.
        expect(layoutText('GARAGE')).toEqual(layoutText('GARAGE'))
    })

    it('is case-insensitive and advances past unknown characters', () => {
        expect(layoutText('sale')).toEqual(layoutText('SALE'))
        expect(layoutText('A B').width).toBeGreaterThan(layoutText('AB').width)
        expect(() => layoutText('A☃B')).not.toThrow()
    })

    it('keeps every stroke inside the em box it claims', () => {
        const { strokes, width } = layoutText('GARAGE SALE', { jitter: 0.035 })
        expect(strokes.length).toBeGreaterThan(10)
        for (const stroke of strokes) {
            for (const [x, y] of stroke) {
                expect(x).toBeGreaterThan(-0.2)
                expect(x).toBeLessThan(width + 0.2)
                expect(y).toBeGreaterThan(-0.3)
                expect(y).toBeLessThan(1.3)
            }
        }
    })

    it('has a glyph for every character the content actually uses', () => {
        const used = new Set(
            [...ITEMS.map((item) => formatPrice(item.price)), ...CATEGORIES.map((c) => c.label)]
                .join('')
                .toUpperCase()
                .replace(/ /g, '')
        )
        for (const char of used) {
            expect(GLYPH_TABLE[char], `no glyph for "${char}"`).toBeDefined()
        }
    })
})

describe('claimHref', () => {
    const item = { title: 'Grey wool coat', price: 45 }

    it('prefers whatsapp and strips punctuation from the number', () => {
        const href = claimHref(item, { whatsapp: '+49 170 555 0123', email: 'x@y.z' })
        expect(href).toContain('https://wa.me/491705550123?text=')
        expect(decodeURIComponent(href)).toContain(claimMessage(item))
    })

    it('falls back to email, and to nothing when there is no contact at all', () => {
        expect(claimHref(item, { whatsapp: '', email: 'taron@example.com' }))
            .toContain('mailto:taron@example.com?subject=')
        expect(claimHref(item, { whatsapp: '', email: '' })).toBeNull()
    })
})

describe('routing', () => {
    it('resolves /garage to its own page and never to a space', () => {
        const state = getAppLocationState({ pathname: '/garage', search: '' })
        expect(state.page).toBe(APP_PAGE_GARAGE)
        expect(state.spaceId).toBeNull()
    })
})

describe('content', () => {
    it('has unique ids and a declared category for every item', () => {
        const ids = ITEMS.map((item) => item.id)
        expect(new Set(ids).size).toBe(ids.length)
        const known = new Set(CATEGORIES.map((category) => category.id))
        for (const item of ITEMS) {
            expect(known.has(item.category), `${item.id} → ${item.category}`).toBe(true)
            expect(['available', 'reserved', 'sold']).toContain(item.status)
        }
    })
})
