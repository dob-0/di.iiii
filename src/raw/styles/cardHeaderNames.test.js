import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE NAME WINS THE HEADER. On a 200px card "Environment" and "Background"
// read "Environ…" and "Backgro…" while the family tag "the scene" stood whole
// beside them (nodecheck 2026-10-02): the label was `flex: 1` (basis 0, so it
// only ever got what was left) and the tag `flex-shrink: 0`. jsdom cannot lay
// a card out, so the measured proof is the browser check in the PR; this holds
// the two rules that make it true.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'raw.css'), 'utf8')

const block = (selector) => {
    const at = css.indexOf(`\n${selector} {`)
    if (at === -1) return null
    const open = css.indexOf('{', at)
    return css.slice(open + 1, css.indexOf('}', open))
}

const flex = (rules) => {
    const match = /(?:^|\n)\s*flex:\s*([^;]+);/.exec(rules || '')
    if (!match) return null
    const [grow, shrink, basis] = match[1].trim().split(/\s+/)
    return { grow: Number(grow), shrink: Number(shrink ?? 1), basis: basis ?? '0%' }
}

describe('card header: the name wins the width', () => {
    it('sizes the name from its content and lets it shrink only last', () => {
        const label = flex(block('.raw-graph-node-label'))
        expect(label, '.raw-graph-node-label needs a three-part flex').toBeTruthy()
        expect(label.basis).toBe('auto')
        expect(block('.raw-graph-node-label')).toMatch(/min-width:\s*0/)
    })

    it('makes the family tag give way first, with an ellipsis, never pushing the name', () => {
        const tag = flex(block('.raw-graph-node-category'))
        const label = flex(block('.raw-graph-node-label'))
        expect(tag, '.raw-graph-node-category needs a three-part flex').toBeTruthy()
        expect(tag.shrink).toBeGreaterThanOrEqual(label.shrink * 100)
        expect(block('.raw-graph-node-category')).toMatch(/text-overflow:\s*ellipsis/)
        expect(block('.raw-graph-node-category')).not.toMatch(/flex-shrink:\s*0/)
    })

    it('keeps the card a rectangle (no round UI)', () => {
        for (const selector of ['.raw-graph-node-label', '.raw-graph-node-category', '.raw-graph-node-header']) {
            expect(block(selector) || '').not.toMatch(/border-radius:\s*([3-9]|\d{2,})px/)
        }
    })
})
