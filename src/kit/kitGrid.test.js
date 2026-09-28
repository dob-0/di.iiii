import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// jsdom lays nothing out, so the grid's symmetry is held as a contract on the
// stylesheet itself (2026-09-29: cards in one row stood 423–571px tall, and a
// group of 4 or 5 left a card hanging at the left of its last row).
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'kit.css'), 'utf8')
const rule = (selector) => {
    const at = css.indexOf(`\n${selector} {`)
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('the Kit grid keeps its rows even', () => {
    it('lets every card in a row share its lines: picture, name, sentence, button, facts', () => {
        expect(rule('.kit-card')).toMatch(/grid-template-rows:\s*subgrid/)
        expect(rule('.kit-card')).toMatch(/grid-row:\s*span 5/)
        expect(rule('.kit-body')).toMatch(/display:\s*contents/)
    })

    it('never lets a card size itself to its own content inside a row', () => {
        expect(rule('.kit-grid')).not.toMatch(/align-items:\s*start/)
    })

    it('centres a short last row at three across and at two', () => {
        expect(css).toMatch(/\.kit-card:last-child:nth-child\(3n \+ 1\) \{ grid-column: 3 \/ span 2; \}/)
        expect(css).toMatch(/\.kit-card:nth-last-child\(2\):nth-child\(3n \+ 1\) \{ grid-column: 2 \/ span 2; \}/)
        expect(css).toMatch(/\.kit-card:last-child:nth-child\(2n \+ 1\) \{ grid-column: 2 \/ span 2; \}/)
    })
})
