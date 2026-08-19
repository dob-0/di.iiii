import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The top bar's layout, guarded as a contract rather than as pixels.
//
// The bug these exist for: the words and the buttons were two absolutely-
// positioned corners that knew nothing about each other, so on a 390px phone
// the subtitle ran underneath the Full screen pill, and with the author-only
// XR paragraph in the cluster the pill wrapped into a two-line circle sitting
// on top of the word "algovrithm". Nothing failed. Every string was in the DOM,
// every element was visible, and every existing test passed — an overlap is
// invisible to anything that does not either measure boxes or look.
//
// scripts/verify-algovrithm.mjs measures the boxes in a real browser at phone
// widths, which is the real guard. These are the cheap half: they pin the
// STRUCTURE that makes the overlap impossible, so a well-meaning refactor back
// to two floating corners fails here in milliseconds rather than in a browser
// run someone has to remember to do.
//
// Read as text deliberately. Vite rewrites `new URL('./x.css', import.meta.url)`
// into an asset URL, so the CSS cannot be imported for inspection.
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'algoVrithm.css'), 'utf8')
const jsx = readFileSync(join(here, 'AlgoVrithmExperience.jsx'), 'utf8')

const ruleFor = (selector) => {
    const at = css.indexOf(`\n${selector} {`)
    if (at === -1) return ''
    return css.slice(at, css.indexOf('}', at))
}

describe('the top bar cannot overlap itself', () => {
    it('holds the words and the buttons in ONE flex row', () => {
        const chrome = ruleFor('.algo-vrithm-chrome')
        expect(chrome).toContain('display: flex')
        // The whole guarantee: the two children are laid out against each other
        // instead of being stacked into the same corner.
        expect(chrome).toContain('justify-content: space-between')
    })

    it('nests the buttons inside the bar rather than floating them over it', () => {
        // A sibling would be positioned independently again, which is the bug.
        const bar = jsx.slice(jsx.indexOf('<header className={`algo-vrithm-chrome'))
        const header = bar.slice(0, bar.indexOf('</header>'))
        expect(header).toContain('algo-vrithm-chrome-text')
        expect(header).toContain('algo-vrithm-actions')
    })

    it('never positions the buttons absolutely', () => {
        // `position: absolute` here would take them back out of the row and
        // silently restore the collision while every other assertion passed.
        expect(ruleFor('.algo-vrithm-actions')).not.toContain('position: absolute')
    })

    it('makes the text give way, not the tap targets', () => {
        // Without `min-width: 0` a flex item will not shrink below its content,
        // so the sentence would shove the buttons off the right edge instead of
        // wrapping — the same defect wearing the opposite mask.
        expect(ruleFor('.algo-vrithm-chrome-text')).toContain('min-width: 0')
        expect(ruleFor('.algo-vrithm-actions')).toContain('flex: 0 0 auto')
    })

    it('switches the buttons off when the bar fades out', () => {
        // The bar is pass-through, so the buttons re-enable pointer events for
        // themselves — which means the parent's `pointer-events: none` while
        // hidden does not reach them. An invisible button that still takes taps
        // is worse than a visible one.
        expect(css).toContain('.algo-vrithm-chrome.is-hidden .algo-vrithm-actions')
    })
})

describe('author-only furniture stays out of the audience header', () => {
    it('renders the headset read-outs in the authoring stack, not the actions', () => {
        expect(jsx).toContain('algo-vrithm-diagnostics')
        // The old home. A paragraph pinned to the right-hand corner grows
        // leftwards across the title, and no breakpoint can fix a sentence and
        // a title sharing one line on a phone.
        expect(css).not.toContain('.algo-vrithm-actions button.algo-vrithm-xr-unavailable')
        expect(css).not.toContain('.algo-vrithm-actions .algo-vrithm-xr-eye')
    })

    it('hides the keyboard hint where there is no keyboard', () => {
        // usePanelToggle is explicit that the absence of a keyboard IS the
        // device check — a phone cannot open the director at all. So on a phone
        // this line is an instruction that cannot be followed, and it is the
        // longest string in the header.
        const query = '@media (pointer: coarse) and (hover: none)'
        const at = css.indexOf(query)
        expect(at).toBeGreaterThan(-1)
        const block = css.slice(at, at + 220)
        expect(block).toContain('.algo-vrithm-panel-hint')
        expect(block).toContain('display: none')
    })
})
