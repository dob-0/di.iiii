import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'landing.css'), 'utf8')

describe('landing.css: the room behind the page', () => {
    // Audit 2026-10-21 L6: before the visitor is inside, a wheel over the fixed
    // background canvas moved the page 0 px. The cause was one component (R3F's
    // inline pointer-events:auto on LiveProjectScene's <Canvas>), so it is fixed
    // there and guarded in components/liveProjectSceneSeams.test.js. This file
    // only keeps the stylesheet from growing the workaround back.
    it('does not patch the canvas with an !important rule', () => {
        expect(css).not.toMatch(/\.lp-hero-bg[^{]*\{[^}]*pointer-events:\s*none\s*!important/)
    })
})
