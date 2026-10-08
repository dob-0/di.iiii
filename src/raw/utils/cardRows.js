import { getCardBox } from './cardGeometry.js'

// Cards that never cover each other, measured from the cards' REAL boxes.
//
// A card's height is not a number anyone can assume: it is the header, the port
// rows and the content lines wrapped at the card's width (cardGeometry.js —
// cardHeight). A tool that lays a project out in rows at fixed y (di-atlas
// production-new: "rooms row 400", then 600) guessed one height; when the
// Pricing text card grew it covered "Across the night" (owner, dev.diiii.xyz,
// space hayfilm, 2026-10-05, ledger N146/N164).
//
// separateCards keeps every card where it is unless it overlaps a card above it,
// and only then moves it DOWN to that card's real bottom + gap. Columns do not
// change, order does not change, a layout that already clears stays byte-equal.
// Pure and DOM-free, so the same code runs in the editor, in a test and in
// scripts/separate-cards.mjs (which the production tools call).

export const ROW_GAP = 40

const clears = (a, b, gap) => a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height + gap || b.y >= a.y + a.height + gap

/**
 * @param {Array<object>} nodes  graph nodes (graphX, graphY, values …); not changed
 * @param {{gap?: number}} [options]  the space kept between a card and the one above it
 * @returns {{moves: Array<{id, label, from: {x, y}, to: {x, y}, height: number}>, positions: Map<string, {x: number, y: number}>}}
 */
export const separateCards = (nodes, { gap = ROW_GAP } = {}) => {
    const order = [...nodes].sort((a, b) => (a.graphY ?? 0) - (b.graphY ?? 0) || (a.graphX ?? 0) - (b.graphX ?? 0))
    const placed = []
    const moves = []
    const positions = new Map()
    for (const node of order) {
        const box = getCardBox(node)
        const from = { x: box.x, y: box.y }
        let moved = true
        while (moved) {
            moved = false
            for (const other of placed) {
                if (!clears(box, other, gap)) {
                    box.y = other.y + other.height + gap
                    moved = true
                }
            }
        }
        placed.push(box)
        positions.set(node.id, { x: box.x, y: box.y })
        if (box.y !== from.y) moves.push({ id: node.id, label: node.label ?? null, from, to: { x: box.x, y: box.y }, height: box.height })
    }
    return { moves, positions }
}

/** The cards that cover another (or sit closer than gap): empty when the layout is clean. */
export const coveredPairs = (nodes, { gap = 0 } = {}) => {
    const boxes = nodes.map((node) => ({ node, ...getCardBox(node) }))
    const pairs = []
    for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
            if (!clears(boxes[i], boxes[j], gap)) pairs.push([boxes[i].node.label ?? boxes[i].node.id, boxes[j].node.label ?? boxes[j].node.id])
        }
    }
    return pairs
}
