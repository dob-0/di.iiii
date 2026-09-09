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

describe('the spine', () => {
    it('declares every token the surfaces read', () => {
        const base = read('styles/base.css')
        for (const token of [
            '--di-ink', '--di-dim', '--di-line', '--di-bg',
            '--di-radius', '--di-radius-pill',
            '--di-space-1', '--di-space-2', '--di-space-3', '--di-space-4', '--di-space-5',
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
