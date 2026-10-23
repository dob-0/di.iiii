import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(resolve(HERE, rel), 'utf8')
const wiki = read('./wiki.css')
const base = read('../styles/base.css')
const rule = (selector) => {
    const at = wiki.indexOf(`${selector} {`)
    return at < 0 ? '' : wiki.slice(at, wiki.indexOf('}', at))
}

// WCAG 2.1 relative luminance — the same arithmetic as src/styles/contrast.test.js.
const channel = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (fg, bg) => {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

describe('wiki.css', () => {
    // Audit 2026-10-21 W1 (axe color-contrast, serious, desktop @1x and @2x):
    // "Updated …" under every article was --di-text-muted at opacity 0.7.
    it('keeps the "Updated" line at AA contrast on the article ground', () => {
        const block = rule('.wiki-article-updated')
        expect(block).toMatch(/color:\s*var\(--di-text-muted\)/)
        const opacity = Number((block.match(/opacity:\s*([\d.]+)/) || [])[1] ?? 1)
        const muted = base.match(/--di-text-muted:\s*rgba\(([^)]+)\)/)[1].split(',').map(Number)
        const surface = hex(base.match(/--di-surface:\s*(#[0-9a-f]{6})/i)[1])
        const alpha = muted[3] * opacity
        const fg = surface.map((bg, i) => muted[i] * alpha + bg * (1 - alpha))
        expect(ratio(fg, surface)).toBeGreaterThanOrEqual(4.5)
    })

    // Audit 2026-10-21 W2 (WCAG 2.4.7): Tab onto the search and the only change
    // was a 1 px border going from one cyan to another (outline: none, measured).
    it('rings the search field when it has keyboard focus', () => {
        expect(rule('.wiki-search:focus-visible')).toMatch(/outline:\s*2px solid var\(--di-cyan\)/)
    })

    // Audit 2026-10-21 W6, measured in Chromium at 1440x900: 25 % of the screen
    // (the margins beside the text) is the background canvas, and a wheel there
    // moved the page 0 px. Same cause as the landing's (landing.css, L6): a fixed
    // layer whose canvas turns pointer events back on, inline.
    it('lets the background canvas take no pointer events, so a wheel anywhere scrolls', () => {
        const at = wiki.indexOf('.wiki-root .grid-floor-background *')
        expect(at).toBeGreaterThanOrEqual(0)
        expect(wiki.slice(at, wiki.indexOf('}', at))).toMatch(/pointer-events:\s*none\s*!important/)
    })
})

// Audit D03/D27 (2026-10-21): the wiki's three eyebrows were sans with a
// hand-made tracking (.2em, .14em, .14em) while every other label on the
// platform is mono at --di-label-tracking. Rhythm and sizes are guarded by
// src/styles/spine.test.js, which no longer exempts this file.
describe('wiki.css eyebrows and links', () => {
    it.each(['.wiki-eyebrow', '.wiki-sidebar-category', '.wiki-article-category'])(
        '%s is mono at the label tracking',
        (selector) => {
            const block = rule(selector)
            expect(block).toMatch(/font-family:\s*var\(--di-mono\)/)
            expect(block).toMatch(/letter-spacing:\s*var\(--di-label-tracking\)/)
        },
    )

    it('draws sidebar links in --di-text, not dimmed by an opacity off the scale', () => {
        const block = rule('.wiki-sidebar-link')
        expect(block).toMatch(/color:\s*var\(--di-text\)/)
        expect(block).not.toMatch(/opacity/)
    })
})
