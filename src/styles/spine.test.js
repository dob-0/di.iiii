import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The spine, enforced.
 *
 * Owner, 2026-09-09: "make unique our style and never do nothing out of it."
 * A written style guide is a wish; this is the part that holds. Every file
 * listed below is checked on every run: no colour literals, no font literals,
 * no corner radius outside the two the platform has, and no token read with a
 * hardcoded fallback — that last one is how a whole second palette
 * (--di-dim/--di-line/--di-ink/--di-bg, referenced everywhere, declared
 * nowhere) came to exist without anyone choosing it.
 *
 * SPINE_FILES grows. A stylesheet joins the list the day it is converted, and
 * never leaves. Adding a file and then adding an exception for it defeats the
 * point: convert it, or leave it off the list and say so out loud.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..')

const SPINE_FILES = [
    'studio/styles/studio-space-hub.css',
    'studio/styles/space-constellation.css',
    'tools/toolsRoom.css',
    'components/surfaceBar.css',
    'wiki/wiki.css',
    'studio/styles/studio-hub.css',
    'landing/landing.css',
    'studio/styles/studio.css',
    // Already clean when the list was widened on 2026-09-10 — by luck, not by
    // rule, which is exactly why they are listed: from here they stay clean.
    'style.css',
    'styles/panels/world.css',
    'styles/panels/view.css',
    'styles/panels/media.css',
    'styles/panels/inspector.css',
    'components/loadingScreen.css',
    'studio/components/studioCodeSpaceDirector.css',
    'pages/legal.css',
    'styles/inspector/inputs.css',
    'project/components/roomTextLayer.css',
    'components/madeWithBadge.css',
    'styles/panels/outliner.css',
    'components/modeMark.css',
    'map/mapSurface.css',
    'styles/panels/base.css',
    'styles/preferences.css',
    'styles/controls.css',
    'styles/inspector/misc.css',
    'styles/inspector-controls.css',
    'styles/inspector/vector.css',
    'styles/inspector/overlays.css',
    'styles/inspector/media.css',
    'styles/panels/asset.css',
    'styles/panels/spaces.css',
    'styles/menu.css',
    'styles/mobile-shell.css',
    'studio/styles/studio-mobile.css',
    'studio/styles/studio-coach.css',
    'ViewPanel.css',
    'landing/localHome.css',
    'components/webglContextGuard.css',
    'components/authReturnNotice.css',
    'styles/workspace.css',
    'project/components/jamSurface.css',
    'studio/styles/studio-help.css',
    'raw/director/director.css',
    'components/liveProjectScene.css',
    'components/confirmDeleteDialog.css',
    'raw/styles/raw.css',
    'pages/spaceContents.css',
]

// Not yet converted, and honest about it. Each line is a debt, not an
// exemption. The list was five names until 2026-09-10, which flattered the
// truth: there are 56 stylesheets in src/, and this is every platform one that
// still carries a colour literal, a stray typeface, an off-spine corner or a
// token read with a fallback. The number after each is the count of violations
// measured the day it was listed — a debt you can see the size of.
//
// The two WORKS — src/algoVrithm/ and src/wccSite/ — are deliberately absent.
// They are artworks with their own identity, grandfathered by
// src/works/boundary.test.js; the platform's spine is not theirs to carry.
// src/styles/base.css is absent too: it is where the literals are SUPPOSED to
// live.

// Off the spine on purpose, not by neglect. A surface that is deliberately NOT
// the platform's dark chrome is a decision somebody made, and it has to be
// written down here or the next pass will "fix" it back.
//
//   PresentationCanvas.css — the presented page is PAPER. Cream ground
//   (#f4efe3 → #e9dfca), brown ink, soft shadow: it is what a slide looks like
//   when it is projected in a room, and the dark chrome around it is the frame,
//   not the picture. Converting it to --di-bg/--di-ink would give a black page.
//   The chrome parts of that file — the toolbar, the badge — are fair game and
//   were converted; the page itself is not.
//
//   makeSurface.css — the toybox is PAPER too, and bilingual. Its own header
//   says it: "Raw is cyan on near-black. This is paper." Warm ground, ink-dark
//   text, soft 16–26px corners, made for a child on a phone in Dilijan in
//   August; line 578 of that file records the device test where --di-cyan on a
//   cream sheet meant a child could not see there was a second room to tap.
//   And its type stack fronts a self-hosted 'Noto Sans Armenian' — --di-sans
//   carries no Armenian glyphs at all, so forcing rule 3 here would drop every
//   Armenian word to whatever the phone happens to have. It joins the spine
//   the day base.css grows a light half (paper/card/ink/ink-soft) and either an
//   Armenian face inside --di-sans or a sanctioned --di-sans-hy. Both are the
//   owner's call, not a stylesheet's.
//
//   serverXR/src/lighting/ui/ — the lighting desk keeps its own dense booth
//   skin (see its style.css). Not in src/ at all, listed here for the record.
const BY_DESIGN = [
    'PresentationCanvas.css',
    'make/makeSurface.css',
]

// Empty, and that is the point: on 2026-09-10 every platform stylesheet in
// src/ carries the spine. A file added here is a debt with a name and a
// number, not a quiet exception — the two real exceptions live in BY_DESIGN
// above, with the reason written out.
const NOT_YET = []

const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

// Strip comments before matching: a comment explaining why #4fd6ff was deleted
// must not read as #4fd6ff still being there.
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const linesOf = (css, re) => {
    const out = []
    withoutComments(css).split('\n').forEach((line, i) => {
        const m = line.match(re)
        if (m) out.push(`${i + 1}: ${line.trim()}`)
    })
    return out
}

const ALLOWED_RADII = new Set(['0', '0px', '50%', 'inherit', 'unset', 'var(--di-radius)', 'var(--di-radius-pill)'])

/* ── Rhythm: spacing and type size, enforced the same way (2026-09-10) ──────
 *
 * Measured before it was enforced: 1,592 hand-written padding/margin/gap
 * literals and 647 hand-written font-sizes across these same files, against
 * 20 uses of the old --di-space-1..5 (6/12/22/44/76 — invented, never
 * measured) and 7 uses of --di-text-label (the only one of four declared
 * type tokens anyone actually read). The ladders in base.css are the real
 * distribution's own clusters, snapped so nothing moves by more than 2px
 * (spacing) or 1px (type) — see PROGRESS.md (2026-09-10) for the
 * full derivation and mapping table.
 *
 * 1,559 spacing literals and 614 font-sizes convert to the ladder here. What
 * doesn't is named below, the same way BY_DESIGN names a deliberate colour
 * exception: a negative trim, a fluid clamp()'s own endpoints, a section
 * break a beat larger than the ladder's own top rung, a hairline subtracted
 * from a token, a large display/icon size the small-UI ladder was never
 * meant to reach, or raw.css's --card-scale miniature (multiplying an
 * already-snapped literal would multiply its drift too, so the whole cluster
 * stays literal rather than half-converted).
 */
const RHYTHM_FILES = SPINE_FILES
    .filter((f) => f !== 'wiki/wiki.css' && f !== 'studio/styles/studio-space-hub.css')
    .concat(BY_DESIGN)

const SPACING_PROP_SRC = '(?:padding|margin)(?:-(?:top|right|bottom|left|inline(?:-(?:start|end))?|block(?:-(?:start|end))?))?|(?:row-|column-)?gap'
const FONT_PROP_SRC = 'font-size'

const SPACE_EXCEPTIONS = {
    'components/loadingScreen.css': ['-1px'],
    'components/liveProjectScene.css': ['18px', '48px'],
    'landing/landing.css': ['96px', '56px', '120px', '64px'],
    'pages/legal.css': ['64px'],
    'project/components/jamSurface.css': ['0.6rem'],
    'project/components/roomTextLayer.css': ['-1px'],
    'raw/director/director.css': ['-4px', '-2px'],
    'raw/styles/raw.css': ['-4px', '-1px', '5px', '16px', '14px', '6px', '12px'],
    'studio/components/studioCodeSpaceDirector.css': ['1rem', '2rem', '1.4rem', '3rem'],
    'studio/styles/studio-hub.css': ['56px'],
    'styles/inspector-controls.css': ['1px'],
    'styles/menu.css': ['-2px'],
}

const FONT_EXCEPTIONS = {
    'landing/landing.css': ['1.8rem', '2.6rem', '5rem', '10rem', '0.95rem', '1.1rem'],
    'make/makeSurface.css': ['30px', '34px', '40px', '16px', '27px', '26px'],
    'pages/legal.css': ['1.7rem', '2.4rem', '0.85em'],
    'PresentationCanvas.css': ['26px', '42px'],
    'project/components/jamSurface.css': ['2rem'],
    'raw/styles/raw.css': ['24px', '13px', '10px', '11px', '30px', '16px'],
    'studio/styles/space-constellation.css': ['0.92em'],
    'studio/styles/studio-hub.css': ['1.4rem', '2rem'],
    'styles/preferences.css': ['1.1rem', '1.4rem', '1rem', '1.25rem'],
}

const NUM_LITERAL_RE = /-?\d*\.?\d+(?:px|rem|em)\b/g
const isZero = (lit) => /^-?0(?:\.0+)?(?:px|rem|em)?$/.test(lit)

// Same idea as withoutComments, but blanks in place (comment characters
// become spaces, not nothing) so byte offsets — and therefore line numbers —
// still line up with the original file.
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))

// A literal number in a padding/margin/gap/font-size value is fine only if it
// is 0, or named above for this file. Anything else should be a rhythm
// token, auto, a percentage, or a calc()/clamp() built from tokens — this
// also catches a literal hiding inside calc()/clamp(), which a token check
// alone would miss.
const badLiterals = (raw, propSrc, exceptions) => {
    const blanked = blankComments(raw)
    const re = new RegExp(`(?:^|[{;\\s])(?:${propSrc})\\s*:\\s*([^;{}]+);`, 'g')
    const bad = []
    let m
    while ((m = re.exec(blanked))) {
        const literals = m[1].match(NUM_LITERAL_RE) || []
        const offenders = literals.filter((lit) => !isZero(lit) && !exceptions.includes(lit))
        if (offenders.length) {
            const lineNo = blanked.slice(0, m.index).split('\n').length
            bad.push(`${lineNo}: ${raw.split('\n')[lineNo - 1].trim()}`)
        }
    }
    return bad
}

describe('the spine', () => {
    it('declares every token the surfaces read', () => {
        const base = read('styles/base.css')
        for (const token of [
            '--di-ink', '--di-dim', '--di-line', '--di-bg',
            '--di-radius', '--di-radius-pill',
            '--di-space-1', '--di-space-2', '--di-space-3', '--di-space-4',
            '--di-space-5', '--di-space-6', '--di-space-7', '--di-space-8',
            '--di-space-section-break',
            '--di-text-1', '--di-text-2', '--di-text-3', '--di-text-4',
            '--di-text-5', '--di-text-6', '--di-text-7',
        ]) {
            expect(base, `${token} is used by the surfaces and must be declared here`).toContain(`${token}:`)
        }
    })

    it.each(SPINE_FILES)('%s carries no colour literal', (rel) => {
        const hex = linesOf(read(rel), /#[0-9a-fA-F]{3,8}\b/)
        expect(hex, `hex colours belong in base.css only:\n${hex.join('\n')}`).toEqual([])
        // Neutral tints (white/black) are fine — they are shading, not identity.
        // A branded colour written out by hand is not.
        const branded = linesOf(read(rel), /rgba?\(\s*(?!255\s*,\s*255\s*,\s*255)(?!0\s*,\s*0\s*,\s*0)\d+\s*,/)
        expect(branded, `use a token, not the colour's numbers:\n${branded.join('\n')}`).toEqual([])
    })

    it.each(SPINE_FILES)('%s names no typeface of its own', (rel) => {
        // `!important` is tolerated here and in the radius check below: these
        // declarations exist to beat MUI's injected MuiButtonBase styles, and a
        // value that is already exactly what the spine wants must not be flagged
        // for carrying the flag that makes it win.
        const fonts = linesOf(read(rel), /font-family\s*:(?!\s*(var\(--di-(sans|mono)\)|inherit)\s*(!important\s*)?;)/)
            .concat(linesOf(read(rel), /font\s*:[^;]*(?:'[^']+'|"[^"]+")/))
        expect(fonts, `two families exist: var(--di-sans) and var(--di-mono):\n${fonts.join('\n')}`).toEqual([])
    })

    it.each(SPINE_FILES)('%s rounds its corners the two ways the platform has', (rel) => {
        const bad = []
        withoutComments(read(rel)).split('\n').forEach((line, i) => {
            const m = line.match(/border-radius\s*:\s*([^;]+);/)
            if (!m) return
            const value = m[1].trim()
            const parts = value.split(/\s+/).filter(part => part !== '!important')
            if (!parts.every(part => ALLOWED_RADII.has(part))) bad.push(`${i + 1}: ${line.trim()}`)
        })
        expect(bad, `0, 50%, var(--di-radius) or var(--di-radius-pill):\n${bad.join('\n')}`).toEqual([])
    })

    it.each(SPINE_FILES)('%s reads no token with a hardcoded fallback', (rel) => {
        const fallbacks = linesOf(read(rel), /var\(\s*--[a-z0-9-]+\s*,/i)
        expect(fallbacks, `a fallback is a second palette nobody chose:\n${fallbacks.join('\n')}`).toEqual([])
    })

    it.each(RHYTHM_FILES)('%s keeps its padding, margin and gap on the rhythm ladder', (rel) => {
        const bad = badLiterals(read(rel), SPACING_PROP_SRC, SPACE_EXCEPTIONS[rel] || [])
        expect(bad, `a rhythm token, 0, auto, a percentage, calc() of tokens, or a named exception:\n${bad.join('\n')}`).toEqual([])
    })

    it.each(RHYTHM_FILES)('%s keeps its font-size on the type ladder', (rel) => {
        const bad = badLiterals(read(rel), FONT_PROP_SRC, FONT_EXCEPTIONS[rel] || [])
        expect(bad, `a type token, inherit, clamp() of tokens, or a named exception:\n${bad.join('\n')}`).toEqual([])
    })

    it.each(BY_DESIGN)('%s is a deliberate exception, and still exists', (rel) => {
        expect(fs.existsSync(path.join(SRC, rel))).toBe(true)
        expect(SPINE_FILES).not.toContain(rel)
        expect(NOT_YET).not.toContain(rel)
    })

    it('keeps an honest list of what is not converted yet', () => {
        for (const rel of NOT_YET) {
            expect(fs.existsSync(path.join(SRC, rel)), `${rel} is listed as unconverted but does not exist`).toBe(true)
            expect(SPINE_FILES).not.toContain(rel)
        }
    })
})
