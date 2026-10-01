// @vitest-environment node
// Golden rule "Controls are rectangles" (docs/ai/golden_rules.md): on the rig line no
// control, and no bar or panel that holds controls, is a pill, a circle or a rounded card.
// This scans the swept files' source text. It does not see a screen.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const MAX_PX = 2

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(css|jsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
})

const SWEPT = [
    ...walk(join(ROOT, 'src/rigbuild')),
    join(ROOT, 'src/project/components/ProjectSwitcher.jsx'),
    join(ROOT, 'src/project/components/publicViewerStyles.js'),
    join(ROOT, 'src/project/viewport/smartView/SmartViewBar.jsx'),
    join(ROOT, 'src/studio/components/StudioViewport.jsx')
].filter((p) => { try { readFileSync(p); return true } catch { return false } })

// A round mark that is not a control. Keyed by file + a snippet of the line.
export const ALLOW = [
    // (2026-10-01) the show chip's recording light was allowed round here; the owner's rule is rectangles
    // only, no circles anywhere (memory feedback_no_round_ui) — it is square now and no longer excepted.
]

// The value ends at ; } newline — or a comma: a border-radius never holds one, and in an inline
// style object the next property follows a comma on the same line.
const RADIUS = /(?:border-radius|borderRadius)\s*:\s*([^;},\n]+)/g

export const offences = (file, text) => {
    const found = []
    text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(RADIUS)) {
            const value = m[1].replace(/[,'"`]+\s*$/, '').replace(/^['"`]/, '').trim()
            const parts = value.split(/[\s/]+/).filter(Boolean)
            const ok = value === 'var(--di-radius)' || parts.every((p) => /^0(px)?$/.test(p) || (/^\d+(\.\d+)?px$/.test(p) && parseFloat(p) <= MAX_PX) || /^[0-2]$/.test(p))
            if (ok) continue
            if (ALLOW.some((a) => a.file === file && line.includes(a.snippet))) continue
            found.push(`${file}:${i + 1} border-radius ${value}`)
        }
    })
    return found
}

describe('controls are rectangles — the rig line', () => {
    it('scans the rig files (a guard over nothing is decoration)', () => {
        expect(SWEPT.length).toBeGreaterThan(5)
        expect(SWEPT.some((p) => p.endsWith('build.css'))).toBe(true)
    })

    it('has no pill, circle or radius above 2 px, outside the allow-list', () => {
        const all = SWEPT.flatMap((p) => offences(relative(ROOT, p).split(sep).join('/'), readFileSync(p, 'utf8')))
        expect(all).toEqual([])
    })

    it('catches what it is for', () => {
        expect(offences('x.css', 'a { border-radius: 999px; }')).toHaveLength(1)
        expect(offences('x.css', 'a { border-radius: var(--di-radius-pill, 999px); }')).toHaveLength(1)
        expect(offences('x.css', 'a { border-radius: 50%; }')).toHaveLength(1)
        expect(offences('x.jsx', "s = { borderRadius: '18px' }")).toHaveLength(1)
        expect(offences('x.css', 'a { border-radius: 2px; } b { border-radius: 0; }')).toEqual([])
    })

    it('every allow-list entry still matches a line and gives a reason', () => {
        for (const a of ALLOW) {
            expect(a.why.length).toBeGreaterThan(10)
            expect(readFileSync(join(ROOT, a.file), 'utf8')).toContain(a.snippet)
        }
    })
})
