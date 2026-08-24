import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(resolve(HERE, rel), 'utf8')

// WCAG 2.1 relative luminance, then the contrast ratio against the theme's own
// ground. Written out rather than pulled from a library so the guard has no
// dependency that could quietly change what "readable" means.
const channel = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const over = ([r, g, b, a = 1], bg) => [r, g, b].map((c, i) => c * a + bg[i] * (1 - a))
const ratio = (fg, bg) => {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
const rgbaValues = (declaration) => (declaration.match(/[\d.]+/g) || []).map(Number)

const BLACK = [0, 0, 0]
const AA_BODY = 4.5

describe('dark theme text contrast', () => {
    // 2026-08-23: --di-text-muted was rgba(255,255,255,0.4) = 3.66:1. That is
    // below the floor for body text, and it was carrying 54 text nodes on the
    // landing page and 6 more on /spaces — every one of them secondary copy
    // doing real explaining. One token, sixty failures; hence one guard here
    // rather than sixty assertions at the call sites.
    it('--di-text-muted clears AA for body text on the black ground', () => {
        const base = read('./base.css')
        const declared = base.match(/--di-text-muted:\s*([^;]+);/)
        expect(declared, '--di-text-muted must stay defined in base.css').toBeTruthy()
        expect(ratio(over(rgbaValues(declared[1]), BLACK), BLACK)).toBeGreaterThanOrEqual(AA_BODY)
    })

    // The token only protects what uses it. This caught `.lp-enter-note` at
    // rgba(255,255,255,0.2) — 1.66:1, around a real link — which the token
    // change alone left untouched.
    it('no landing rule sets text to a white too faint to read', () => {
        const offenders = []
        for (const [, decl] of read('../landing/landing.css').matchAll(/(?:^|[\s;{])color:\s*(rgba\(255,\s*255,\s*255[^)]*\))/g)) {
            const value = rgbaValues(decl)
            if (ratio(over(value, BLACK), BLACK) < AA_BODY) offenders.push(decl)
        }
        expect(offenders).toEqual([])
    })
})
