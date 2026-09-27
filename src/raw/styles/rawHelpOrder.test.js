import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * A narrow-screen rule only wins if it comes AFTER the base rule it overrides.
 *
 * Found 2026-09-27: the Help dialog's one-column phone rule sat in a
 * `@media (max-width: 900px)` block a thousand lines above the base
 * `.raw-help-body` rule. Same selector, same specificity, so the later base
 * rule won and a 390px phone kept two columns — the diagram and its words
 * squeezed to 34px. Nothing failed; it only showed on a phone.
 *
 * So, for every rule inside a max-width block: each property it sets must not
 * be set again, for the same selector, by a plain rule further down the file.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(HERE, 'raw.css')

const isNarrow = (atRule) => atRule?.type === 'atrule' && atRule.name === 'media' && /max-width/.test(atRule.params)

export const lateBaseOverrides = (css) => {
    const root = postcss.parse(css)
    const base = []      // { selector, prop, line }
    const narrow = []    // { selector, prop, line, media }
    root.walkRules((rule) => {
        const parent = rule.parent
        const inNarrow = isNarrow(parent)
        if (parent.type !== 'root' && !inNarrow) return
        for (const selector of rule.selectors) {
            rule.walkDecls((decl) => {
                const row = { selector: selector.trim(), prop: decl.prop, line: decl.source.start.line }
                if (inNarrow) narrow.push({ ...row, media: parent.params })
                else base.push(row)
            })
        }
    })
    const problems = []
    for (const n of narrow) {
        const later = base.find(b => b.selector === n.selector && b.prop === n.prop && b.line > n.line)
        if (later) problems.push(`${n.selector} { ${n.prop} } at line ${n.line} (${n.media}) is undone by line ${later.line}`)
    }
    return problems
}

describe('raw.css narrow-screen rules', () => {
    it('finds an override that a later base rule undoes', () => {
        const css = '@media (max-width: 900px) { .a { grid-template-columns: 1fr; } }\n.a { grid-template-columns: 1fr 1fr; }'
        expect(lateBaseOverrides(css)).toHaveLength(1)
    })

    it('accepts the override when it comes after the base rule', () => {
        const css = '.a { grid-template-columns: 1fr 1fr; }\n@media (max-width: 900px) { .a { grid-template-columns: 1fr; } }'
        expect(lateBaseOverrides(css)).toEqual([])
    })

    it('no phone rule in raw.css is undone by a base rule further down', () => {
        expect(lateBaseOverrides(fs.readFileSync(FILE, 'utf8'))).toEqual([])
    })
})
