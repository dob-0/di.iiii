import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(resolve(HERE, rel), 'utf8')

// WCAG 2.1 relative luminance, then the contrast ratio against the theme's own
// ground. Written out rather than pulled from a library so the guard has no
// dependency that could quietly change what "readable" means.
const channel = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const over = ([r, g, b, a = 1], bg) => [r, g, b].map((c, i) => c * a + bg[i] * (1 - a))
const ratio = (fg, bg) => {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
const rgbaValues = (declaration) => (declaration.match(/[\d.]+/g) || []).map(Number)

const BLACK = [0, 0, 0]
const WHITE = [255, 255, 255]
const CYAN = [77, 249, 255]
const AA_BODY = 4.5

// The hero does not stand on the theme's black any more. Since the landing was
// put inside the `main` room (2026-09-01) the copy is written across the room's
// composed entry shot, and the brightest thing it crosses is a door ring —
// sampled off a real 1440x900 screenshot of the resting page with the copy
// hidden, at the pixels the tagline occupies. Everything above is measured
// against the ground the page declares; this is measured against the ground the
// visitor actually gets.
const HERO_ROOM_PEAK = [144, 153, 153]

describe('dark theme text contrast', () => {
    // 2026-08-23: --di-text-muted was rgba(255,255,255,0.4) = 3.66:1. That is
    // below the floor for body text, and it was carrying 54 text nodes on the
    // landing page and 6 more on /spaces — every one of them secondary copy
    // doing real explaining. One token, sixty failures; hence one guard here
    // rather than sixty assertions at the call sites.
    it('--di-text-muted clears AA for body text on the black ground', () => {
        const base = read('./base.css')
        const declared = base.match(/--di-text-muted:\s*([^;]+);/)
        expect(declared, '--di-text-muted must stay defined in base.css').toBeTruthy()
        expect(ratio(over(rgbaValues(declared[1]), BLACK), BLACK)).toBeGreaterThanOrEqual(AA_BODY)
    })

    // Everything above measures against the black ground, which is the right
    // question for the page's own copy. The hero is the exception: its buttons
    // float over a live WebGL room, and the walkable slab in it is nearly
    // white. `.landing-cta-ghost` was muted white on `transparent` — 8.6:1 on
    // black, and grey-on-grey the moment the slab drifted behind it. So the
    // hero row's routes are measured against the worst ground they can land
    // on, not the best one.
    it('the hero routes stay readable over the brightest thing the room can put behind them', () => {
        const css = read('../landing/landing.css')
        const rule = (selector) => {
            const found = css.match(new RegExp(`${selector.replace(/[.\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
            expect(found, `${selector} must stay in landing.css`).toBeTruthy()
            return found[1]
        }
        const decl = (body, prop) => {
            const found = body.match(new RegExp(`${prop}:\\s*(rgba\\([^)]*\\))`))
            expect(found, `${prop} in that rule must stay an explicit rgba`).toBeTruthy()
            return rgbaValues(found[1])
        }

        const ghost = rule('.lp-hero-cta-row .landing-cta-ghost')
        const scrim = over(decl(ghost, 'background'), WHITE)
        expect(ratio(over(decl(ghost, 'color'), scrim), scrim)).toBeGreaterThanOrEqual(AA_BODY)

        // The Spaces route takes its label from --di-cyan, so it needs the same
        // scrim under it or the accent washes out against the slab too.
        const spaces = rule('.lp-hero-cta-row .landing-cta-spaces')
        const spacesGround = over(decl(spaces, 'background-color'), WHITE)
        expect(ratio(CYAN, spacesGround)).toBeGreaterThanOrEqual(AA_BODY)
    })

    // The token only protects what uses it. This caught `.lp-enter-note` at
    // rgba(255,255,255,0.2) — 1.66:1, around a real link — which the token
    // change alone left untouched.
    it('no landing rule sets text to a white too faint to read', () => {
        const offenders = []
        for (const [, decl] of read('../landing/landing.css').matchAll(/(?:^|[\s;{])color:\s*(rgba\(255,\s*255,\s*255[^)]*\))/g)) {
            const value = rgbaValues(decl)
            if (ratio(over(value, BLACK), BLACK) < AA_BODY) offenders.push(decl)
        }
        expect(offenders).toEqual([])
    })
})

// 2026-09-01. The guard above asks "is this white bright enough for black?" —
// and for the hero the answer stopped mattering the day the page was moved
// inside the room. `.lp-hero::after` was a flat 0.34 scrim tuned against a dark
// tilted backdrop; over the bright composed entry shot the tagline measured
// 5.1:1 on the average backdrop and about 1.3:1 where a door ring passed behind
// it. Nothing failed. A screenshot and a person's eyes were the only things
// that could tell.
//
// So the scrim is a number the stylesheet declares (`--lp-hero-veil` over the
// reading column, `--lp-hero-wash` through the middle band) and this composites
// the two, puts the result over the measured ring, and asks the same AA
// question of the copy that sits there. Weaken the veil or dim the copy and
// this goes red — watched failing at veil 0.34, which is what shipped.
describe('the hero copy, over the room it now stands in', () => {
    const landing = read('../landing/landing.css')
    const token = (name) => {
        const found = landing.match(new RegExp(`${name}:\\s*([\\d.]+)\\s*;`))
        expect(found, `${name} must stay declared in landing.css`).toBeTruthy()
        return Number(found[1])
    }
    const rule = (selector) => {
        const block = landing.match(new RegExp(`\\n${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
        expect(block, `${selector} must stay in landing.css`).toBeTruthy()
        return block[1]
    }
    const textColour = (selector) => {
        const decl = rule(selector).match(/color:\s*(rgba?\([^)]*\))/)
        expect(decl, `${selector} must declare an rgba colour`).toBeTruthy()
        return rgbaValues(decl[1])
    }

    // Two black layers, so they multiply rather than add.
    const scrimmed = () => {
        const veil = token('--lp-hero-veil')
        const wash = token('--lp-hero-wash')
        const remaining = (1 - veil) * (1 - wash)
        return HERO_ROOM_PEAK.map((c) => c * remaining)
    }

    it.each([
        ['.lp-tagline', 'the two lines that are the whole pitch'],
        ['.lp-cta-sub', 'the line carrying the second destination']
    ])('%s clears AA over the brightest thing behind it — %s', (selector) => {
        const ground = scrimmed()
        expect(ratio(over(textColour(selector), ground), ground)).toBeGreaterThanOrEqual(AA_BODY)
    })
})
