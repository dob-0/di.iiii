import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The landing held to brand spec v2's decided rows (M16, M19, M01/M03, M11).
// The owner looks at this page daily; each case below names what it keeps.

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(HERE, p), 'utf8')
const raw = read('landing.css')
const lines = raw.split('\n')
const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '')
const localHome = read('localHome.css').replace(/\/\*[\s\S]*?\*\//g, '')
const spacePage = read('../../spaces/main/pages/landing/index.html')
const jsx = read('LandingPage.jsx')

// Innermost `selector { body }` blocks; a rule inside @media is innermost too.
const rules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }))

// A comment closing on the line before (the reason a long transition or a
// shadow is there at all).
const commentBefore = (i) => /\*\/\s*$/.test(lines[i - 1] || '')

const seconds = (value) => [...value.matchAll(/(\d*\.?\d+)(ms|s)\b/g)]
    .map(([, n, unit]) => (unit === 'ms' ? Number(n) / 1000 : Number(n)))

describe('landing brand (spec v2)', () => {
    it('M16: an uppercase label tracks by the token, never a literal', () => {
        const labels = rules.filter((r) => /text-transform:\s*(?:uppercase|var\(--di-label-case\))/.test(r.body))
        expect(labels.length).toBeGreaterThanOrEqual(8)
        const literal = labels
            .filter((r) => /letter-spacing:(?!\s*var\(--di-label-tracking\))/.test(r.body))
            .map((r) => r.sel)
        expect(literal).toEqual([])
    })

    it('M16: a name inside a caps label keeps its own spelling', () => {
        const exempt = rules.find((r) => /\.lp-footer-note a/.test(r.sel) && /\.lp-enter-note a/.test(r.sel))
        expect(exempt?.body).toMatch(/text-transform:\s*none/)
    })

    it('M19: no transition over 0.2s without its reason on the line before', () => {
        const bare = lines
            .map((line, i) => ({ line, i }))
            .filter(({ line }) => /^\s*transition\s*:/.test(line))
            .filter(({ line, i }) => Math.max(0, ...seconds(line)) > 0.2 && !commentBefore(i))
        expect(bare.map(({ line, i }) => `${i + 1}: ${line.trim()}`)).toEqual([])
    })

    it('M19: a short transition names its property and uses the motion tokens', () => {
        const off = lines
            .map((line, i) => ({ line, i }))
            .filter(({ line }) => /^\s*transition\s*:/.test(line))
            .filter(({ line }) => Math.max(0, ...seconds(line)) <= 0.2)
            .filter(({ line }) => /\ball\b/.test(line) || seconds(line).length > 0 || !/var\(--di-motion-(fast|base)\)/.test(line))
        expect(off.map(({ line, i }) => `${i + 1}: ${line.trim()}`)).toEqual([])
    })

    it('M19: no box-shadow that paints without its reason on the line before', () => {
        const bare = lines
            .map((line, i) => ({ line, i }))
            .filter(({ line }) => /^\s*box-shadow\s*:/.test(line) && !/:\s*none\b/.test(line))
            .filter(({ i }) => !commentBefore(i))
        expect(bare.map(({ line, i }) => `${i + 1}: ${line.trim()}`)).toEqual([])
    })

    it('M19: no 1.5px line', () => {
        expect(stripped).not.toMatch(/\b1\.5px\b/)
    })

    it('M01/M03: no round or pill corner on the landing', () => {
        const round = /border-radius\s*:[^;}]*(50%|999px|--di-radius-pill)/
        expect(stripped).not.toMatch(round)
        expect(localHome).not.toMatch(round)
        expect(spacePage).not.toMatch(round)
        // The step numbers: 0, written, no hand copy of the platform token.
        expect(spacePage).not.toMatch(/--di-radius\s*:/)
        expect(spacePage).toMatch(/width:26px;height:26px;border-radius:0;/)
    })

    it('the cyan dot of the React landing stays (lp-dot)', () => {
        expect(jsx.match(/di<span className="lp-dot">\.<\/span>iiii/g)?.length).toBe(3)
        expect(rules.find((r) => r.sel === '.lp-dot')?.body).toMatch(/color:\s*var\(--di-cyan\)/)
    })

    it('M11: the landing page\'s wordmark is di<span class=dot>.</span>iiii, the dot cyan', () => {
        expect(spacePage.match(/di<span class="dot">\.<\/span>iiii/g)?.length).toBe(2)
        expect(spacePage).not.toMatch(/di<i>\.<\/i>iiii/)
        // The platform cyan written out: the page reads no platform stylesheet, and
        // the page's own cyan (#4FD6FF), not the platform's.
        expect(spacePage).toMatch(/\.dot\s*\{\s*color:\s*#4df9ff\s*\}/i)
        expect(read('../styles/base.css')).toMatch(/--di-cyan:\s*#4df9ff\b/i)
    })

    it('the header ground is the strong scrim token, not a literal black', () => {
        expect(rules.find((r) => r.sel === '.lp-nav')?.body).toMatch(/background:\s*var\(--di-scrim-strong\)/)
    })
})
