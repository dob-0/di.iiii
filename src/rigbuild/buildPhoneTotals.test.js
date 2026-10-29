import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(HERE, './build.css'), 'utf8')
const rule = (selector) => {
    const at = css.indexOf(`${selector} {`)
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

// UX audit 2026-10-28, build page at 390 (round 4): the status box ("patch · 12", "power · …")
// shared the ITEMS button's row, so at 390 its left edge (164px) lay under the button (96 to 173px).
// Now it is a second row: below the button, from the right edge, wide enough for 320 to 430.
describe('build page on a phone: the status box and the items button', () => {
    const phone = rule('.rigbuild.is-phone .rigbuild-totals')
    const rowTop = Number(/top:\s*(\d+)px/.exec(phone)?.[1])
    it('puts the status box on a second row under the items button', () => {
        expect(rule('.rigbuild.is-phone .rigbuild-mode--items')).toMatch(/top:\s*58px/)
        // button is at most 48px tall (min-height 44px) at top 58px, so the box must start at 106px or lower
        expect(rowTop).toBeGreaterThanOrEqual(58 + 48)
        expect(phone).not.toMatch(/calc\(100vw - 188px\)/)
    })
    it('moves the box down by the same step when the rig bar is shown', () => {
        // the standing (portrait) rule, outside the landscape block
        const bar = /\n\.rigbuild\.has-rigbar\.is-phone \.rigbuild-totals \{([^}]*)\}/.exec(css)?.[1] ?? ''
        expect(bar).toMatch(/top:\s*calc\(var\(--rigbar-h\) \+ (\d+)px\)/)
        const n = Number(/\+ (\d+)px/.exec(bar)?.[1])
        expect(n).toBeGreaterThanOrEqual(58 + 48)
    })
    it('lying down (landscape phone) keeps the box on the first row, clear of the thumbs', () => {
        const land = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 500px)'))
        const block = land.slice(0, land.indexOf('\n}'))
        expect(block).toMatch(/\.rigbuild\.is-phone \.rigbuild-totals \{[^}]*top:\s*58px/)
        expect(block).toMatch(/\.rigbuild\.has-rigbar\.is-phone \.rigbuild-totals \{\s*top:\s*calc\(var\(--rigbar-h\) \+ 58px\)/)
        // 40vw from the right at 568 to 932 px wide starts right of the button (96 + 77)
        expect(568 - 8 - 0.4 * 568 - 14).toBeGreaterThan(96 + 77)
    })
})
