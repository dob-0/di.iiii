// The three Armenian/English switch concepts in docs/design/lang-switch/ are
// design sketches, not product code, but they make promises a reviewer reads
// as fact: that they are self-contained, that they wear the live tokens, that
// each one answers the same five questions on the same four surfaces. This
// holds them to it, so a sketch that drifts from src/styles/base.css or drops
// a question fails here instead of misleading the owner.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'docs/design/lang-switch')
const CONCEPTS = ['concept-a.html', 'concept-b.html', 'concept-c.html']
const SURFACES = ['landing', 'space', 'studio', 'phone']
const ANSWERS = ['where', 'remembers', 'address', 'search', 'missing', 'work']
const REQUIRED_TOKENS = ['--di-cyan', '--di-black', '--di-surface', '--di-text', '--di-text-muted', '--di-sans', '--di-mono']

const firstRootTokens = (css) => {
    const block = css.match(/:root\s*\{([\s\S]*?)\n\s*\}/)
    if (!block) return {}
    const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '')
    const tokens = {}
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        tokens[m[1]] = m[2].replace(/\s+/g, ' ').trim()
    }
    return tokens
}

const baseTokens = firstRootTokens(readFileSync(join(ROOT, 'src/styles/base.css'), 'utf8'))

describe('lang-switch concept sketches', () => {
    it('base.css still exposes the tokens the sketches copy', () => {
        for (const name of REQUIRED_TOKENS) expect(baseTokens[name], name).toBeTruthy()
    })

    for (const file of CONCEPTS) {
        describe(file, () => {
            const path = join(DIR, file)
            const html = existsSync(path) ? readFileSync(path, 'utf8') : ''

            it('exists', () => {
                expect(existsSync(path)).toBe(true)
            })

            it('is self-contained: no scripts, links, imports, fonts or urls', () => {
                expect(html).not.toMatch(/<script/i)
                expect(html).not.toMatch(/<link\b/i)
                expect(html).not.toMatch(/@import/i)
                expect(html).not.toMatch(/@font-face/i)
                expect(html).not.toMatch(/url\(/i)
                expect(html).not.toMatch(/\s(src|href)\s*=\s*["']?(https?:)?\/\//i)
            })

            it('wears the live tokens from src/styles/base.css, unchanged', () => {
                const tokens = firstRootTokens(html)
                for (const name of REQUIRED_TOKENS) expect(tokens[name], name).toBeTruthy()
                const drifted = Object.entries(tokens)
                    .filter(([name]) => name.startsWith('--di-'))
                    .filter(([name, value]) => baseTokens[name] !== value)
                    .map(([name, value]) => `${name}: ${value} (base.css: ${baseTokens[name] ?? 'absent'})`)
                expect(drifted).toEqual([])
            })

            it('has square corners only', () => {
                const radii = [...html.matchAll(/border-radius\s*:\s*([^;}"]+)/gi)].map((m) => m[1].trim())
                expect(radii.filter((v) => !/^0(px)?$/.test(v))).toEqual([])
            })

            it('shows the switch on all four surfaces', () => {
                for (const s of SURFACES) expect(html, s).toContain(`data-surface="${s}"`)
            })

            it('answers every question', () => {
                for (const a of ANSWERS) expect(html, a).toContain(`data-answer="${a}"`)
            })

            it('fences the work off from translation', () => {
                expect(html).toMatch(/<[^>]*data-work[^>]*translate="no"|<[^>]*translate="no"[^>]*data-work/)
            })
        })
    }

    it('README compares all three in one table and names a pick', () => {
        const readme = readFileSync(join(DIR, 'README.md'), 'utf8')
        for (const file of CONCEPTS) expect(readme).toContain(file)
        expect(readme).toMatch(/^\|.*\|.*\|.*\|.*\|$/m)
        expect(readme).toMatch(/^## Pick/m)
    })
})
