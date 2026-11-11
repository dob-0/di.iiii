// @vitest-environment node
// The Platina patch rebuilt from the rental list (2026-11-11), FULL modes: counts, universes, no lamp over 512.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../place/common.mjs'
import { loadLibrary } from './library.mjs'
import { renderMarkdown, tableModel } from './patch-table.mjs'

const file = 'scripts/place/rigs/platina-2026-11-11.patch.json'
const plan = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))
const library = loadLibrary()

describe('the Platina patch of the rental list, full modes (2026-11-11)', () => {
    const m = tableModel({ plan, library, planFile: file })
    it('has the list counts on 10 universes, nothing over 512, the XP-16R alone in the last one', () => {
        expect(m.rows).toHaveLength(56)
        expect(m.universes.map((u) => u.universe)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        expect(m.universes.every((u) => u.used <= 512)).toBe(true)
        const n = (code) => m.rows.filter((r) => r.code === code).length
        expect([n('A.leda B-EYE K10'), n('HY B-EYE K15'), n('Pixel Line IP'), n('Magma Prime')]).toEqual([8, 8, 24, 2])
        expect(m.rows.filter((r) => /XP-16R/.test(r.code))).toHaveLength(12)
        expect(m.rows.filter((r) => r.universe === 10).every((r) => /XP-16R/.test(r.code))).toBe(true)
    })
    it('puts each lamp in its largest sourced mode and says PROPOSED / ASSUMED, in both languages', () => {
        const fp = (code) => [...new Set(m.rows.filter((r) => r.code === code).map((r) => r.footprint))]
        expect([fp('A.leda B-EYE K10'), fp('HY B-EYE K15'), fp('Pixel Line IP'), fp('Magma Prime')]).toEqual([[76], [76], [117], [5]])
        expect(renderMarkdown(m)).toContain('PROPOSED')
        expect(renderMarkdown(tableModel({ plan, library, planFile: file, lang: 'ru' }))).toContain('ЧЕРНОВИК')
    })
})
