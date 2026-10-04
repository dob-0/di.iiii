import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getWorkspaceTopInset } from './utils/windowLayout.js'

// The Nodes chrome contract (audit 2026-10-05, rows 5-6), measured on the
// stylesheet that carries it: jsdom does no layout, so what is checked is the
// declared value every cell and bar reads.
const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'styles/rawChrome.css'), 'utf8')
const token = (name, source = css) => {
    const match = source.match(new RegExp(`${name}:\\s*([^;]+);`))
    return match ? match[1].trim() : null
}

describe('one bar (row 5)', () => {
    it('is 40px, and the canvas starts at its bottom edge', () => {
        expect(token('--raw-bar-h')).toBe('40px')
        expect(css).toMatch(/\.raw-editor-shell > \.sbar \{[^}]*height: var\(--raw-bar-h\)/)
        // The workspace inset under the bar is the bar's bottom: 40, no padding.
        expect(getWorkspaceTopInset({ topbarRect: { bottom: 40 }, padding: 0 })).toBe(40)
    })

    it('has one cell height: 28 on a mouse, 44 on a finger, and no cell sets its own', () => {
        expect(token('--raw-cell')).toBe('28px')
        expect(css).toMatch(/@media \(pointer: coarse\) \{\s*:root \{ --raw-cell: 44px; \}/)
        const rule = css.match(/\.raw-editor-shell button\.raw-cell \{([^}]*)\}/)[1]
        expect(rule).toMatch(/height: var\(--raw-cell\)/)
        expect(rule).not.toMatch(/min-height/)
    })

    it('squares the account cell: radius 0, the same cell size', () => {
        expect(token('--raw-radius')).toBe('0')
        expect(css).toMatch(/\.raw-bar-account \{[^}]*width: var\(--raw-cell\)[^}]*height: var\(--raw-cell\)/s)
    })
})
