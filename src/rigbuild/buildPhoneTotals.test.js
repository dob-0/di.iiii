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
    const rowTop = Number(/\.rigbuild\.is-phone \.rigbuild-totals \{ top: (\d+)px; \}/.exec(css)?.[1])
    it('puts the status box on a second row under the items button', () => {
        expect(rule('.rigbuild.is-phone .rigbuild-mode--items')).toMatch(/top:\s*58px/)
        // button is 48px tall at top 58px, so the box must start at 106px or lower
        expect(rowTop).toBeGreaterThanOrEqual(58 + 48)
        expect(phone).not.toMatch(/calc\(100vw - 188px\)/)
    })
    it('moves the box down by the same step when the rig bar is shown', () => {
        expect(rule('.rigbuild.has-rigbar.is-phone .rigbuild-totals')).toMatch(/top:\s*calc\(var\(--rigbar-h\) \+ (\d+)px\)/)
        const n = Number(/\+ (\d+)px/.exec(rule('.rigbuild.has-rigbar.is-phone .rigbuild-totals'))[1])
        expect(n).toBeGreaterThanOrEqual(58 + 48)
    })
})
