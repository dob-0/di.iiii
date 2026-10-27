import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/*
 * Square corners and house type on the tool surfaces (brand-tool-surfaces,
 * 2026-10-21). The frame has one corner, var(--di-radius); a circle (50%), a
 * pill (999px) or the pill token on these surfaces is the regression.
 *
 * SURFACES grows one surface at a time, in the order the work was cut:
 * preferences; workspace + panels + inspector; controls + menu; raw + mobile
 * shell; jam; scan, make, perform and the live-project chrome; loading screen
 * and the WebGL guard. A file joins the list the day it is converted and never
 * leaves it.
 *
 * Every control is square, the scan shutter and the walk joystick included
 * (owner, 2026-10-21). Kept round on purpose, only a drawing (the scan coverage dial, the
 * loading rings); status dots are square too (owner: rectangles only, 2026-10-01). Each carries a comment saying "not a control" right above it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..')
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8')
const cssIn = (dir) => readdirSync(path.join(SRC, dir)).filter((f) => f.endsWith('.css')).map((f) => `${dir}/${f}`)

const SURFACES = {
    preferences: ['styles/preferences.css'],
    'workspace + panels + inspector': [
        'styles/workspace.css',
        ...cssIn('styles/panels'),
        'styles/inspector-controls.css',
        ...cssIn('styles/inspector'),
    ],
    'controls + menu': ['styles/controls.css', 'styles/menu.css', 'styles/base.css'],
    'raw + mobile shell': ['raw/styles/raw.css', 'styles/mobile-shell.css'],
    jam: ['project/components/jamSurface.css'],
    'scan, make, perform + live-project chrome': [
        ...cssIn('scan'),
        ...cssIn('make'),
        ...cssIn('perform'),
        'components/liveProjectScene.css',
        'pages/spaceContents.css',
    ],
    'loading screen + WebGL guard': ['components/loadingScreen.css', 'components/webglContextGuard.css'],
}
const FILES = Object.values(SURFACES).flat()

// file → selectors allowed a round corner: drawings only. Status dots are square too (owner: rectangles only).
const ROUND_ALLOWED = {
    'scan/scanSurface.css': ['.scan-ring'],
    'components/liveProjectScene.css': ['.live-scene-loading-ring'],
    'components/loadingScreen.css': ['.loading-screen-spinner'],
}

const ROUND = /border-radius\s*:\s*([^;}]*(?:50%|999px|--di-radius-pill)[^;}]*)/

// Every rule (selector + body) whose body draws a round corner.
const roundRules = (css) => {
    const out = []
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const hit = m[2].match(ROUND)
        if (!hit) continue
        const line = stripped.slice(0, m.index + m[0].indexOf('{')).split('\n').length
        out.push({ selector: m[1].trim().replace(/\s+/g, ' '), value: hit[1].trim(), line })
    }
    return out
}

const lines = (css) => css.split('\n')

describe('square corners on the tool surfaces', () => {
    it('scans a real file list (no empty glob)', () => {
        expect(FILES.length).toBeGreaterThanOrEqual(20)
        for (const file of FILES) expect(read(file).length, file).toBeGreaterThan(0)
    })

    for (const [surface, files] of Object.entries(SURFACES)) {
        it(`${surface}: no circle, pill or pill token on a control`, () => {
            const bad = []
            for (const file of files) {
                const allowed = ROUND_ALLOWED[file] ?? []
                for (const rule of roundRules(read(file))) {
                    if (!allowed.includes(rule.selector)) bad.push(`${file}:${rule.line} ${rule.selector} → ${rule.value}`)
                }
            }
            expect(bad).toEqual([])
        })
    }

    it('keeps every allowed round mark round, each with "not a control" right above it', () => {
        for (const [file, selectors] of Object.entries(ROUND_ALLOWED)) {
            expect(FILES, file).toContain(file)
            const css = read(file)
            expect(roundRules(css).map((r) => r.selector)).toEqual(selectors)
            for (const selector of selectors) {
                const at = css.indexOf(`${selector} {`)
                expect(at, selector).toBeGreaterThan(-1)
                const before = css.slice(0, at).trimEnd()
                expect(before.endsWith('*/'), `${selector} needs a comment right above it`).toBe(true)
                expect(before.slice(before.lastIndexOf('/*')), selector).toMatch(/not a control/)
            }
        }
    })

    it('squares the scan shutter and the walk joystick (owner, 2026-10-21)', () => {
        const rounds = (file) => roundRules(read(file)).map((r) => r.selector)
        expect(rounds('scan/scanSurface.css')).not.toContain('.scan-record')
        expect(rounds('scan/scanSurface.css')).not.toContain('.scan-out')
        for (const s of ['.live-scene-joystick', '.live-scene-joystick-thumb']) {
            expect(rounds('components/liveProjectScene.css')).not.toContain(s)
        }
    })

    it('has no font-weight 800 and no 1.5px line', () => {
        const bad = []
        for (const file of FILES) {
            lines(read(file)).forEach((line, i) => {
                if (/font-weight\s*:\s*800\b/.test(line)) bad.push(`${file}:${i + 1} font-weight 800`)
                if (/(^|[^\d.])1\.5px\b/.test(line)) bad.push(`${file}:${i + 1} 1.5px`)
            })
        }
        expect(bad).toEqual([])
    })

    it('rounds the scrollbar thumb with the house corner', () => {
        const base = read('styles/base.css')
        const thumb = base.match(/::-webkit-scrollbar-thumb\s*\{([^}]*)\}/)
        expect(thumb).toBeTruthy()
        expect(thumb[1]).toMatch(/border-radius:\s*var\(--di-radius\)/)
    })
})

describe('preferences draws a shadow only with a reason', () => {
    it('every box-shadow in preferences.css has a comment on the line before', () => {
        const all = lines(read('styles/preferences.css'))
        const bad = []
        all.forEach((line, i) => {
            if (!/box-shadow\s*:/.test(line) || /^\s*\/?\*/.test(line)) return
            if (!/\*\/\s*$/.test(all[i - 1] ?? '')) bad.push(`${i + 1}: ${line.trim()}`)
        })
        expect(bad).toEqual([])
    })

    it('draws no blurred glow (a shadow with a blur radius)', () => {
        const css = read('styles/preferences.css').replace(/\/\*[\s\S]*?\*\//g, '')
        const glows = [...css.matchAll(/box-shadow\s*:\s*([^;]+);/g)]
            .map((m) => m[1].trim())
            .filter((v) => v !== 'none' && !/^inset\b/.test(v) && !/^0 0 0 \d+px\b/.test(v))
        expect(glows).toEqual([])
    })
})

describe('sliders: a rectangle thumb on a hit box a finger can find', () => {
    // WCAG 2.1 relative luminance and contrast ratio, written out (as in contrast.test.js).
    const channel = (c) => {
        const v = c / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    const over = ([r, g, b, a = 1], bg) => [r, g, b].map((c, i) => c * a + bg[i] * (1 - a))
    const ratio = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
        return (hi + 0.05) / (lo + 0.05)
    }
    const SURFACE = [10, 10, 10] // --di-surface, the panel ground the sliders stand on
    const THUMB = [255, 255, 255] // --di-text

    const SLIDERS = [
        ['styles/panels/base.css', '.floating-panel input[type="range"]'],
        ['styles/inspector-controls.css', '.gizmo-controls .range-row input[type="range"]'],
    ]

    const rule = (css, selector) => {
        const at = css.indexOf(`${selector} {`)
        expect(at, selector).toBeGreaterThan(-1)
        return css.slice(at, css.indexOf('}', at))
    }
    const px = (body, prop) => Number.parseFloat((body.match(new RegExp(`(?:^|[\\s;{])${prop}\\s*:\\s*([\\d.]+)px`)) ?? [])[1])

    for (const [file, input] of SLIDERS) {
        it(`${file}: the input is ≥ 24 px tall (SC 2.5.8) and the thumb is a ≥3:1 rectangle (SC 1.4.11)`, () => {
            const css = read(file)
            expect(px(rule(css, input), 'height')).toBeGreaterThanOrEqual(24)
            for (const thumb of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
                const body = rule(css, `${input}${thumb}`)
                expect(body).toMatch(/border-radius:\s*var\(--di-radius\)/)
                expect(body).toMatch(/background:\s*var\(--di-text\)/)
            }
            for (const track of ['::-webkit-slider-runnable-track', '::-moz-range-track']) {
                const body = rule(css, `${input}${track}`)
                const alphas = [...body.matchAll(/rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/g)].map((m) => Number(m[1]))
                expect(alphas.length, track).toBeGreaterThan(0)
                const brightest = over([255, 255, 255, Math.max(...alphas)], SURFACE)
                expect(ratio(THUMB, brightest), `${track} vs thumb`).toBeGreaterThanOrEqual(3)
            }
            expect(ratio(THUMB, SURFACE)).toBeGreaterThanOrEqual(3)
        })
    }
})

describe('the raw wordmark', () => {
    it('draws di<span class=dot>.</span>iiii', () => {
        const editor = read('raw/components/RawEditor.jsx')
        expect(editor).toMatch(/className=\{`raw-surface-wordmark[\s\S]{0,400}?>di<span className="dot">\.<\/span>iiii<\/a>/)
        expect(read('raw/styles/raw.css')).toMatch(/\.raw-surface-wordmark \.dot \{/)
    })
})

describe('the live-project chrome', () => {
    const css = read('components/liveProjectScene.css')

    it('keeps --di-danger only on the exit button hover (dev\'s colour, kept as it was)', () => {
        const hits = lines(css).map((l, i) => [i + 1, l]).filter(([, l]) => /--di-danger/.test(l))
        expect(hits).toHaveLength(2)
        const at = css.indexOf('.live-scene-exit:hover {')
        const body = css.slice(at, css.indexOf('}', at))
        expect(body.match(/--di-danger/g)).toHaveLength(2)
    })

    it('times every transition with a motion token (0.12s or 0.15s), no literal duration', () => {
        const bad = lines(css).filter((l) => /transition\s*:/.test(l) && /\d(ms|s)\b/.test(l.replace(/var\([^)]*\)/g, '')))
        expect(bad).toEqual([])
    })

    it('draws no 1.5px border', () => {
        expect(css).not.toMatch(/(^|[^\d.])1\.5px/m)
    })
})

describe('raw: focus you can see, a name you can read', () => {
    const raw = read('raw/styles/raw.css')

    it('outlines the focused selection scaffold 2px cyan, outside the edge', () => {
        expect(raw).toMatch(/\.raw-selection-scaffold:focus-visible \{ outline: 2px solid var\(--di-cyan\); outline-offset: 2px \}/)
    })

    it('draws the wordmark in --di-text-muted, not white at .28 (2.3:1)', () => {
        const at = raw.indexOf('.raw-surface-wordmark {')
        expect(raw.slice(at, raw.indexOf('}', at))).toMatch(/\n\s*color: var\(--di-text-muted\);/)
    })
})

describe('preferences draws its chevron, not a glyph Inter lacks', () => {
    it('draws the header toggle as an SVG chevron, no ▸ or ▾ glyph', () => {
        const page = read('components/PreferencesPage.jsx')
        const at = page.indexOf('className="preferences-collapse-toggle"')
        expect(at).toBeGreaterThan(-1)
        const button = page.slice(at, page.indexOf('</button>', at))
        expect(button).not.toMatch(/'\u25B8'|'\u25BE'/)
        expect(button).toMatch(/<svg [^>]*aria-hidden="true"/)
    })
})
