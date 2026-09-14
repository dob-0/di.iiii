import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Design audit B9/#13 — a window's title bar wrapped to a second row (94px
// measured, on a 267px-wide window) the moment the title and its action
// glyphs did not both fit on one line. The fix is: never wrap, truncate the
// title and kicker instead. This is the executable half of that contract —
// the same block()-by-selector approach as colourRoles.test.js.
const stylesDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(stylesDir, 'raw.css'), 'utf8')

const block = (selector) => {
    const at = css.indexOf(`\n${selector} {`)
    if (at === -1) return null
    const open = css.indexOf('{', at)
    const close = css.indexOf('}', open)
    return css.slice(open + 1, close)
}

describe('raw window header — one line, always', () => {
    it('never wraps the header onto a second row', () => {
        const header = block('.raw-window-header')
        expect(header, '.raw-window-header rule not found').toBeTruthy()
        expect(header).toMatch(/flex-wrap:\s*nowrap/)
    })

    it('truncates a title too long for the row instead of wrapping it', () => {
        const title = block('.raw-window-header h3')
        expect(title, '.raw-window-header h3 rule not found').toBeTruthy()
        expect(title).toMatch(/overflow:\s*hidden/)
        expect(title).toMatch(/text-overflow:\s*ellipsis/)
        expect(title).toMatch(/white-space:\s*nowrap/)
    })

    it('truncates the kicker the same way, and keeps it off the 8/10px floor', () => {
        const kicker = block('.raw-window-kicker')
        expect(kicker, '.raw-window-kicker rule not found').toBeTruthy()
        expect(kicker).toMatch(/overflow:\s*hidden/)
        expect(kicker).not.toMatch(/font-size:\s*var\(--di-text-[12]\)/)
    })

    it('never shrinks the action glyphs off the row', () => {
        const actions = block('.raw-window-actions')
        expect(actions, '.raw-window-actions rule not found').toBeTruthy()
        expect(actions).toMatch(/flex-wrap:\s*nowrap/)
        expect(actions).toMatch(/flex-shrink:\s*0/)
    })
})
