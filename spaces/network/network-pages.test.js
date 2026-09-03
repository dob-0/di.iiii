// Guards for the network space's generated pages.
//
// Each of these is a defect that actually shipped: the index drifted into a
// second design because it was hand-kept while the rooms were generated; a
// black panel sat beside a white column and the seam was visible on every
// page; every small label failed AA on paper; 229 KB of three.js drew fifty-
// two dots; and our own sourcing arguments were printed to visitors.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CSS } from './lib/css.mjs'
import { renderIndex } from './index-template.mjs'
import { renderRoom } from './room-template.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (p) => fs.readFileSync(path.join(HERE, p), 'utf8')
const { people } = JSON.parse(read('people.json'))

const PAPER = '#f7f7f5'
const luminance = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a, b) => {
    const x = luminance(a); const y = luminance(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('network pages are generated, not hand-kept', () => {
    it('code/index.html is exactly what renderIndex produces', () => {
        expect(read('code/index.html')).toBe(renderIndex(people))
    })

    it('every room page is exactly what renderRoom produces', () => {
        for (const p of people) expect(read(`pages/${p.slug}.html`)).toBe(renderRoom(p, people))
    })
})

describe('one ground', () => {
    // The seam was two backgrounds. Every surface the shared CSS paints has
    // to be the paper, the accent tint, or a hairline — never a second world.
    it('paints nothing but paper, accent tint and rules', () => {
        const allowed = new Set(['var(--paper)', 'var(--accent-soft)', 'var(--accent)', 'var(--rule)', 'transparent'])
        const values = [...CSS.matchAll(/background:\s*([^;}]+)/g)].map((m) => m[1].trim())
        expect(values.length).toBeGreaterThan(3)
        for (const v of values) expect(allowed, `background: ${v}`).toContain(v)
    })

    it('carries no dark-field token', () => {
        expect(CSS).not.toMatch(/--field-bg|#04060a/)
    })
})

describe('small type is legible on paper', () => {
    it('sets nothing below 12px', () => {
        const sizes = [...CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
        expect(sizes.length).toBeGreaterThan(10)
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12)
    })

    it('gives every text colour at least 4.5:1 against the paper', () => {
        // --accent is for marks only; --accent-ink is the one that carries text.
        for (const token of ['--ink', '--ink-2', '--ink-3', '--accent-ink']) {
            const hex = CSS.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`))[1]
            expect(contrast(hex, PAPER), `${token} ${hex}`).toBeGreaterThanOrEqual(4.5)
        }
    })
})

describe('weight', () => {
    it('loads no library to draw fifty-two dots', () => {
        for (const file of ['code/index.html', 'pages/gevorg-grigoryan.html']) {
            expect(read(file), file).not.toMatch(/three\.module|\/vendor\//)
        }
    })
})

describe('visitor copy', () => {
    it('carries none of our sourcing notes', () => {
        const internal = /per di-contacts|not yet in people\.json|cross-ref|matched via|unconfirmed|roster\/deck/i
        for (const p of people) {
            for (const w of p.works || []) expect(w.line, `${p.slug}: ${w.line}`).not.toMatch(internal)
        }
    })

    it('states no count the roster does not hold', () => {
        const html = read('code/index.html')
        expect(html).toContain('Fifty-two people make di.iiii')
        expect(people.length).toBe(52)
        expect(people.filter((p) => p.team).length).toBe(5)
    })
})
