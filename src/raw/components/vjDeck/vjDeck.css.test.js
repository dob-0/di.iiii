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

    it('F5: no text selection while a seam is dragged (the mark on the deck root)', () => {
        expect(block(".vj-deck[data-seam-dragging] {")).toContain('user-select: none')
    })

    it('F7: a seam zone lies over the gap, never over a tile (S4 is the 7px gap, S1 starts left of the tiles)', () => {
        const s4 = block(".vj-deck-seam[data-seam='s4'] {")
        // Round 4: both zones grew to 12px (deckPanes.test.js reads the sizes): S4 5px into the empty top
        // padding of the bottom panels, S1 into the layer strip's right padding, now 12px.
        expect(s4).toContain('--vj-zone: var(--di-space-3)')
        expect(s4).toContain('bottom: calc(var(--di-space-3) * -1)')
        const s1 = block(".vj-deck-seam[data-seam='s1'] {")
        expect(s1).toContain('--vj-zone: var(--di-space-3)')
        expect(s1).toContain('left: calc(var(--vj-head) - var(--di-space-3) + var(--di-space-1))')
        expect(block(".vj-deck-seam[data-seam='s2'] {")).toContain('right: var(--vj-monitor-w)')
        expect(css).not.toContain('--vj-seam:')
    })

    it('touch: S5 and S6 grow to the right only, so the scrollbar of the panel before them stays free', () => {
        const start = css.indexOf('@media (pointer: coarse) {\n    .vj-deck-seam[data-seam=\'s5\']')
        expect(start).toBeGreaterThan(-1)
        const rule = css.slice(start, css.indexOf("data-seam='s4'", start))
        expect(rule).toContain('--vj-zone: calc(var(--di-space-3) * 2)')
        expect(rule).not.toContain('margin-left')
        expect(rule).not.toContain('--vj-lead')
    })

    it('F8: hover and focus draw the whole seam in --di-cyan; the resting mark is 40px long', () => {
        const rule = block('.vj-deck-seam:hover::before,')
        expect(rule).toContain('.vj-deck-seam:focus-visible::before')
        expect(rule).toContain('background: var(--di-cyan)')
        expect(block('.vj-deck-seam {')).toContain('--vj-mark: var(--di-space-7)')
        expect(block(".vj-deck-seam[aria-orientation='vertical']::before {")).toContain('bottom: 0')
        expect(block(".vj-deck-seam[aria-orientation='horizontal']::before {")).toContain('right: 0')
        expect(block('.vj-deck-seam {')).not.toMatch(/transition|box-shadow|filter/)
    })
})
