import { describe, expect, it } from 'vitest'
import { STUDIO_GUIDE_SECTIONS, STUDIO_SHORTCUT_SECTIONS } from './studioGuide.js'

// The help must describe what the viewport really does: with the default
// ('studio') preset the middle button DOLLIES (zooms), it never orbits.
describe('studio guide matches the default mouse mapping', () => {
    const allRows = STUDIO_SHORTCUT_SECTIONS.flatMap((group) => group.rows)

    it('no shortcut row claims middle drag orbits', () => {
        expect(allRows.filter(([key, desc]) => /middle/i.test(key) && /orbit/i.test(desc))).toEqual([])
    })

    it('the Move callout does not claim middle-drag orbits', () => {
        const move = STUDIO_GUIDE_SECTIONS.find((s) => s.id === 'move')
        const orbit = move.callouts.find((c) => c.title === 'Orbit')
        expect(orbit.detail).not.toMatch(/middle/i)
    })
})
