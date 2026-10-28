import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ONE JOB PER COLOUR — the rule this file exists to keep.
//
// A floating window and a graph card used to be the same rectangle: the same
// `--di-cyan-border` hairline, the same square corner, the same near-black
// fill, neither casting a shadow. Nothing said which lay on the canvas and
// which floated above it, because cyan was the border of everything and so
// meant nothing. The rule now is:
//
//   neutral   — furniture: windows, palette, topbar, HUD, resting controls
//   family    — what a node IS: its card's edge and icon, and the stripe on
//               the window that hosts it (--card-family / --window-accent)
//   cyan      — interaction only: selected, hover, focus
//   port hue  — data type: wires and port dots (untouched)
//
// A stylesheet cannot be unit-tested for beauty, but it can be held to that
// division. Every assertion below is a sentence from the rule; if a later
// change puts cyan back on a resting container, one of them fails and says so.
const stylesDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(stylesDir, 'raw.css'), 'utf8')

// The declarations of one rule block, by exact selector.
const block = (selector) => {
    const at = css.indexOf(`\n${selector} {`)
    if (at === -1) return null
    const open = css.indexOf('{', at)
    const close = css.indexOf('}', open)
    return css.slice(open + 1, close)
}

describe('raw colour roles', () => {
    it('dresses the floating window as furniture, not as a graph object', () => {
        const win = block('.raw-window')
        expect(win, '.raw-window rule not found — did the selector change?').toBeTruthy()
        expect(win).not.toMatch(/--di-cyan/)
        expect(win).toMatch(/rgba\(255, 255, 255/)
    })

    it('gives the window its node\'s family as the one hue it carries', () => {
        expect(block('.raw-window')).toMatch(/--window-accent/)
        expect(block('.raw-window-kicker')).toMatch(/--window-accent/)
    })

    it('takes the card\'s edge and icon from the node\'s family', () => {
        expect(block('.raw-graph-node-card')).toMatch(/--card-family/)
        expect(block('.raw-graph-node-icon')).toMatch(/--card-family/)
    })

    it('keeps cyan for interaction, on the card that is selected', () => {
        expect(block('.raw-graph-node-card.is-selected')).toMatch(/--di-cyan/)
    })

    it('holds window controls to the 44px one-finger floor', () => {
        const btn = block('.raw-window-actions button')
        expect(btn).toBeTruthy()
        expect(btn).toMatch(/min-height:\s*44px/)
        expect(btn).toMatch(/min-width:\s*44px/)
        // No font-family at all is how these ended up rendering in the
        // browser's default Arial while the rest of the lane is Inter.
        expect(btn).toMatch(/font-family/)
    })

    it('holds the Open row of the selection sheet to the same floor on a phone', () => {
        // The door is gone (audit 2026-10-05 B2). A finger has no double-click,
        // so the sheet's first row, Open, is the way in on touch: 44px there.
        expect(css).not.toMatch(/\.raw-graph-node-door/)
        const coarse = css.slice(css.indexOf('@media (hover: none), (pointer: coarse)'))
        const at = coarse.indexOf('.raw-property-open')
        expect(at, 'the coarse-pointer branch no longer mentions .raw-property-open').toBeGreaterThan(-1)
        const rule = coarse.slice(at, coarse.indexOf('}', at))
        expect(rule).toMatch(/min-height:\s*44px/)
    })

    it('gives pinned and minimized windows a visible difference', () => {
        // Both classes rode on the markup for months with zero rules, so a
        // pinned window was indistinguishable from an unpinned one.
        expect(css).toMatch(/\.raw-window\.is-pinned/)
        expect(css).toMatch(/\.raw-window\.is-minimized/)
    })

    // `.raw-card` read `var(--di-card)` — a token defined nowhere and with no
    // fallback, so the declaration was invalid at computed-value time and the
    // background silently never applied. Nothing failed; it just did nothing.
    // A token WITH a fallback (`var(--card-scale, 1)`) is a different thing —
    // a knob a component may set — so only the fallback-less ones are checked.
    // "what is it made of" sits in the marker strip, which is the one thing a
    // lost person on a phone reaches for; and the sheet's only control is a
    // link-looking button that is still a finger's target.
    // The marker's "?" went with the round pill (audit 2026-10-05 §3.6: the
    // inside view is the reading); the sheet's own control keeps the floor.
    it('holds the anatomy sheet\'s control to the finger floor', () => {
        for (const selector of ['.raw-anatomy-goto']) {
            const rule = block(selector)
            expect(rule, `${selector} rule not found — did the selector change?`).toBeTruthy()
            expect(rule, selector).toMatch(/min-height:\s*44px/)
            expect(rule, selector).toMatch(/touch-action:\s*manipulation/)
        }
    })

    // The sheet is a reading, not a selection: nothing in it rests in cyan, and
    // the one hue it carries is the node's own family, through the window's
    // accent property rather than a colour of its own.
    it('keeps the anatomy sheet neutral at rest', () => {
        expect(block('.raw-anatomy')).not.toMatch(/--di-cyan/)
        expect(block('.raw-anatomy-slot')).not.toMatch(/--di-cyan/)
        expect(block('.raw-anatomy-badge')).toMatch(/--window-accent/)
        // …and cyan only where a pointer is.
        expect(block('.raw-anatomy-goto:hover,\n.raw-anatomy-goto:focus-visible')
            || css.slice(css.indexOf('.raw-anatomy-goto:hover'), css.indexOf('.raw-anatomy-goto:hover') + 160))
            .toMatch(/--di-cyan/)
    })

    it('defines every token it uses without a fallback', () => {
        const base = readFileSync(join(stylesDir, '../../styles/base.css'), 'utf8')
        const bare = [...css.matchAll(/var\((--[a-z0-9-]+)\s*\)/gi)].map((m) => m[1])
        // Set inline by a component, which is a definition — just not in a file.
        const setByComponents = new Set(['--card-family', '--window-accent', '--raw-scaffold-top', '--raw-zoom'])
        // Declared by the one bar's own stylesheet. The only rules here that read
        // its height apply while the bar is drawn (.is-under-sbar), and drawing it
        // loads that sheet — so the token is always there when it is read.
        const bar = readFileSync(join(stylesDir, '../../components/surfaceBar.css'), 'utf8')
        // raw.css's first line imports the Nodes chrome sheet, which declares
        // the --raw-* scale (spacing, type, cell) on :root.
        const chrome = readFileSync(join(stylesDir, 'rawChrome.css'), 'utf8')
        expect(css.startsWith('@import "./rawChrome.css";')).toBe(true)
        const missing = [...new Set(bare)].filter((token) => (
            !setByComponents.has(token) && !base.includes(`${token}:`) && !css.includes(`${token}:`) && !bar.includes(`${token}:`) && !chrome.includes(`${token}:`)
        ))
        expect(missing, `raw.css uses undefined token(s) with no fallback: ${missing.join(', ')}`).toEqual([])
    })
})
