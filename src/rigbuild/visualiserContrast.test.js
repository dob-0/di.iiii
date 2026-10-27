// @vitest-environment node
// Audit 2026-10-21 (docs/ai/audits/2026-10-21-rig-show-pages.md, row V1): axe-core found the visualiser's
// one-word title at 2.9:1 on every device (color-contrast, serious; WCAG 1.4.3 asks 4.5:1). The title's colour
// token is resolved from base.css and measured against the page's black ground. It sees no screen.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const base = read('../styles/base.css')
const token = (name, seen = 0) => {
    const m = base.match(new RegExp(`${name}:\\s*([^;]+);`))
    if (!m || seen > 5) return null
    const ref = m[1].match(/^var\((--[\w-]+)\)$/)
    return ref ? token(ref[1], seen + 1) : m[1].trim()
}
const rgba = (v) => {
    if (/^#([0-9a-f]{3}){1,2}$/i.test(v)) {
        const h = v.length === 4 ? v.slice(1).split('').map((c) => c + c).join('') : v.slice(1)
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1)
    }
    const n = (v.match(/[\d.]+/g) || []).map(Number)
    return [n[0], n[1], n[2], n[3] ?? 1]
}
const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (fg, bg) => { const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

describe('the visualiser title', () => {
    it('reads at 4.5:1 or better on the page ground', () => {
        const css = read('./visualiser.css')
        const rule = css.match(/\.vis-title\s*\{([^}]*)\}/)[1]
        const colour = rule.match(/(?:^|;|\s)color:\s*([^;]+);/)[1].trim()
        const value = colour.startsWith('var(') ? token(colour.slice(4, -1)) : colour
        const [r, g, b, a] = rgba(value)
        const ground = rgba(token('--di-bg'))
        const fg = [r, g, b].map((c, i) => c * a + ground[i] * (1 - a))
        expect(ratio(fg, ground)).toBeGreaterThanOrEqual(4.5)
    })
})
