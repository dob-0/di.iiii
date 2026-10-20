// @vitest-environment node
// Touch targets on the rig pages (docs/ai/audits/2026-10-21-rig-show-pages.md): the brief's floor is 24 px
// for a pointer (WCAG 2.5.8 AA) and 44 px on touch. The browser walk (scripts/audit/rig-show-pages.cjs)
// measured the boxes; this holds the stylesheet rules that make them, from the source text. It sees no screen.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** The blocks of `css` that open with `blockStart` (every one of them), or the whole sheet. */
const blocks = (css, blockStart) => {
    if (!blockStart) return [css]
    const out = []
    for (let at = css.indexOf(blockStart); at >= 0; at = css.indexOf(blockStart, at + 1)) {
        let depth = 0
        for (let i = css.indexOf('{', at); i < css.length; i++) {
            if (css[i] === '{') depth++
            if (css[i] === '}' && --depth === 0) { out.push(css.slice(css.indexOf('{', at) + 1, i)); break }
        }
    }
    return out
}

/** The largest px a rule for `selector` sets on `prop`, inside the blocks that open with `blockStart`. */
const pxIn = (css, selector, prop, blockStart = null) => {
    const values = []
    for (const scope of blocks(css, blockStart)) {
        const rule = /([^{}]+)\{([^{}]*)\}/g
        let m
        while ((m = rule.exec(scope))) {
            if (!m[1].split(',').map((x) => x.trim()).includes(selector)) continue
            const v = m[2].match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*(\\d+)px`))
            if (v) values.push(Number(v[1]))
        }
    }
    return values.length ? Math.max(...values) : null
}

describe('the plot on a touch screen (audit row P3)', () => {
    const css = read('./plot.css')
    it.each(['.rigplot-toggle button', '.rigplot-sheet__handle', '.rigplot-rail button'])('%s is at least 44 px high on a coarse pointer', (selector) => {
        expect(pxIn(css, selector, 'min-height', '@media (pointer: coarse)')).toBeGreaterThanOrEqual(44)
    })
})
