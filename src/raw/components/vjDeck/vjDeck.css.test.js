import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Rules of vjDeck.css that only a browser can show, guarded as text (the walk measures them:
// scripts/deck-comfort-walk.mjs part S). Each one is a gap found on 2026-11-11.
const css = fs.readFileSync(path.join(import.meta.dirname, 'vjDeck.css'), 'utf8')
const block = (selector) => {
    const at = css.indexOf(selector)
    if (at === -1) return ''
    return css.slice(at, css.indexOf('}', at))
}

describe('vjDeck.css guards', () => {
    it('five layers are asked of the main row in every placement (the window placement had no rule)', () => {
        const rule = css.slice(css.indexOf('@media (min-height: 800px)'))
        expect(rule).toContain('.vj-deck .vj-deck-main')
        expect(rule).toContain('min(var(--vj-layers), 5)')
        expect(css).toContain('.vj-deck--window {')
    })

    it('a tile narrower than 180px wraps its name onto two lines, broken anywhere', () => {
        const at = css.indexOf('@container (max-width: 179px)')
        expect(at).toBeGreaterThan(-1)
        const rule = css.slice(at, css.indexOf('\n}\n', at))
        expect(rule).toContain('-webkit-line-clamp: 2')
        expect(rule).toContain('overflow-wrap: anywhere')
        expect(block('.vj-deck-tile {')).toContain('container-type: inline-size')
    })

    it('the end room is declared on the scroll box that VjDeckView writes it on, never on the grid below it (a child declaration shadows the inline value: 52 rows under the header, 2026-11-11)', () => {
        expect(block('.vj-deck-scroll {')).toContain('--vj-end-room: 0px')
        expect(block('.vj-deck-grid {')).not.toContain('--vj-end-room:')
    })

    it('the Sources panel has no height cap', () => {
        expect(block('.vj-deck-sources {')).not.toMatch(/max-height:\s*240/)
    })
})
