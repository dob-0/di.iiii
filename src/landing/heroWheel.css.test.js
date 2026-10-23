import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'landing.css'), 'utf8')

describe('landing.css: the room behind the page', () => {
    // Audit 2026-10-21 L6, measured in Chromium at 1440x900: 66 % of the first
    // screen is the background canvas, and a real wheel there (mouse, or a
    // touchpad's two-finger scroll) moved the page 0 px — over the text it moved
    // 360. The canvas sits in a position:fixed layer, so its scroll chain skips
    // .lp-root and ends at the document, which does not scroll; R3F's <Canvas>
    // also sets pointer-events:auto inline, so only !important reaches it.
    it('takes no pointer events while the visitor is not inside the room', () => {
        const at = css.indexOf('.lp-root:not(.lp-root--inside) .lp-hero-bg *')
        expect(at).toBeGreaterThanOrEqual(0)
        const block = css.slice(at, css.indexOf('}', at))
        expect(block).toMatch(/pointer-events:\s*none\s*!important/)
    })
})
