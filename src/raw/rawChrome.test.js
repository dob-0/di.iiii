import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getWorkspaceTopInset } from './utils/windowLayout.js'

// The Nodes chrome contract (audit 2026-10-05, rows 5-6), measured on the
// stylesheet that carries it: jsdom does no layout, so what is checked is the
// declared value every cell and bar reads.
const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'styles/rawChrome.css'), 'utf8')
const token = (name, source = css) => {
    const match = source.match(new RegExp(`${name}:\\s*([^;]+);`))
    return match ? match[1].trim() : null
}

describe('one bar (row 5)', () => {
    it('is 40px, and the canvas starts at its bottom edge', () => {
        expect(token('--raw-bar-h')).toBe('40px')
        expect(css).toMatch(/\.raw-editor-shell > \.sbar \{[^}]*height: var\(--raw-bar-h\)/)
        // The workspace inset under the bar is the bar's bottom: 40, no padding.
        expect(getWorkspaceTopInset({ topbarRect: { bottom: 40 }, padding: 0 })).toBe(40)
    })

    it('has one cell height: 28 on a mouse, 44 on a finger, and no cell sets its own', () => {
        expect(token('--raw-cell')).toBe('28px')
        const coarse = css.match(/@media \(pointer: coarse\) \{([^}]*\})/)[1]
        expect(coarse).toMatch(/:root \{[^}]*--raw-cell: 44px;/)
        // …and the bar is a pixel taller than its cells, on a finger too.
        expect(coarse).toMatch(/--raw-bar-h: calc\(var\(--raw-cell\) \+ 1px\)/)
        const rule = css.match(/\.raw-editor-shell button\.raw-cell \{([^}]*)\}/)[1]
        expect(rule).toMatch(/height: var\(--raw-cell\)/)
        expect(rule).not.toMatch(/min-height/)
    })

    it('a phone keeps only ? and ⋯ on the right; the rest are rows of ⋯ (390px measured)', () => {
        const phone = css.slice(css.indexOf('@media (max-width: 699px)'))
        expect(phone).toMatch(/button\.raw-cell\.raw-cell--wide-only,[^{]*\.raw-bar-account-slot,[^{]*\.sbar-switch,[^{]*\.raw-bar-trail \{ display: none; \}/)
        expect(phone).toMatch(/\.raw-overflow-narrow-only \{ display: block; \}/)
    })

    it('squares the account cell: radius 0, the same cell size', () => {
        expect(token('--raw-radius')).toBe('0')
        expect(css).toMatch(/\.raw-bar-account \{[^}]*width: var\(--raw-cell\)[^}]*height: var\(--raw-cell\)/s)
    })
})

// Row 6: the census. Every size, space and radius in the Nodes chrome sheet
// is on the scale, so the sheet has <= 3 font sizes, <= 6 spacing values and
// no radius over 2px.
const SCALE_SPACE = new Set([0, 4, 8, 12, 16, 24, 32])
const SCALE_TEXT = new Set([11, 13, 15])
const resolve = (value) => value.replace(/var\(--raw-s-(\d)\)/g, (_, n) => `${[4, 8, 12, 16, 24, 32][Number(n) - 1]}px`)
    .replace(/var\(--raw-text-(meta|body|title)\)/g, (_, k) => ({ meta: '11px', body: '13px', title: '15px' })[k])
const declarations = (source) => [...source.matchAll(/([a-z-]+):\s*([^;{}]+);/g)].map((m) => [m[1], m[2].trim()])
    .filter(([prop]) => !prop.startsWith('--'))

describe('type, spacing and radius census (row 6)', () => {
    const decls = declarations(css.replace(/\/\*[\s\S]*?\*\//g, ''))
    const pxOf = (value) => [...resolve(value).matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))

    it('uses at most 3 font sizes, all of 11 / 13 / 15', () => {
        const sizes = new Set(decls.filter(([p]) => p === 'font-size').map(([, v]) => pxOf(v)[0]))
        expect(sizes.size).toBeGreaterThan(0)
        expect(sizes.size).toBeLessThanOrEqual(3)
        sizes.forEach((size) => expect(SCALE_TEXT.has(size)).toBe(true))
    })

    it('uses at most 6 spacing values, all on the 4 / 8 / 12 / 16 / 24 / 32 scale', () => {
        const spaceProps = /^(padding|margin|gap|column-gap|row-gap)(-(top|right|bottom|left))?$/
        const used = new Set()
        decls.filter(([p]) => spaceProps.test(p)).forEach(([, v]) => pxOf(v).forEach((n) => used.add(Math.abs(n))))
        used.forEach((n) => expect(SCALE_SPACE.has(n), `${n}px is not on the scale`).toBe(true))
        expect([...used].filter((n) => n > 0).length).toBeLessThanOrEqual(6)
    })
})

describe('rectangles: no radius over 2px anywhere in src/raw (row 6 guard)', () => {
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return walk(full)
        return /\.(css|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : []
    })
    const root = path.dirname(fileURLToPath(import.meta.url))
    const offenders = []
    for (const file of walk(root)) {
        const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        for (const match of text.matchAll(/(?:border(?:-[a-z]+){0,2}-radius|borderRadius)['"]?\s*[:=]\s*([^;,}\n]+)/g)) {
            const value = match[1].trim().replace(/!important$/, '').trim().replace(/^['"`{]|['"`}]$/g, '')
            const ok = value.split(/\s+/).every((part) => (
                part === '0' || part === 'inherit' || part === 'var(--di-radius)' || part === 'var(--raw-radius)'
                || (/^\d+(\.\d+)?px$/.test(part) && parseFloat(part) <= 2)
            ))
            if (!ok) offenders.push(`${path.relative(root, file)}: ${match[0].trim()}`)
        }
        if (/radius-pill/.test(text)) offenders.push(`${path.relative(root, file)}: uses --di-radius-pill`)
    }
    it('finds none', () => {
        expect(offenders).toEqual([])
    })
})

describe('the zoom strip (row 6, §3.8)', () => {
    it('is [−] [100%] [+] [Fit], 136x28, and a finger gets Fit alone at 44', () => {
        expect(css).toMatch(/button\.raw-graph-zoom-value \{ width: 44px; \}/)
        expect(css).toMatch(/button\.raw-zoom-fit \{ width: 36px; \}/)
        // 28 + 44 + 28 + 36; neighbours share one 1px line.
        expect(28 + 44 + 28 + 36).toBe(136)
        expect(css).toMatch(/@media \(pointer: coarse\) \{[^@]*\.raw-zoom-step,[^@]*\.raw-graph-zoom-value \{ display: none; \}/)
    })
})

describe('the corner wordmark is a real target (audit 2026-10-21 NR-04)', () => {
    // Measured in Chromium at 820x1180: the bare text was 33x17, under 2.5.8's
    // 24px; axe target-size, serious. The phone rule (≤640px) already gave it 44.
    const raw = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'styles/raw.css'), 'utf8')
    it('declares at least 24px of height outside the phone rule', () => {
        const base = raw.match(/\n\.raw-surface-wordmark \{([^}]*)\}/)[1]
        expect(base).toMatch(/min-height: 24px;/)
        expect(base).toMatch(/display: inline-flex;/)
    })

    // The taller target must not move the letters: they sat at bottom 18px
    // with a 17px line box (measured in Chromium). bottom 14px put them 0.5px
    // lower (865 -> 865.5 at 1440x900), against its own comment.
    it('keeps the letters at bottom 18px: bottom + (min-height - line-height) / 2', () => {
        const base = raw.match(/\n\.raw-surface-wordmark \{([^}]*)\}/)[1]
        const px = (prop) => Number(base.match(new RegExp(`\\n\\s*${prop}: ([\\d.]+)px;`))?.[1])
        expect(px('line-height')).toBe(17)
        expect(px('bottom') + (px('min-height') - px('line-height')) / 2).toBe(18)
    })
})
