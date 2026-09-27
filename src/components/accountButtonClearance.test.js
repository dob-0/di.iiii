import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The floating account button and the room pages leave for it.
 *
 * 2026-09-27: on a phone, the project list's last row (the live-sync row on
 * /<space>/raw/projects) came to rest under the button — measured at the end
 * of the scroll, button 728–758px, row 741–820px. The button's place was a
 * literal in AccountButton.jsx and no page knew it. Now it is stated once in
 * base.css and the list's end clears it.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('the account button and the room left for it', () => {
    it('base.css states where the button is and what clearing it takes', () => {
        const css = read('styles/base.css')
        expect(css).toMatch(/--di-account-btn-bottom:\s*86px;/)
        expect(css).toMatch(/--di-account-btn-size:\s*30px;/)
        expect(css).toMatch(/--di-account-btn-clear:\s*calc\(var\(--di-account-btn-bottom\) \+ var\(--di-account-btn-size\) \+ var\(--di-space-3\)\);/)
    })

    it('the button takes its place and size from those tokens, not from literals', () => {
        const jsx = read('components/AccountButton.jsx')
        expect(jsx).toContain("bottom: 'var(--di-account-btn-bottom)'")
        expect(jsx).not.toMatch(/bottom:\s*'86px'/)
        expect(jsx).not.toMatch(/(width|height):\s*30,/)
    })

    it('the project list ends with room for the button', () => {
        expect(read('studio/components/StudioHub.jsx')).toContain("pb: 'var(--di-account-btn-clear)'")
    })
})
