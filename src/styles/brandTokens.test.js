import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Brand spec v2's decided rows, held in the token layer (src/styles/base.css):
// M17 square corners, M13 the accent on a light ground, M37 the wordmark rules
// a page can use without the header, M23 the live green named as a quotation.

const HERE = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(HERE, 'base.css'), 'utf8')

const token = (name) => {
    const m = css.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))
    return m ? m[1].trim() : null
}

// WCAG 2.2 relative luminance (the 0.04045 threshold) and contrast ratio,
// written out so no library decides what "readable" means.
const channel = (c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
const hex = (value) => {
    const m = /^#([0-9a-f]{6})$/i.exec(value || '')
    if (!m) return null
    return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
}

const WHITE = [0xff, 0xff, 0xff]
const PAPER = [0xf7, 0xf7, 0xf5]

// The block of declarations for an exact selector.
const rule = (selector) => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = css.match(new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`))
    return m ? m[1] : null
}

describe('brand tokens v2', () => {
    it('M17: corners are square — --di-radius is 0', () => {
        expect(token('--di-radius')).toBe('0')
    })

    it('M13: the accent on a light ground exists and is readable on white and paper', () => {
        const mark = hex(token('--di-accent-on-light'))
        const ink = hex(token('--di-accent-ink-on-light'))
        expect(mark).toEqual([0x00, 0x97, 0xa3])
        expect(ink).toEqual([0x00, 0x75, 0x7f])
        for (const ground of [WHITE, PAPER]) {
            // a mark (the wordmark's dot, a UI mark): non-text contrast, 3:1
            expect(ratio(mark, ground)).toBeGreaterThanOrEqual(3)
            // accent text: body-text contrast, 4.5:1
            expect(ratio(ink, ground)).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('M37: the wordmark rules live in base.css, so a footer works without the header', () => {
        expect(rule('.name')).toMatch(/text-transform\s*:\s*none/)
        expect(rule('.dot')).toMatch(/color\s*:\s*var\(--di-cyan\)/)
        const name = rule('.di-name')
        expect(name).toMatch(/font-weight\s*:\s*700/)
        expect(name).toMatch(/font-family\s*:\s*var\(--di-sans\)/)
        expect(name).toMatch(/letter-spacing\s*:\s*-0\.02em/)
    })

    it("M23: the live green is marked as a quotation of Dracula's green", () => {
        const line = css.split('\n').find((l) => /^\s*--di-live-rgb\s*:/.test(l))
        expect(line).toMatch(/80,\s*250,\s*123/)
        expect(line).toContain("quotation of Dracula's green (SYSTEM rule 8)")
    })
})
