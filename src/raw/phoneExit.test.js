import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, it, expect } from 'vitest'

// The bare Raw canvas on a phone had NO way out (doors audit, 2026-08-21):
// the wordmark was display:none under 640px and zen hides the toolbar. It was
// moved to the top-left corner in fe00ef62. This pins the properties that make
// it an exit a finger can use, so it cannot quietly go away again.
const css = readFileSync(path.resolve(process.cwd(), 'src/raw/styles/raw.css'), 'utf8')
const phoneBlock = css.split('/* Phone. At the bottom centre it sat')[1]?.split('.raw-surface-wordmark.is-under-sbar')[0] || ''

describe('phone exit on the bare canvas', () => {
    it('keeps the wordmark visible, at least 44px tall, a rectangle', () => {
        expect(phoneBlock).toContain('@media (max-width: 640px)')
        expect(phoneBlock).toMatch(/display:\s*inline-flex/)
        expect(phoneBlock).toMatch(/min-height:\s*44px/)
        expect(phoneBlock).toMatch(/border-radius:\s*var\(--di-radius\)/)
        expect(phoneBlock).not.toMatch(/display:\s*none/)
    })
})
