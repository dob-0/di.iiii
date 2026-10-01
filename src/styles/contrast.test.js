import { readdirSync, readFileSync } from 'node:fs'
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
        // Since the spine landed (2026-09-10) these values are tokens, not
        // literals — `background: var(--di-scrim)`. The guard has to follow the
        // token into base.css rather than demand a literal here, or "use the
        // token" and "prove it is readable" become opposite instructions.
        const resolve = (value) => {
            let v = value.trim()
            for (let hop = 0; hop < 4 && v.startsWith('var('); hop += 1) {
                const name = v.slice(4, v.indexOf(')')).trim()
                const declared = read('./base.css').match(new RegExp(`${name}:\\s*([^;]+);`))
                expect(declared, `${name} must stay declared in base.css`).toBeTruthy()
                v = declared[1].trim()
            }
            return rgbaValues(v)
        }
        const decl = (body, prop) => {
            const found = body.match(new RegExp(`${prop}:\\s*(rgba\\([^)]*\\)|var\\(--[a-z0-9-]+\\))`))
            expect(found, `${prop} in that rule must stay an rgba or a token that resolves to one`).toBeTruthy()
            return resolve(found[1])
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

// ---------------------------------------------------------------------------
// 2026-10-01, a11y audit F15 / F2 / F7. The guard above covered one token and the
// landing hero. This adds the computed pairs from the static audit
// (WCAG 2.2 AA; luminance as above, alpha composited over the black ground).
// ---------------------------------------------------------------------------
describe('contrast pairs from the 2026-10-01 audit', () => {
    const base = read('./base.css')
    const colour = (value, hops = 0) => {
        const v = value.trim()
        if (v.startsWith('var(') && hops < 5) {
            const name = v.slice(4, v.indexOf(')')).trim()
            const declared = base.match(new RegExp(`${name}:\\s*([^;]+);`))
            expect(declared, `${name} must stay declared in base.css`).toBeTruthy()
            return colour(declared[1], hops + 1)
        }
        if (v.startsWith('#')) {
            const h = v.slice(1)
            return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
        }
        return rgbaValues(v)
    }
    const tokenOnBlack = (name) => {
        const c = colour(`var(${name})`)
        return ratio(over(c, BLACK), BLACK)
    }

    it('--di-text-muted is 5.28:1, the value the audit measured', () => {
        expect(tokenOnBlack('--di-text-muted')).toBeCloseTo(5.28, 1)
    })

    it('the accent, danger and plain white text pairs stay AA', () => {
        expect(ratio(CYAN, BLACK)).toBeGreaterThanOrEqual(AA_BODY)
        expect(tokenOnBlack('--di-danger')).toBeGreaterThanOrEqual(AA_BODY)
        expect(ratio(WHITE, BLACK)).toBeGreaterThanOrEqual(AA_BODY)
    })

    // F7: text set in white at .4 / .45 alpha (3.66 / 4.41) was moved to
    // var(--di-text-muted). This ratchet keeps new ones out of CSS `color:`.
    // Borders, backgrounds and --di-faint (used for ids) are not text colour here.
    // The works are artworks and are not swept (docs/ai/golden_rules.md, "Platform and works"):
    // src/algoVrithm/algoVrithm.css keeps its own text colours until its maker decides.
    const ARTWORK_STYLESHEETS = new Set(['../algoVrithm/algoVrithm.css'])
    it('no stylesheet sets `color:` to white at .4 or .45 alpha (F7), artworks excepted', () => {
        const offenders = []
        const walk = (dir) => {
            for (const entry of readdirSync(resolve(HERE, dir), { withFileTypes: true })) {
                const rel = `${dir}/${entry.name}`
                if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(rel) } else if (entry.name.endsWith('.css')) {
                    const text = read(rel)
                    if (!ARTWORK_STYLESHEETS.has(rel) && /(?:^|[\s;{])color:\s*rgba\(255,\s*255,\s*255,\s*0?\.(?:4|45)\)/m.test(text)) offenders.push(rel)
                }
            }
        }
        walk('..')
        expect(offenders).toEqual([])
    })

    // F2: KNOWN failures of WCAG 1.4.11 (3:1 for the edge of a control). Recorded,
    // not accepted: the fix needs the owner's call and a look at the screen. Each
    // entry must keep failing at about the recorded ratio. If one is raised to 3:1
    // this test goes red and the entry must be deleted; if one gets worse it goes
    // red too. Audit id: F2 (docs/ai/sessions/fix-a11y-safe-batch-2026-10-01.md).
    const KNOWN_BORDER_FAILURES = [
        { token: '--ui-border', recorded: 2.14, audit: 'F2' },
        { token: '--di-line', recorded: 1.22, audit: 'F2' }
    ]
    it.each(KNOWN_BORDER_FAILURES)('$token is a recorded border failure ($audit, $recorded:1)', ({ token, recorded }) => {
        const got = tokenOnBlack(token)
        expect(got, `${token} now clears 3:1 — remove it from KNOWN_BORDER_FAILURES`).toBeLessThan(3)
        expect(got, `${token} got worse than the recorded ${recorded}:1`).toBeGreaterThanOrEqual(recorded - 0.05)
        expect(got, `${token} changed from the recorded ${recorded}:1 — update the record`).toBeLessThanOrEqual(recorded + 0.05)
    })

    it('white at .1 alpha as a border is the recorded 1.20:1 failure (F2)', () => {
        expect(ratio(over([255, 255, 255, 0.1], BLACK), BLACK)).toBeCloseTo(1.2, 1)
    })
})
