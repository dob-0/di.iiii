// @vitest-environment node
// The Studio's frame is di.iiii's (owner, 2026-10-21): the MUI theme, the panels and
// their controls wear the house tokens of src/styles/base.css. A project's scene and
// the colours it brings stay as they are, which is why the scene's own default
// background is read from the shared schema and not written here.
// This reads source text and the theme object. It does not see a screen; the pictures
// in docs/ai/handover/brand-studio-frame/ are the look.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { studioThemeOptions } from './StudioThemeProvider.jsx'

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (rel) => readFileSync(join(SRC, rel), 'utf8')
const token = (name) => {
    const m = read('styles/base.css').match(new RegExp(`--${name}:\\s*([^;]+);`))
    return m && m[1].trim().toLowerCase()
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(css|jsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
})

// The old frame's values, as hex and as the rgb triple an rgba() carries them in.
export const RETIRED = [
    ['#4fd6ff', /#4fd6ff|79,\s*214,\s*255/i],
    ['#7fc4e8', /#7fc4e8|127,\s*196,\s*232/i],
    ['#53d79b', /#53d79b|83,\s*215,\s*155/i],
    ['#0a1118', /#0a1118|10,\s*17,\s*24\b/i],
    ['#0f1722', /#0f1722|15,\s*23,\s*34\b/i]
]

export const retiredIn = (file, text) => text.split('\n').flatMap((line, i) =>
    RETIRED.filter(([, re]) => re.test(line)).map(([name]) => `${file}:${i + 1} ${name}`))

const STUDIO_CSS = ['studio.css', 'studio-help.css', 'studio-mobile.css', 'space-constellation.css']
    .map((f) => `studio/styles/${f}`)

// Round marks that are not controls: the two status dots (owner, 2026-10-21). Each one
// says so in its rule, so a control cannot slip in under the same exception.
export const ROUND_ALLOWED = ['.scc-sync-dot', '.scc-presence-dot']

// The body of the first rule whose selector list is exactly `sel`, comments kept.
export const ruleOf = (css, sel) => {
    const at = css.search(new RegExp(`(^|[}\\n])\\s*${sel.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')}\\s*\\{`))
    if (at < 0) return ''
    const open = css.indexOf('{', at)
    return css.slice(open + 1, css.indexOf('}', open))
}

const ROUND = /border-radius:\s*(var\(--di-radius-pill[^)]*\)|999px|50%)/
export const roundSelectors = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => ROUND.test(m[2]))
    .map((m) => m[1].trim())

describe('the Studio frame is di.iiii\'s', () => {
    it('gives the MUI theme square corners and the house colours', () => {
        const o = studioThemeOptions
        expect(o.shape.borderRadius).toBe(0)
        expect(o.palette.primary.main).toBe('#4df9ff')
        expect(o.palette.secondary.main).toBe('#4df9c0')
        expect(o.palette.background.default).toBe('#0a0a0a')
        expect(o.palette.background.paper).toBe('#111114')
    })

    it('takes those colours from the tokens base.css declares (one source, no drift)', () => {
        const o = studioThemeOptions
        expect(token('di-cyan')).toBe(o.palette.primary.main)
        expect(token('di-success')).toBe(o.palette.secondary.main)
        expect(token('di-surface')).toBe(o.palette.background.default)
        expect(token('di-surface-2')).toBe(o.palette.background.paper)
    })

    it('has no second cyan and no old ground under src/studio and src/project/viewport', () => {
        const files = [...walk(join(SRC, 'studio')), ...walk(join(SRC, 'project/viewport'))]
        expect(files.length).toBeGreaterThan(50)
        const found = files.flatMap((p) => retiredIn(relative(SRC, p).split(sep).join('/'), readFileSync(p, 'utf8')))
        expect(found).toEqual([])
    })

    it('mixes the constellation\'s cyan in whole percent, not fractions of one', () => {
        const css = read('studio/styles/space-constellation.css')
        expect(css).toMatch(/color-mix\(/)
        expect(css).not.toMatch(/color-mix\(.*\s0\.\d+%/)
    })

    it('draws no pill or circle in the four Studio stylesheets but the status light', () => {
        const found = STUDIO_CSS.flatMap((f) => roundSelectors(read(f)).map((s) => `${f} ${s}`))
        expect(found).toEqual(ROUND_ALLOWED.map((s) => `studio/styles/studio.css ${s}`))
        for (const sel of ROUND_ALLOWED) expect(ruleOf(read('studio/styles/studio.css'), sel)).toContain('status dot, not a control')
    })

    it('gives every control 0 px corners, switch and slider thumbs included (owner, 2026-10-21)', () => {
        const controls = {
            'studio/styles/studio.css': ['.insp-slider::-webkit-slider-thumb', '.insp-slider::-moz-range-thumb', '.insp-slider::-moz-range-track',
                '.insp-slider::-moz-range-progress', '.insp-toggle-track', '.insp-toggle-thumb', '.spp-badge'],
            'studio/styles/studio-help.css': ['.sh-help-section-tabs button', '.sh-help-link-pill'],
            'studio/styles/studio-mobile.css': ['.smb-top-btn']
        }
        for (const [file, sels] of Object.entries(controls)) {
            for (const sel of sels) expect(ruleOf(read(file), sel), `${file} ${sel}`).toMatch(/border-radius:\s*0;/)
        }
    })

    it('makes the slider input a 24 px tall target (WCAG 2.2 SC 2.5.8)', () => {
        const rule = ruleOf(read('studio/styles/studio.css'), '.insp-slider')
        expect(rule).toMatch(/height:\s*24px;/)
    })

    it('takes the cyan wash from the ladder where it has the step', () => {
        const css = read('studio/styles/space-constellation.css')
        expect(css).not.toMatch(/color-mix\(in srgb, var\(--di-cyan\) (6|10|30|35)%/)
        expect(ruleOf(css, '.scon-prow--live')).toContain('var(--di-cyan-wash)')
    })

    it('moves the constellation by named properties, in 0.2 s or less', () => {
        const css = read('studio/styles/space-constellation.css').replace(/\/\*[\s\S]*?\*\//g, '')
        const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1])
        expect(transitions.length).toBeGreaterThan(3)
        for (const t of transitions) {
            for (const part of t.split(',')) {
                expect(part.trim(), t).toMatch(/^[a-z-]+\s+\d/)
                expect(parseFloat(part.trim().split(/\s+/)[1]), t).toBeLessThanOrEqual(0.2)
            }
        }
        for (const m of css.matchAll(/animation:\s*[\w-]+\s+([\d.]+)s/g)) expect(parseFloat(m[1])).toBeLessThanOrEqual(0.2)
        expect(ruleOf(read('studio/styles/space-constellation.css'), '.scon-sat-label')).toMatch(/\/\*[\s\S]*shadow[\s\S]*\*\/\s*text-shadow/)
    })

    it('prints an address muted and lays the space card on the cyan wash', () => {
        const css = read('studio/styles/studio-space-hub.css')
        expect(ruleOf(css, '.ssh-live-url')).toMatch(/color:\s*var\(--di-text-muted\)/)
        expect(ruleOf(css, '.ssh-badge-live')).toMatch(/color:\s*var\(--di-success\)/)
        // two rules carry this selector; the one with the fill is the one that counts
        const fills = [...css.matchAll(/\.ssh-space-card\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((b) => /background:/.test(b))
        expect(fills).toHaveLength(1)
        expect(fills[0]).toMatch(/background:\s*var\(--di-cyan-wash\)/)
        expect(ruleOf(css, '.ssh-space-card:hover,\n.ssh-space-card:focus-visible')).toMatch(/background:\s*var\(--di-cyan-dim\)/)
    })

    it('squares the Code view\'s cards and drops the warm shadow', () => {
        expect(read('studio/components/StudioPresentationSurface.jsx')).not.toMatch(/borderRadius:\s*'(1\d|[3-9]\d?)px'/)
        const canvas = read('PresentationCanvas.css')
        expect(canvas).not.toMatch(/border-radius:\s*(2[0-9]|[3-9]\d)px/)
        expect(canvas).not.toMatch(/rgba\(52,\s*39,\s*16/)
    })

    it('catches what it is for', () => {
        expect(retiredIn('x.jsx', "color: '#4FD6FF'")).toHaveLength(1)
        expect(retiredIn('x.jsx', "background: 'rgba(15,23,34,0.82)'")).toHaveLength(1)
        expect(retiredIn('x.css', 'color: #4df9ff; background: rgba(110, 17, 240, 1)')).toEqual([])
        expect(roundSelectors('.a { border-radius: 50%; } .b { left: 50%; border-radius: var(--di-radius); } .c { border-radius: var(--di-radius-pill); }'))
            .toEqual(['.a', '.c'])
    })
})
