import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Design audit A1 (phone topbar) and C6 (palette never runs off the bottom
// edge) — the executable half of both contracts, read straight off raw.css.
const stylesDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(stylesDir, 'raw.css'), 'utf8')

const block = (selector) => {
    const at = css.indexOf(`\n${selector} {`)
    if (at === -1) return null
    const open = css.indexOf('{', at)
    const close = css.indexOf('}', open)
    return css.slice(open + 1, close)
}

describe('raw node palette never runs off the bottom edge (C6)', () => {
    it('caps its own height and scrolls, rather than trusting only the JS placement guess', () => {
        const rule = block('.raw-node-palette')
        expect(rule, '.raw-node-palette rule not found').toBeTruthy()
        expect(rule).toMatch(/max-height:/)
        expect(rule).toMatch(/display:\s*flex/)
        expect(rule).toMatch(/flex-direction:\s*column/)
    })

    it('lets the input row keep its size and the list give up the rest', () => {
        const list = block('.raw-node-palette-list')
        expect(list, '.raw-node-palette-list rule not found').toBeTruthy()
        expect(list).toMatch(/flex:\s*1/)
        expect(list).toMatch(/overflow-y:\s*auto/)
        expect(list).not.toMatch(/max-height:\s*280px/)
    })
})

describe('raw topbar at phone widths — no horizontal side-scroller (A1)', () => {
    it('no longer turns the seeded topbar into a scroller', () => {
        const phoneBlock = css.slice(css.indexOf('@media (max-width: 640px) {\n    /* below 16px'))
        const seeded = phoneBlock.slice(0, phoneBlock.indexOf('.raw-topbar-breadcrumb'))
        expect(seeded).not.toMatch(/overflow-x:\s*auto/)
    })

    it('drops the breadcrumb crumb chip and hides Help/Chat/node-count/Scene off the bar', () => {
        const phoneBlock = css.slice(css.indexOf('@media (max-width: 640px) {\n    /* below 16px'))
        expect(phoneBlock).toMatch(/\.raw-topbar-breadcrumb\s*{\s*display:\s*none;/)
        expect(phoneBlock).toMatch(/\.raw-topbar-hide-narrow\s*{\s*display:\s*none;/)
    })

    it('keeps ⋯ from ever losing ground to its neighbours', () => {
        const phoneBlock = css.slice(css.indexOf('@media (max-width: 640px) {\n    /* below 16px'))
        expect(phoneBlock).toMatch(/\.raw-topbar-overflow\s*{\s*flex-shrink:\s*0;/)
    })

    it('shows the menu-only Scene/count/Chat/Help entries only at this width', () => {
        expect(css).toMatch(/\.raw-topbar-overflow-narrow-only\s*{\s*display:\s*none;\s*}/)
        const menuBlock = css.slice(css.indexOf('.raw-topbar-overflow-menu {\n        position: fixed;'))
        const at640 = menuBlock.indexOf('.raw-topbar-overflow-narrow-only')
        expect(at640, 'narrow-only display:block override not found inside the 640px menu block').toBeGreaterThan(-1)
    })
})
