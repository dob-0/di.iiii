// @vitest-environment node
// The phone's Undo and Redo are for a finger of 74: 44 px, not the bar's 31 (UX audit S03 review).
// Reads the stylesheet text; the picture at phone width is the look.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

describe('phone Undo and Redo tap size', () => {
    it('are at least 44 px tall and wide', () => {
        const css = readFileSync(fileURLToPath(new URL('./studio-mobile.css', import.meta.url)), 'utf8')
        const rule = css.match(/\.smb-undo-redo \.smb-top-btn\s*\{([^}]*)\}/)
        expect(rule, 'rule for .smb-undo-redo .smb-top-btn').toBeTruthy()
        expect(rule[1]).toMatch(/min-height:\s*44px/)
        expect(rule[1]).toMatch(/min-width:\s*44px/)
    })

    it('sit on a row of their own, so the phone bar is at most one row taller in every save state', () => {
        const css = readFileSync(fileURLToPath(new URL('./studio-mobile.css', import.meta.url)), 'utf8')
        const rule = css.match(/\.smb-status-row\s*\{([^}]*)\}/)
        expect(rule, 'rule for .smb-status-row').toBeTruthy()
        expect(rule[1]).toMatch(/flex:\s*1 0 100%/)
    })

    it('let a touch through the empty part of their row to the scene, as the rest of the bar does', () => {
        const css = readFileSync(fileURLToPath(new URL('./studio-mobile.css', import.meta.url)), 'utf8')
        const row = css.match(/\.smb-topbar > \.smb-status-row\s*\{([^}]*)\}/)
        expect(row, 'rule for .smb-topbar > .smb-status-row').toBeTruthy()
        expect(row[1]).toMatch(/pointer-events:\s*none/)
        const kids = css.match(/\.smb-status-row > \*\s*\{([^}]*)\}/)
        expect(kids, 'rule for .smb-status-row > *').toBeTruthy()
        expect(kids[1]).toMatch(/pointer-events:\s*auto/)
    })
})
