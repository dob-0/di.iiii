import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression guards for the admin desk stylesheet (known-fixes: desk home stacking, 44 px touch controls).
const css = readFileSync(resolve(import.meta.dirname, '../../styles/adminDesk.css'), 'utf8')
const block = (query) => {
    const at = css.indexOf(`@media ${query} {`)
    if (at < 0) return ''
    let depth = 0
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
        if (css[i] === '{') depth += 1
        if (css[i] === '}') { depth -= 1; if (!depth) return css.slice(at, i + 1) }
    }
    return ''
}

describe('admin desk stylesheet', () => {
    it('stacks the home under 900 px, so tiles never cover the group titles', () => {
        expect(block('(max-width: 899px)')).toMatch(/\.admin-home\.has-monitor\s*{\s*display:\s*flex/)
    })
    it('gives every desk control 44 px on a coarse pointer at any width', () => {
        const touch = block('(pointer: coarse)')
        expect(touch).toMatch(/\.admin-bar-button[^{]*{[^}]*min-height:\s*44px/)
        expect(touch).toMatch(/\.raw-window-header\s*{[^}]*min-height:\s*44px/)
    })
})
