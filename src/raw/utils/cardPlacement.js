import { CARD_WIDTH } from './cardGeometry.js'

// Where a card made from the palette lands, in graph units.
//
// The card is CENTRED on the point that was clicked or tapped, using the card's
// real size. Until 2026-09-24 the editor centred it with a 160×120 box left over
// from the old root-world card, while a card is 200 wide and a picture card 184
// tall — so every new card landed ~20 px right and ~60-90 px below the point
// (measured on the dev stack: a tap at (1000, 400) put the card's middle at
// (1021, 432) … (1121, 832) for a tap at (1100, 800)). The collision test used
// the same small box, so a card could still land half over a neighbour, and a
// click in a gap between cards stepped diagonally away from where it was made.
//
// Collision is a real overlap of the two boxes plus GAP. While the spot is
// taken, the card steps diagonally (as before) — at most MAX_STEPS times.

export const GAP = 12
const STEP = 44
const MAX_STEPS = 24

const overlaps = (a, b) => a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x
    && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y

/**
 * @param {object} options
 * @param {{x: number, y: number}} options.point   the graph point of the click / tap
 * @param {number} options.height                  the new card's height (cardHeight)
 * @param {Array<{x, y, width, height}>} [options.taken]  boxes already on the canvas
 * @param {boolean} [options.below]                a spatial node: the card goes under the point, so the thing placed in the room stays visible above it
 * @returns {{x: number, y: number}}               the card's top-left
 */
export const placeNewCard = ({ point, height, taken = [], below = false }) => {
    let x = point.x - CARD_WIDTH / 2
    let y = below ? point.y + 90 : point.y - height / 2
    y = Math.max(20, y)
    const box = () => ({ x, y, width: CARD_WIDTH, height })
    for (let step = 0; step < MAX_STEPS && taken.some((other) => overlaps(box(), other)); step += 1) {
        x += STEP
        y += STEP
    }
    return { x, y }
}
