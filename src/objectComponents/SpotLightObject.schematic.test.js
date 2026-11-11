import { describe, expect, it } from 'vitest'
import { SCHEMATIC_CONE_OPACITY } from './SpotLightObject.jsx'

// Tech (operator mode): one rig draws 50+ flat cones with normal blending; at 0.28 they stacked into one flat colour over the
// whole screen (2026-11-12, drop-magenta). The cap keeps overlaps readable.
describe('the Tech cone', () => {
    it('stays faint enough for stacked cones to read', () => {
        expect(SCHEMATIC_CONE_OPACITY).toBeGreaterThan(0)
        expect(SCHEMATIC_CONE_OPACITY).toBeLessThanOrEqual(0.25)
    })
})
