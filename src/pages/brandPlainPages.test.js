import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The pages a stranger meets first, held to the house type (brand-plain-pages,
// 2026-10-21). The crash page has its own case in AppErrorBoundary.test.jsx.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const rule = (css, selector) => {
    const at = css.indexOf(`${selector} {`)
    expect(at, `${selector} exists`).toBeGreaterThanOrEqual(0)
    return css.slice(at, css.indexOf('}', at))
}

describe('the no-script floor', () => {
    const html = read('index.html')
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'))

    it('carries its own style: black ground, white ink, Inter, mono links', () => {
        const style = noscript.match(/<style>([\s\S]*?)<\/style>/)?.[1] || ''
        expect(style).not.toBe('')
        expect(style).toMatch(/background:\s*#000/)
        expect(style).toMatch(/color:\s*#fff/)
        expect(style).toMatch(/Inter/)
        expect(style).toMatch(/\ba\s*\{[^}]*monospace/)
    })

    it('fetches nothing: no stylesheet link, no @import, no url()', () => {
        expect(noscript).not.toMatch(/<link\b|@import|url\(/i)
    })
})

describe('the legal pages', () => {
    const css = read('pages/legal.css')

    it('set the eyebrow in mono at the label tracking', () => {
        const eyebrow = rule(css, '.legal-eyebrow')
        expect(eyebrow).toMatch(/font-family:\s*var\(--di-mono\)/)
        expect(eyebrow).toMatch(/letter-spacing:\s*var\(--di-label-tracking\)/)
    })

    it('fill code with a cyan token, not a private alpha', () => {
        expect(rule(css, '.legal-section code')).toMatch(/background:\s*var\(--di-cyan-(dim|wash)\)/)
    })
})

describe('the device sign-in page', () => {
    const css = read('pages/deviceLogin.css')

    it('reads every corner from the radius token and no tracking literal', () => {
        const radii = css.match(/border-radius:[^;]+;/g) || []
        expect(radii.length).toBe(6)
        for (const r of radii) expect(r).toBe('border-radius: var(--di-radius);')
        expect(css).not.toMatch(/letter-spacing:\s*0\.2em/)
    })
})
