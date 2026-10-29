import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// UX audit round 3, slice S11 (F040, F094, F096, F100, F103): the rig pages and perform sit on
// the 12 px floor (S05's ladder), the step bar's title is not the faint grey, the phone's
// totals panel sits under the Items button, and the toybox's two grey lines pass 4.5:1.
const HERE = dirname(fileURLToPath(import.meta.url))
const css = (p) => readFileSync(resolve(HERE, p), 'utf8')
const files = [
    ...readdirSync(HERE).filter((f) => f.endsWith('.css')).map((f) => resolve(HERE, f)),
    resolve(HERE, '../perform/perform.css')
]

const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

describe('rig pages and perform are readable', () => {
    it('no font-size under 12px in the rigbuild and perform CSS', () => {
        const small = []
        for (const f of files) {
            css(f).split('\n').forEach((line, i) => {
                // font-size and the font shorthand, in px or rem (16 px root); print pt sizes are paper, not screen
                for (const m of line.matchAll(/font(?:-size)?:[^;]*?(?<![\w.-])([\d.]+)(px|rem)\b/g)) {
                    const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])
                    if (px < 12) small.push(`${f.split('/src/')[1]}:${i + 1} ${m[1]}${m[2]}`)
                }
            })
        }
        expect(small).toEqual([])
    })

    it('checkboxes in the equipment list are at least 24px', () => {
        expect(css('equipment.css')).toMatch(/\.rigequip-pick input \{ width: 24px; height: 24px; \}/)
    })

    it('the build page\'s exact-value button is at least 24px tall', () => {
        expect(css('build.css')).toMatch(/\.rigbuild-exact \{[^}]*min-height: 24px/)
    })

    it('the step bar title and numbers do not use the faint grey', () => {
        const s = css('rigSteps.css')
        expect(s).toMatch(/\.rigsteps-title \{[^}]*color: var\(--di-dim\)/)
        expect(s).toMatch(/\.rigsteps-n \{ color: var\(--di-dim\)/)
    })

    it('on a phone the totals panel starts under the Items button (58px + 44px tall)', () => {
        const b = css('build.css')
        const totals = Number(b.match(/\.rigbuild\.is-phone \.rigbuild-totals \{ top: (\d+)px/)[1])
        const itemsTop = 58
        expect(totals).toBeGreaterThanOrEqual(itemsTop + 44)
        expect(b).toMatch(/\.rigbuild\.has-rigbar\.is-phone \.rigbuild-totals \{ top: calc\(var\(--rigbar-h\) \+ 160px\)/)
    })

    it('the toybox second-language line and the later button pass 4.5:1 on the paper', () => {
        const m = css('../make/makeSurface.css')
        const paper = m.match(/--make-paper: (#[0-9A-Fa-f]{6})/)[1]
        const readable = m.match(/--make-ink-readable: (#[0-9A-Fa-f]{6})/)[1]
        expect(ratio(readable, paper)).toBeGreaterThanOrEqual(4.5)
        expect(m).toMatch(/\.make-name-en \{[^}]*color: var\(--make-ink-readable\)/)
        expect(m).toMatch(/\.make-name-skip \{[^}]*color: var\(--make-ink-readable\)/)
    })

    it('every control on the rig pages, perform and the map has a 24px target floor (F040, F094)', () => {
        const steps = css('rigSteps.css')
        // the floor rule names every rig root, the top bar's links and sets both sides
        for (const root of ['rigbuild', 'rigplot', 'rigcards', 'rigequip', 'rigscenes', 'vis-page', 'show-page']) {
            expect(steps).toMatch(new RegExp(`:is\\([^)]*\\.${root}(?![\\w-])[^)]*\\) :is\\(button`))
        }
        expect(steps).toMatch(/\.rigbar \.sbar-link[^{]*\{\s*min-height: 24px;\s*\}/)
        expect(steps).toMatch(/\{\s*min-width: 24px;\s*\}/)
        expect(css('../perform/perform.css')).toMatch(/\.perform-pane :is\(button[^{]*\{\s*min-height: 24px;\s*min-width: 24px;/)
        expect(css('../map/mapSurface.css')).toMatch(/\.map-mini, \.map-toggle, \.map-action, \.map-output-controls button \{ min-height: 24px; min-width: 24px; \}/)
        // the window's square, dash and cross are already 44px in the shared window CSS
        expect(css('../raw/styles/raw.css')).toMatch(/\.raw-window-actions button \{[^}]*min-height: 44px;[^}]*min-width: 44px/)
    })

    it('the map labels follow the label-case token, not a hard-coded uppercase', () => {
        const m = css('../map/mapSurface.css')
        expect(m).toMatch(/\.map-bar-lane \{[^}]*text-transform: var\(--di-label-case\)/)
        expect(m).toMatch(/\.map-panel-head h2 \{[^}]*text-transform: var\(--di-label-case\)/)
    })
})
