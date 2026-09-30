import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('tier chip clearance for bottom action bars', () => {
    it('modeMark.css defines the clearance variable, covering safe-area inset', () => {
        const css = read('../components/modeMark.css')
        expect(css).toMatch(/--di-mode-mark-clearance:\s*calc\(\s*\d+px\s*\+\s*env\(safe-area-inset-bottom/)
    })
    it('the chip sits bottom-left and the clearance is at least its offset + height', () => {
        const css = read('../components/modeMark.css')
        const px = Number(css.match(/--di-mode-mark-clearance:\s*calc\(\s*(\d+)px/)[1])
        expect(css).toMatch(/\.mode-mark-chip\s*\{[^}]*bottom:\s*calc\(10px/)
        expect(px).toBeGreaterThanOrEqual(10 + 24)
    })
    it('the scene deck bottom bar reserves the clearance in its padding', () => {
        const css = read('./scenes.css')
        const rule = css.match(/\.rigscenes-foot\s*\{[^}]*\}/)[0]
        expect(rule).toMatch(/position:\s*sticky/)
        expect(rule).toMatch(/padding:[^;]*var\(--di-mode-mark-clearance/)
    })
})
