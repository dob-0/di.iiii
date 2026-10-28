import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The small mono labels of Nodes, measured by axe in Chromium (audit
// 2026-10-21 NR-07): the palette's hint words 3.33:1 (3.22 on the active
// row), its group counts 2.41, the settings column's section headings 3.24,
// the help sheet's kicker 4.05. WCAG 1.4.3 AA asks 4.5 for text this size.
// The grounds below are the ones axe reported under each label.
const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'styles/raw.css'), 'utf8')
const channel = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (fg, bg) => {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
const whiteAt = (alpha, bg) => bg.map((c) => 255 * alpha + c * (1 - alpha))
const alphaOf = (selector, prop = 'color') => {
    const body = css.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))[1]
    const value = body.match(new RegExp(`\\n\\s*${prop}:\\s*rgba\\(255, 255, 255, ([\\d.]+)\\)`))[1]
    return Number(value)
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

describe('Nodes small labels reach 4.5:1 (WCAG 1.4.3)', () => {
    const rows = [
        ['.raw-node-palette-item-title span', 'color', ['#111114', '#17282c']],
        ['.raw-node-palette-group-count', 'color', ['#0a0a0a']],
        ['.raw-property-section h5', 'color', ['#0a0a0a']],
        [':root', '--window-accent', ['#0a0a0a']]
    ]
    for (const [selector, prop, grounds] of rows) {
        it(`${selector} ${prop}`, () => {
            const alpha = alphaOf(selector, prop)
            for (const ground of grounds) {
                expect(ratio(whiteAt(alpha, hex(ground)), hex(ground))).toBeGreaterThanOrEqual(4.5)
            }
        })
    }
})
