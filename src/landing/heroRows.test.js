import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import LandingPage from './LandingPage.jsx'

const HERE = dirname(fileURLToPath(import.meta.url))
// Comments out first: they sit in front of the selector they explain, and this
// file's explanations are long enough to swallow the rule they belong to.
const css = readFileSync(resolve(HERE, 'landing.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const jsx = readFileSync(resolve(HERE, 'LandingPage.jsx'), 'utf8')

const declarations = (selector) => {
    // Every block whose selector list contains this exact selector.
    const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter(([, head]) => head.split(',').some((s) => s.trim() === selector))
    return blocks.map(([, , body]) => body).join('\n')
}

// 2026-09-01. The four featured-space buttons piled into each other at 390px,
// live on production since the row shipped. Not a wrapping bug of ours: MUI's
// `spacing` prop compiles to `margin-left` on every sibling and NOTHING else,
// so a row that wraps gets zero vertical separation — the four 2px-bordered
// buttons stacked edge to edge — and every line after the first is pushed right
// by that same margin, so a row set to justify centre stops being centred.
//
// jsdom does no layout, so this cannot be caught by rendering. It is asserted
// where the mistake actually lives: the row has to declare a real flex `gap`,
// and it has to switch MUI's margin back off, or one of the two silently wins.
describe('the hero rows wrap without piling up', () => {
    it.each(['.lp-hero-space-row', '.lp-hero-cta-row'])('%s declares a real flex gap', (selector) => {
        expect(declarations(selector)).toMatch(/\bgap:\s*\d+px/)
    })

    it('turns off the margin-left MUI puts on the wrapped children', () => {
        const guards = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
            .filter(([, head]) => /\.lp-hero-(space|cta)-row\s*>\s*\*/.test(head))
            .map(([, , body]) => body)
        expect(guards.length, 'a `> *` rule must zero the spacing margin').toBeGreaterThan(0)
        expect(guards.join('\n')).toMatch(/margin-left:\s*0\s*!important/)
    })

    // The row is the seed of the spaces unfold: each button gets measured with
    // getBoundingClientRect() and lifted into the CSS3D scene on its own, so
    // they must stay four separate elements with stable class hooks. Fusing
    // them into one control, or dropping a hook, breaks that before it is
    // written.
    it('keeps four separately addressable space buttons', () => {
        expect(typeof LandingPage).toBe('function')
        for (const hook of ['landing-cta-wcc', 'landing-cta-br-id-ge', 'landing-cta-beyond-form', 'landing-cta-algo-vrithm']) {
            expect(jsx, `${hook} is a measurement hook, not decoration`).toContain(hook)
        }
        expect(jsx).toContain('lp-nav-spaces')
    })
})
