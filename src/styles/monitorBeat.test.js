import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The Monitor's heartbeat mark sits beside the "heard ... ago" label. Its beat once scaled the square to 2x
// in the white text colour, a white box over the label (owner picture 2026-11-16). The beat fades; it never
// scales and never turns white.
const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'preferences.css'), 'utf8')

describe('monitor heartbeat mark', () => {
    it('beats by fading its own colour, no scale, no text colour', () => {
        const body = css.match(/@keyframes monitor-beat\s*\{([\s\S]*?)\n\}/)?.[1] || ''
        expect(body).toMatch(/opacity/)
        expect(body).not.toMatch(/transform|scale|--di-text/)
    })
    it('is off under reduced motion', () => {
        expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.monitor-live-mark\.is-beat[^{]*\{ animation: none/)
    })
})
