import { describe, expect, it } from 'vitest'
import { CARD_WIDTH } from './cardGeometry.js'
import { GAP, placeNewCard } from './cardPlacement.js'

// A card made from the palette lands where it was asked for: its middle on the
// clicked point. Measured before the fix on the dev stack, 2026-09-24: the
// middle of a new Blur card sat ~21 px right and ~32-92 px below the tap.
describe('placeNewCard', () => {
    it('centres the card on the point, at its real size', () => {
        const at = placeNewCard({ point: { x: 1000, y: 400 }, height: 184 })
        expect(at.x + CARD_WIDTH / 2).toBe(1000)
        expect(at.y + 184 / 2).toBe(400)
    })

    it('puts a spatial node\'s card under the point, not on it', () => {
        expect(placeNewCard({ point: { x: 500, y: 300 }, height: 100, below: true }).y).toBe(390)
    })

    it('never lands above the top of the canvas', () => {
        expect(placeNewCard({ point: { x: 0, y: 0 }, height: 184 }).y).toBe(20)
    })

    it('stays on the point in a gap wide enough for it', () => {
        // Two cards with a 260 px gap between them: room for a 200 px card.
        const taken = [{ x: 0, y: 0, width: 200, height: 184 }, { x: 460, y: 0, width: 200, height: 184 }]
        const at = placeNewCard({ point: { x: 330, y: 92 }, height: 184, taken })
        expect(at).toEqual({ x: 230, y: 20 })
    })

    it('steps off a card it would cover, until the boxes clear by the gap', () => {
        const taken = [{ x: 400, y: 300, width: 200, height: 184 }]
        const at = placeNewCard({ point: { x: 500, y: 392 }, height: 184, taken })
        const clear = at.x >= 600 + GAP || at.y >= 484 + GAP || at.x + CARD_WIDTH + GAP <= 400 || at.y + 184 + GAP <= 300
        expect(clear).toBe(true)
    })
})
