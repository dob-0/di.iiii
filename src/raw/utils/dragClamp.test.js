import { describe, expect, it } from 'vitest'
import { dragClamp, edgePanVelocity, EDGE_BAND_PX, EDGE_PAN_MAX_PX_PER_S, GRAB_PX } from './dragClamp.js'

const rect = { left: 0, top: 95, right: 1440, bottom: 900 }

describe('dragClamp: a card keeps its top-left GRAB_PX inside the canvas, at any zoom', () => {
    for (const zoom of [0.74, 1, 1.13, 1.5]) {
        it(`reaches the left and top limit exactly at ${Math.round(zoom * 100)} %`, () => {
            const view = { rect, panX: 50, panY: 70, zoom }
            const far = dragClamp({ x: -100000, y: -100000 }, view)
            // screen position of the card's top-left corner = rect + pan + graph * zoom
            expect(far.x * zoom + view.panX).toBeCloseTo(GRAB_PX, 6)
            expect(far.y * zoom + view.panY).toBeCloseTo(GRAB_PX, 6)
            const near = dragClamp({ x: 100000, y: 100000 }, view)
            expect(near.x * zoom + view.panX).toBeCloseTo(rect.right - rect.left - GRAB_PX, 6)
            expect(near.y * zoom + view.panY).toBeCloseTo(rect.bottom - rect.top - GRAB_PX, 6)
        })
    }

    it('leaves a position inside the band alone', () => {
        expect(dragClamp({ x: 300, y: 200 }, { rect, panX: 0, panY: 0, zoom: 1 })).toEqual({ x: 300, y: 200 })
    })

    it('keeps the card out from under a panel docked on the right (visible band, not window edge)', () => {
        const view = { rect, panX: 0, panY: 0, zoom: 0.82, inset: { right: 380, left: 0, top: 0, bottom: 0 } }
        const far = dragClamp({ x: 100000, y: 0 }, view)
        expect(far.x * 0.82).toBeCloseTo(rect.right - rect.left - 380 - GRAB_PX, 6)
    })

    it('does nothing on a canvas with no size (jsdom, or not laid out yet)', () => {
        const none = { left: 0, top: 0, right: 0, bottom: 0 }
        expect(dragClamp({ x: -50, y: -50 }, { rect: none, panX: 0, panY: 0, zoom: 1 })).toEqual({ x: -50, y: -50 })
    })
})

describe('edgePanVelocity: pan only at the edge, faster the deeper', () => {
    it('is null in the middle of the canvas', () => {
        expect(edgePanVelocity({ x: 700, y: 500 }, rect)).toBeNull()
        expect(edgePanVelocity({ x: EDGE_BAND_PX, y: 500 }, rect)).toBeNull()
    })
    it('pans the content right at the left edge, left at the right edge', () => {
        expect(edgePanVelocity({ x: 0, y: 500 }, rect).vx).toBe(EDGE_PAN_MAX_PX_PER_S)
        expect(edgePanVelocity({ x: 1440, y: 500 }, rect).vx).toBe(-EDGE_PAN_MAX_PX_PER_S)
    })
    it('is proportional to the depth into the band', () => {
        const half = edgePanVelocity({ x: EDGE_BAND_PX / 2, y: 500 }, rect)
        expect(half.vx).toBeCloseTo(EDGE_PAN_MAX_PX_PER_S / 2, 6)
        expect(half.vy).toBe(0)
    })
    it('keeps panning at full speed with the pointer past the edge', () => {
        expect(edgePanVelocity({ x: -300, y: 500 }, rect).vx).toBe(EDGE_PAN_MAX_PX_PER_S)
        expect(edgePanVelocity({ x: 700, y: 95 - 40 }, rect).vy).toBe(EDGE_PAN_MAX_PX_PER_S)
    })
})
