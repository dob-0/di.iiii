import { describe, expect, it } from 'vitest'
import { cardHeight } from './cardGeometry.js'
import { ROW_GAP, coveredPairs, separateCards } from './cardRows.js'

const text = (id, content, x, y) => ({ id, label: id, typeId: 'view.text', values: { content }, graphX: x, graphY: y })
const list = (id, n, x, y) => ({
    id, label: id, typeId: 'view.list', graphX: x, graphY: y,
    values: { groups: ['G'], items: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, text: 'a fairly long line of money text that wraps in the card ' + i, group: 'G', order: i })) }
})
const lines = (n) => Array.from({ length: n }, (_, i) => `a pricing line that is long enough to wrap inside the card number ${i}`).join('\n')

// The MOCT shape: The night + Pricing on the top row, the rooms row at a FIXED y underneath.
const moct = () => [
    text('The night', 'one night', 120, 190),
    { ...text('Pricing', lines(12), 540, 190), values: { content: lines(12), cardSize: { w: 381, h: 560 } } }, // grown: a person resized it, or its text grew past the tool's assumed height
    list('Bar', 8, 120, 600),
    list('Studio', 8, 340, 600),
    list('Across the night', 8, 560, 600)
]

describe('separateCards: cards are laid out from their real heights', () => {
    it('the fixed-row layout covers a card (the bug)', () => {
        // assumed row y 600 is too close: Pricing is really taller than 600 - 190 - gap
        const pricing = moct()[1]
        expect(190 + cardHeight(pricing)).toBeGreaterThan(600 - ROW_GAP)
        expect(coveredPairs(moct(), { gap: ROW_GAP }).some((p) => p.includes('Pricing') && p.includes('Across the night'))).toBe(true)
    })
    it('moves the covered card below the real bottom, nothing else', () => {
        const nodes = moct()
        const { moves, positions } = separateCards(nodes)
        const pricing = nodes[1]
        const bottom = 190 + cardHeight(pricing)
        expect(positions.get('Across the night').y).toBe(bottom + ROW_GAP)
        expect(positions.get('Pricing')).toEqual({ x: 540, y: 190 })
        expect(moves.map((m) => m.label)).toEqual(['Across the night'])
        const out = nodes.map((n) => ({ ...n, graphX: positions.get(n.id).x, graphY: positions.get(n.id).y }))
        expect(coveredPairs(out, { gap: ROW_GAP })).toEqual([])
    })
    it('a layout that already clears is left exactly as it is', () => {
        const nodes = moct().map((n) => (n.graphY === 600 ? { ...n, graphY: 1400 } : n))
        expect(separateCards(nodes).moves).toEqual([])
    })
    it('cascades: a pushed card pushes the one under it', () => {
        const nodes = [text('a', lines(12), 0, 0), text('b', 'b', 0, 50), text('c', 'c', 0, 120)]
        const { positions } = separateCards(nodes)
        const out = nodes.map((n) => ({ ...n, graphX: positions.get(n.id).x, graphY: positions.get(n.id).y }))
        expect(coveredPairs(out, { gap: ROW_GAP })).toEqual([])
        expect(positions.get('c').y).toBeGreaterThan(positions.get('b').y)
    })
})
