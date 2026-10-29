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

// UX audit 2026-10-28, build page at 390: the status box ("patch · 12", "power · …")
// was 58vw wide from the right edge, so its left side ran under the ITEMS button
// (left 96px, about 75px wide).
describe('build page on a phone: the status box and the items button', () => {
    it('keeps the status box right of the items button', () => {
        const items = Number(/left:\s*(\d+)px/.exec(rule('.rigbuild.is-phone .rigbuild-mode--items'))?.[1])
        const totals = rule('.rigbuild.is-phone .rigbuild-totals')
        const right = Number(/right:\s*(\d+)px/.exec(totals)?.[1])
        const sub = Number(/max-width:\s*calc\(100vw - (\d+)px\)/.exec(totals)?.[1])
        expect(items).toBe(96)
        // box left edge = 390 - right - max-width must clear the button's right edge (96 + 75 + 8 gap)
        const widest = 390 - sub
        expect(390 - right - widest).toBeGreaterThanOrEqual(items + 75)
    })
})
