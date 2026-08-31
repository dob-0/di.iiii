import { describe, it, expect } from 'vitest'
import { labelRevealTarget, LABEL_REVEAL_NEAR, LABEL_REVEAL_FAR } from './PortalObject.jsx'

// The entry camera must see a clean room: five wide bilingual nameplates from
// ~16m away were the overlap wall that forced approach-reveal in the first place.
describe('labelRevealTarget', () => {
    it('hides the label at entry-camera distances', () => {
        expect(labelRevealTarget(16)).toBe(0)
        expect(labelRevealTarget(LABEL_REVEAL_FAR)).toBe(0)
    })

    it('fully reveals the label at walking-up distance', () => {
        expect(labelRevealTarget(LABEL_REVEAL_NEAR)).toBe(1)
        expect(labelRevealTarget(1)).toBe(1)
    })

    it('ramps between far and near', () => {
        const mid = (LABEL_REVEAL_NEAR + LABEL_REVEAL_FAR) / 2
        const t = labelRevealTarget(mid)
        expect(t).toBeGreaterThan(0.4)
        expect(t).toBeLessThan(0.6)
    })

    it('hover and editor always reveal', () => {
        expect(labelRevealTarget(50, { hovered: true })).toBe(1)
        expect(labelRevealTarget(50, { inEditor: true })).toBe(1)
    })

    it('treats a missing distance as hidden, not shown', () => {
        expect(labelRevealTarget(undefined)).toBe(0)
        expect(labelRevealTarget(NaN)).toBe(0)
    })
})
