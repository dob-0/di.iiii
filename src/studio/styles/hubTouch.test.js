import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * The ✕ that closes the new-project form, and the save/cancel beside a name
 * field, are finger-sized wherever a finger is the pointer. Measured
 * 2026-09-28 before this: the ✕ was 24x21 on a 390px phone.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const coarseRules = (file) => {
    const out = {}
    postcss.parse(fs.readFileSync(path.join(HERE, file), 'utf8')).walkAtRules('media', (at) => {
        if (!/pointer:\s*coarse/.test(at.params)) return
        at.walkRules((rule) => {
            for (const sel of rule.selectors) rule.walkDecls((d) => { out[`${sel.trim()}|${d.prop}`] = d.value })
        })
    })
    return out
}

describe('the hub\'s small buttons under a finger', () => {
    it.each([
        ['studio-hub.css', '.sh-btn-cancel'],
        ['studio-hub.css', '.sh-rename-save'],
        ['studio-hub.css', '.sh-rename-cancel'],
        ['studio-space-hub.css', '.ssh-btn-cancel']
    ])('%s %s is at least a finger wide and tall', (file, sel) => {
        const rules = coarseRules(file)
        expect(rules[`${sel}|min-width`]).toBe('var(--di-touch-target)')
        expect(rules[`${sel}|min-height`]).toBe('var(--di-touch-target)')
    })
})
