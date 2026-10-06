import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * The project list's top row wraps: when the name form does not fit beside the
 * title it takes a line of its own. Measured 2026-09-27 before this, at 390px
 * with the form open: "SPACE: MAIN SPACE" squeezed from 127px to 83px (two
 * lines) and the form ran to x=389, the screen's edge.
 */
const CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'studio-hub.css'), 'utf8')

describe('the project list top row', () => {
    it('wraps instead of squeezing the title', () => {
        const decls = {}
        postcss.parse(CSS).walkRules('.sh-top-row', (rule) => {
            if (rule.parent.type !== 'root') return
            rule.walkDecls((d) => { decls[d.prop] = d.value })
        })
        expect(decls['flex-wrap']).toBe('wrap')
        expect(decls['row-gap']).toBe('var(--di-space-2)')
    })
})
