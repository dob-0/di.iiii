// The scene deck page must own its scroll. jsdom does no layout, so this holds the stylesheet text that
// decided it: html/body/#root are position:fixed (src/styles/base.css), the document never scrolls, and a
// page that only sets min-height overflows a fixed viewport with nothing to scroll — 2026-10-01 MOXIR show
// test: on an iPhone 13 (390x664) the scene tiles sat at y~900 and could not be reached; on an iPad Pro 11
// the fixed foot (UNDO / RESTORE LAST GOOD / MARK THIS AS GOOD) covered all but 6 of 14 tiles.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'scenes.css'), 'utf8')
const block = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{[^}]*\\}`))?.[0] ?? ''
}

describe('scene deck page scroll', () => {
    const page = block('.rigscenes-page')

    it('the page is a bounded scroller (height + overflow-y auto), not a min-height box', () => {
        expect(page).toMatch(/height:\s*100%/)
        expect(page).toMatch(/overflow-y:\s*auto/)
        expect(page).not.toMatch(/min-height:\s*100vh/)
    })

    it('reserves room so the foot and the corner badge never cover the last row', () => {
        expect(page).toMatch(/padding-bottom:\s*\d+px/)
        expect(page).toMatch(/scroll-padding-bottom:\s*\d+px/)
    })

    it('the foot stays sticky inside the scroller (it rests after the last tile instead of over it)', () => {
        expect(block('.rigscenes-foot')).toMatch(/position:\s*sticky/)
    })
})
