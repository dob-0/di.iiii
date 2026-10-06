import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../styles/raw.css', import.meta.url), 'utf8')
const rule = (selector) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)) + 1)

describe('card resize handle hit area (P2)', () => {
    it('is >= 24 screen px, 44 on touch, divided by the canvas zoom, capped so the card still drags', () => {
        const base = rule('.raw-graph-node-resize')
        expect(base).toContain('--resize-hit: 24px')
        expect(base).toMatch(/width: min\(calc\(var\(--resize-hit\) \/ var\(--raw-zoom, 1\)\), 45%\)/)
        expect(css).toMatch(/pointer: coarse\)[^}]*--resize-hit: 44px/)
        expect(base).toContain('border-radius: 0')
    })
    it('the mark stays small and square', () => {
        expect(rule('.raw-graph-node-resize::after')).toMatch(/width: 14px[\s\S]*border-radius: 0/)
    })
})
