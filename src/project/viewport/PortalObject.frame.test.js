import { describe, it, expect } from 'vitest'
import { PORTAL_FRAME, portalFrameBars, portalFrameOpeningY, portalLabelHeight } from './PortalObject.jsx'
import { PORTAL_ENTER_RADIUS } from '../../components/portalWalkThrough.js'

// The brand rule this style exists for: square corners only, hairline bars,
// flat fills, never a shadow, glow or bevel (di-brand README "Geometry"). A
// ring cannot obey any of it, so the geometry is asserted here rather than
// trusted to a screenshot.
describe('portalFrameBars', () => {
    const bars = portalFrameBars()
    const byKey = Object.fromEntries(bars.map((b) => [b.key, b]))

    it('is four boxes: two jambs, a lintel and a sill', () => {
        expect(bars.map((b) => b.key).sort()).toEqual(['jamb-left', 'jamb-right', 'lintel', 'sill'])
    })

    it('leaves an opening exactly as wide as the ring it replaces', () => {
        // Walking through a frame has to latch where walking through a ring
        // latches; portalWalkThrough assumes one radius for both.
        expect(byKey['jamb-left'].position[0]).toBe(-(PORTAL_FRAME.halfWidth + PORTAL_FRAME.bar / 2))
        expect(byKey['jamb-right'].position[0]).toBe(PORTAL_FRAME.halfWidth + PORTAL_FRAME.bar / 2)
        const outerEdge = PORTAL_FRAME.halfWidth + PORTAL_FRAME.bar
        expect(outerEdge).toBeLessThan(PORTAL_ENTER_RADIUS)
    })

    // A room whose floor is at y = 0 would swallow a sill centred on it and
    // leave a П where the mark's closed square should be.
    it('sits entirely above the floor, sill included', () => {
        for (const bar of bars) {
            expect(bar.position[1] - bar.args[1] / 2, `${bar.key} dips below the floor`).toBeGreaterThanOrEqual(0)
        }
        expect(byKey.sill.position[1] - byKey.sill.args[1] / 2).toBe(0)
    })

    it('closes its corners: sill, jambs and lintel stack without a gap', () => {
        const outerWidth = (PORTAL_FRAME.halfWidth + PORTAL_FRAME.bar) * 2
        expect(byKey.lintel.args[0]).toBe(outerWidth)
        expect(byKey.sill.args[0]).toBe(outerWidth)
        const sillTop = byKey.sill.position[1] + byKey.sill.args[1] / 2
        const jambBottom = byKey['jamb-left'].position[1] - byKey['jamb-left'].args[1] / 2
        const jambTop = byKey['jamb-left'].position[1] + byKey['jamb-left'].args[1] / 2
        const lintelBottom = byKey.lintel.position[1] - byKey.lintel.args[1] / 2
        expect(jambBottom).toBeCloseTo(sillTop, 6)
        expect(lintelBottom).toBeCloseTo(jambTop, 6)
    })

    it('puts the tap target in the middle of the opening', () => {
        const jamb = byKey['jamb-left']
        expect(portalFrameOpeningY()).toBeCloseTo(jamb.position[1], 6)
    })

    it('keeps every bar a hairline in both cross-section axes', () => {
        for (const bar of bars) {
            expect(Math.min(bar.args[0], bar.args[1])).toBe(PORTAL_FRAME.bar)
            expect(bar.args[2]).toBe(PORTAL_FRAME.depth)
        }
    })

    it('scales with the dimensions it is given rather than hardcoding them', () => {
        const dims = { halfWidth: 2.2, height: 4.8, bar: 0.24, depth: 0.24 }
        const jamb = portalFrameBars(dims).find((b) => b.key === 'jamb-right')
        expect(jamb.position[0]).toBeCloseTo(2.32, 6)
        expect(jamb.position[1]).toBeCloseTo(2.64, 6)
        expect(jamb.args).toEqual([0.24, 4.8, 0.24])
        expect(portalFrameOpeningY(dims)).toBeCloseTo(2.64, 6)
    })
})

describe('portalLabelHeight', () => {
    it('leaves the ring nameplate where it has always been', () => {
        expect(portalLabelHeight('gateway')).toBe(1.9)
        expect(portalLabelHeight(undefined)).toBe(1.9)
    })

    it('lifts a frame nameplate clear of the lintel instead of hanging it in the doorway', () => {
        expect(portalLabelHeight('frame')).toBeGreaterThan(PORTAL_FRAME.height + PORTAL_FRAME.bar)
    })
})
