import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * The loading strip on a phone (iPhone SE, 320 px, 2026-10-20): it ran the full width and covered the "Low" and "Move" buttons.
 * On a narrow screen it must keep to the left of the view-button column: capped width, no centring transform.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const narrow = () => {
    const out = {}
    postcss.parse(fs.readFileSync(path.join(HERE, 'model-loading.css'), 'utf8')).walkAtRules('media', (at) => {
        if (!/max-width:\s*480px/.test(at.params)) return
        at.walkRules((rule) => {
            for (const sel of rule.selectors) rule.walkDecls((d) => { out[`${sel.trim()}|${d.prop}`] = d.value })
        })
    })
    return out
}

describe('the loading strip on a narrow screen', () => {
    it('stays left of the view buttons', () => {
        const r = narrow()
        expect(r['.model-loading|max-width']).toBe('calc(100vw - 144px)')
        expect(r['.model-loading|transform']).toBe('none')
        expect(r['.model-loading|left']).toBe('var(--di-space-3)')
    })
    it('drops the dots and lays the track on its edge so the label fits', () => {
        const r = narrow()
        expect(r['.model-loading-dots|display']).toBe('none')
        expect(r['.model-loading-track|position']).toBe('absolute')
    })
})
