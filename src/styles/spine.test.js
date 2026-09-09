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
]

// Not yet converted, and honest about it. Each line is a debt, not an exemption:
// raw.css alone carries eight different corner radiuses.
const NOT_YET = [
    'raw/styles/raw.css',
    'studio/styles/studio.css',
    'studio/styles/studio-hub.css',
    'wiki/wiki.css',
    'landing/landing.css',
]

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
        const fonts = linesOf(read(rel), /font-family\s*:(?!\s*(var\(--di-(sans|mono)\)|inherit)\s*;)/)
            .concat(linesOf(read(rel), /font\s*:[^;]*(?:'[^']+'|"[^"]+")/))
        expect(fonts, `two families exist: var(--di-sans) and var(--di-mono):\n${fonts.join('\n')}`).toEqual([])
    })

    it.each(SPINE_FILES)('%s rounds its corners the two ways the platform has', (rel) => {
        const bad = []
        withoutComments(read(rel)).split('\n').forEach((line, i) => {
            const m = line.match(/border-radius\s*:\s*([^;]+);/)
            if (!m) return
            const value = m[1].trim()
            if (!value.split(/\s+/).every(part => ALLOWED_RADII.has(part))) bad.push(`${i + 1}: ${line.trim()}`)
        })
        expect(bad, `0, 50%, var(--di-radius) or var(--di-radius-pill):\n${bad.join('\n')}`).toEqual([])
    })

    it.each(SPINE_FILES)('%s reads no token with a hardcoded fallback', (rel) => {
        const fallbacks = linesOf(read(rel), /var\(\s*--[a-z0-9-]+\s*,/i)
        expect(fallbacks, `a fallback is a second palette nobody chose:\n${fallbacks.join('\n')}`).toEqual([])
    })

    it('keeps an honest list of what is not converted yet', () => {
        for (const rel of NOT_YET) {
            expect(fs.existsSync(path.join(SRC, rel)), `${rel} is listed as unconverted but does not exist`).toBe(true)
            expect(SPINE_FILES).not.toContain(rel)
        }
    })
})
