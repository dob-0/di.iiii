import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import MapTestPattern, { DEFAULT_TEST_PATTERN, TEST_PATTERNS } from './mapTestPattern.jsx'

// The rule these tests guard, in the owner's own words: NEVER put white on
// the projector — warm colours only. He set it standing in a club at midnight
// after a white test card hit the wall, and it has cost him once already.
//
// A projection rig is two machines: the desk here, the wall there. Whatever a
// surface draws is ON THE PROJECTOR, not in a preview — so the picture a
// surface is BORN with is a thing that lands on a wall in front of an
// audience, and it cannot be white.
//
// The alignment grid is the opposite case and is deliberately left alone: a
// person on a ladder tracing geometry onto paper needs it as bright as the
// projector can make it. It is one choice away in the Pattern picker.

const CHANNELS = (hex) => {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim())
    if (!match) return null
    const value = parseInt(match[1], 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

// Rec.709, the same weighting the screenshot assertion in the PR uses, so the
// number this test talks about is the number a pixel sampler would report.
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const inksOf = (container) => {
    const inks = []
    container.querySelectorAll('svg *').forEach((node) => {
        ;['fill', 'stroke'].forEach((attribute) => {
            const value = node.getAttribute(attribute)
            if (!value || value === 'none') return
            const channels = CHANNELS(value)
            expect(channels, `${attribute}="${value}" is not a plain hex colour`).toBeTruthy()
            inks.push({ attribute, value, channels })
        })
    })
    return inks
}

describe('the identification card a new surface is born showing', () => {
    it('is what an unnamed pattern means', () => {
        expect(DEFAULT_TEST_PATTERN).toBe('card')
        expect(TEST_PATTERNS.map((pattern) => pattern.id)).toContain('card')
    })

    it('draws nothing above 40% brightness, and nothing near white', () => {
        const { container } = render(<MapTestPattern pattern="card" width={640} height={360} label="ԳՈՌ" />)
        const inks = inksOf(container)
        expect(inks.length).toBeGreaterThan(2)
        inks.forEach(({ value, channels }) => {
            expect(luma(channels), `${value} is too bright for a wall`).toBeLessThan(0.4 * 255)
            expect(Math.min(...channels), `${value} reads as near-white`).toBeLessThanOrEqual(200)
        })
    })

    it('is warm — every ink it draws has more red in it than blue', () => {
        // "Warm colours only" is the other half of the rule. A dim BLUE card
        // would pass the brightness check and still break the instruction.
        const { container } = render(<MapTestPattern pattern="card" width={640} height={360} label="ԳՈՌ" />)
        inksOf(container).forEach(({ value, channels: [r, , b] }) => {
            expect(r, `${value} is not a warm colour`).toBeGreaterThanOrEqual(b)
        })
    })

    it('says which surface it is, so several can be aimed one at a time', () => {
        const { container } = render(<MapTestPattern pattern="card" width={640} height={360} label="ԳՈՌ" />)
        expect(container.querySelector('text')?.textContent).toBe('ԳՈՌ')
    })
})

describe('the alignment grid', () => {
    it('is still full white on black — the person on the ladder needs it bright', () => {
        const { container } = render(<MapTestPattern pattern="grid" width={640} height={360} label="ԳՈՌ" />)
        const inks = inksOf(container)
        expect(inks.some(({ value }) => value.toLowerCase() === '#ffffff')).toBe(true)
        expect(inks.some(({ value }) => value.toLowerCase() === '#000000')).toBe(true)
        // Its label is white too, not dimmed along with the card.
        expect(container.querySelector('text').getAttribute('fill').toLowerCase()).toBe('#ffffff')
    })

    it('is still what an unknown pattern falls back to', () => {
        // A mapping written by a LATER build, naming a pattern this one has
        // never heard of, is better off with a grid than with nothing.
        const { container } = render(<MapTestPattern pattern="not-a-pattern" width={640} height={360} />)
        expect(inksOf(container).some(({ value }) => value.toLowerCase() === '#ffffff')).toBe(true)
    })
})

// The placeholder is the card's neighbour and was its blind spot. It is what
// EVERY unfinished surface draws that is not a test pattern — "no file yet",
// "no project chosen", "waiting to start", "camera unavailable", and now the
// NDI® states — and until 2026-09-20 its ink was `--ui-text-primary`, which
// resolves to pure #ffffff. Measured on the real /out page at 1440x900 it put
// 21,394 near-white pixels on the projector, printing the surface's NAME in
// white while somebody was still deciding what it shows. The card fix of the
// same morning caught the bright alignment grid and walked past this.
//
// The colours are read out of the stylesheet as text, because jsdom applies no
// stylesheet and a computed-style assertion here would be green on an empty
// string. It is a coarse check and it is the one that would have caught this.
describe('the dim placeholder every unfinished surface draws', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mapSurface.css'), 'utf8')
    const block = (selector) => {
        const at = css.indexOf(`${selector} {`) >= 0 ? css.indexOf(`${selector} {`) : css.indexOf(`${selector}{`)
        expect(at, `${selector} is gone from mapSurface.css`).toBeGreaterThan(-1)
        return css.slice(at, css.indexOf('}', at))
    }


    // The spine forbids a hex literal outside base.css, so these blocks name a
    // token and the value lives one file away. Follow it: an assertion that
    // reads only this file goes green on a token resolving to #ffffff, which is
    // exactly the bug this block exists for.
    const baseCssText = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'base.css'), 'utf8')
    const inksOf = (text) => [...text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
        .map(([, name]) => (baseCssText.match(new RegExp(name + ':\\s*(#[0-9a-fA-F]{3,8})')) || [])[1])
        .filter(Boolean)
        .concat([...text.matchAll(/#[0-9a-f]{6}\b/gi)].map(([hex]) => hex))

    it('names its own colours rather than borrowing the interface’s white', () => {
        // A token is the failure mode: `--ui-text-primary` reads as a sensible
        // choice and is #ffffff. The wall's colours are stated here, in hex,
        // where a person reading this file can see what will be on a projector.
        const ground = block('.map-source-placeholder')
        expect(ground).not.toMatch(/--ui-text/)
        expect(block('.map-source-placeholder-detail')).not.toMatch(/--ui-text/)
    })

    it('draws nothing above 40% brightness, and nothing near white', () => {
        const hexes = [
            ...inksOf(block('.map-source-placeholder')),
            ...inksOf(block('.map-source-placeholder-label')),
            ...inksOf(block('.map-source-placeholder-detail'))
        ]
        expect(hexes.length, 'the placeholder names no colour at all').toBeGreaterThan(2)
        hexes.forEach((hex) => {
            const channels = CHANNELS(hex)
            expect(luma(channels), `${hex} is too bright for a wall`).toBeLessThan(0.4 * 255)
            expect(Math.min(...channels), `${hex} reads as near-white`).toBeLessThanOrEqual(200)
        })
    })

    it('is warm, like the card — more red in every ink than blue', () => {
        inksOf(css.slice(css.indexOf('.map-source-placeholder {')).slice(0, 900)).forEach((hex) => {
            const [r, , b] = CHANNELS(hex)
            expect(r, `${hex} is not a warm colour`).toBeGreaterThanOrEqual(b)
        })
    })
})

// The same card is drawn from two places that cannot share a value: this module
// paints it into a canvas, and `.map-source-placeholder` paints it in CSS for
// the states that say WHY a surface is empty. Since the spine keeps every hex
// in base.css, nothing but this test stops the canvas and the stylesheet
// drifting into two different cards on one wall.
describe('the canvas card and the CSS card', () => {
    const at = (file) => join(dirname(fileURLToPath(import.meta.url)), file)
    const baseCss = readFileSync(at('../styles/base.css'), 'utf8')
    const source = readFileSync(at('mapTestPattern.jsx'), 'utf8')
    const token = (name) => (baseCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`)) || [])[1]?.toLowerCase()
    const constant = (name) => (source.match(new RegExp(`const ${name} = '(#[0-9a-fA-F]{3,8})'`)) || [])[1]?.toLowerCase()

    it('are inked the same', () => {
        expect(token('di-card-ground')).toBe(constant('CARD_GROUND'))
        expect(token('di-card-frame')).toBe(constant('CARD_EDGE'))
        expect(token('di-card-ink')).toBe(constant('CARD_INK'))
    })

    it('and no ink of either is near white, or cold', () => {
        for (const name of ['di-card-ground', 'di-card-ground-2', 'di-card-frame', 'di-card-ink']) {
            const hex = token(name)
            expect(hex, `--${name} is gone from base.css`).toMatch(/^#[0-9a-f]{6}$/)
            const [r, g, b] = CHANNELS(hex)
            expect(Math.min(r, g, b), `--${name} reads as near-white`).toBeLessThan(120)
            expect(r, `--${name} is not warm`).toBeGreaterThanOrEqual(b)
        }
    })
})
