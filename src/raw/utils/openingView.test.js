import { describe, expect, it } from 'vitest'
import { OPENING_PAD, openingView } from './openingView.js'

const box = (width, height, extra = {}) => ({ freeLeft: 0, freeTop: 0, freeRight: width, freeBottom: height, ...extra })
const bounds = { minX: 120, minY: 60, width: 880, height: 300 }

describe('openingView (audit row 7)', () => {
    it('puts the first card 24px from the top-left, slack at the bottom and right', () => {
        const { zoom, panX, panY } = openingView({ bounds, box: box(1440, 805) })
        expect(120 * zoom + panX).toBeCloseTo(OPENING_PAD, 6)
        expect(60 * zoom + panY).toBeCloseTo(OPENING_PAD, 6)
        // the far corner is inside the box, with room left
        expect((120 + 880) * zoom + panX).toBeLessThan(1440)
        expect((60 + 300) * zoom + panY).toBeLessThan(805)
    })

    it('never magnifies past 100 %', () => {
        expect(openingView({ bounds: { minX: 0, minY: 0, width: 300, height: 100 }, box: box(2560, 1250) }).zoom).toBe(1)
    })

    it('opens fit-to-width (§3.7): a tall project keeps a readable zoom and continues below', () => {
        const tall = { minX: 0, minY: 0, width: 1600, height: 4000 }
        const { zoom, panY } = openingView({ bounds: tall, box: box(1440, 805) })
        expect(zoom).toBeCloseTo((1440 - 48) / 1600, 6)
        expect(panY).toBeCloseTo(OPENING_PAD, 6)
    })

    it('Fit (everything) shows it all: the smaller of the width and height fits', () => {
        const tall = { minX: 0, minY: 0, width: 400, height: 4000 }
        const { zoom } = openingView({ bounds: tall, box: box(1440, 805), everything: true })
        expect(zoom).toBeCloseTo((805 - 48) / 4000, 6)
    })

    it('is the same on every call (no hidden state)', () => {
        const zooms = Array.from({ length: 5 }, () => openingView({ bounds, box: box(1440, 805) }).zoom)
        zooms.forEach((z) => expect(Math.abs(z / zooms[0] - 1)).toBeLessThan(0.01))
    })

    it('honours a docked window: the free band, not the window, is the box', () => {
        const { zoom, panX } = openingView({ bounds, box: box(1440, 805, { freeLeft: 320 }) })
        expect(120 * zoom + panX).toBeCloseTo(320 + OPENING_PAD, 6)
    })

    it('opens a phone at the larger of fit-to-width and 50 %, but Fit (everything) shows it all', () => {
        const wide = { minX: 0, minY: 0, width: 2000, height: 400 }
        expect(openingView({ bounds: wide, box: box(390, 760) }).zoom).toBe(0.5)
        expect(openingView({ bounds: wide, box: box(390, 760), everything: true }).zoom).toBeCloseTo((390 - 48) / 2000, 6)
        const narrowGraph = { minX: 0, minY: 0, width: 600, height: 4000 }
        expect(openingView({ bounds: narrowGraph, box: box(390, 760) }).zoom).toBeCloseTo((390 - 48) / 600, 6)
    })
})
