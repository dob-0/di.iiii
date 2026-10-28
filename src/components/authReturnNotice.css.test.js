import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'authReturnNotice.css'), 'utf8')
const px = (block, prop) => {
    const m = block.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*(\\d+)px`))
    return m ? Number(m[1]) : 0
}
const rule = (source, selector) => {
    const at = source.indexOf(`${selector} {`)
    return at < 0 ? '' : source.slice(at, source.indexOf('}', at))
}

describe('authReturnNotice.css', () => {
    // Audit 2026-10-21 R2 (WCAG 2.5.8): the toast's Dismiss "×" measured
    // 15.5 × 14.4 px in Chromium; a phone wants 44.
    it('gives Dismiss a 24 px target, 44 px under a coarse pointer', () => {
        const base = rule(css, '.auth-return-notice button')
        expect(px(base, 'min-width')).toBeGreaterThanOrEqual(24)
        expect(px(base, 'min-height')).toBeGreaterThanOrEqual(24)
        const coarse = css.slice(css.indexOf('@media (pointer: coarse)'))
        expect(css.includes('@media (pointer: coarse)')).toBe(true)
        const touch = rule(coarse, '.auth-return-notice button')
        expect(px(touch, 'min-width')).toBeGreaterThanOrEqual(44)
        expect(px(touch, 'min-height')).toBeGreaterThanOrEqual(44)
    })
})
