// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The clean-run layout faults (owner, 2026-11-10): sliders, labels and numbers
// drawn over each other in the Master bar, the Laser master over its button.
// jsdom has no layout, so the contract is read from the stylesheet; the real
// widths are measured on the page (PROGRESS.md (the feat-perform-full entry)).
const css = readFileSync(fileURLToPath(new URL('./perform.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector) => {
    const start = css.indexOf(`\n${selector} {`)
    expect(start, `${selector} is in perform.css`).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('}', start))
}

describe('perform.css layout contract: nothing overlaps, items wrap', () => {
    it('a bar block (Master, Clock) wraps its items and never clips them', () => {
        const bar = rule('.perform-bar')
        expect(bar).toMatch(/flex-wrap:\s*wrap/)
        expect(bar).not.toMatch(/overflow:\s*hidden/)
    })

    it('a row inside a block (the Laser master and its Follow button) wraps', () => {
        expect(rule('.perform-row')).toMatch(/flex-wrap:\s*wrap/)
    })

    it('the state words wrap and may shrink', () => {
        const states = rule('.perform-states')
        expect(states).toMatch(/flex-wrap:\s*wrap/)
        expect(states).toMatch(/min-width:\s*0/)
    })

    it('a slider has a floor width, so it wraps to the next line instead of being squeezed under its neighbour', () => {
        expect(rule('.perform-slider')).toMatch(/min-width:\s*min\(100%,\s*120px\)/)
    })
})
