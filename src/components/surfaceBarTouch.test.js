import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * Every place on the bar is a finger-sized target wherever a finger is the
 * pointer. Measured 2026-09-27 before this: 27px tall on a phone, 13px on a
 * tablet (the phone rule was keyed on width, so a tablet never got it).
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

const coarseRules = (css) => {
    const out = {}
    postcss.parse(css).walkAtRules('media', (at) => {
        if (!/pointer:\s*coarse/.test(at.params)) return
        at.walkRules((rule) => {
            for (const sel of rule.selectors) {
                rule.walkDecls((d) => { out[`${sel.trim()}|${d.prop}`] = d.value })
            }
        })
    })
    return out
}

describe('the bar under a finger', () => {
    it('the finger size is one token, 44px', () => {
        expect(read('styles/base.css')).toMatch(/--di-touch-target:\s*44px;/)
    })

    it('home, the place names and every link are a finger tall under (pointer: coarse)', () => {
        const rules = coarseRules(read('components/surfaceBar.css'))
        for (const sel of ['.sbar-home', '.sbar-where', '.sbar-link']) {
            expect(rules[`${sel}|line-height`], sel).toBe('var(--di-touch-target)')
            expect(rules[`${sel}|padding-top`], sel).toBe('0')
        }
    })

    it('the height everything under the bar clears follows the finger size', () => {
        const rules = coarseRules(read('components/surfaceBar.css'))
        expect(rules[':root|--sbar-h']).toBe('calc(var(--di-touch-target) + 1px)')
    })
})
