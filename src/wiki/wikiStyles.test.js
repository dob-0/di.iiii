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
})
