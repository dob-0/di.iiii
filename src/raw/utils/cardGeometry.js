import { getNodeInputs, getNodeOutputs } from '../../project/nodeRegistry.js'
import { isTopType } from '../../project/tops/topOperators.js'

// A graph card's box, in graph units. Shared between the surface that draws
// the cards (and lands wires on them — see graphGeometry.test.jsx for why
// these numbers must not move) and the editor that places a panel node's
// window NEXT TO its card: both have to agree on where the card ends, or the
// window opens on top of the card's lower ports.
export const CARD_WIDTH = 200
export const HEADER_HEIGHT = 44
export const PORT_ROW_HEIGHT = 22
const CARD_FOOT = 8
// A picture operator's card carries its live picture under the port rows —
// BELOW them, so no port moves and no wire lands anywhere new.
export const TOP_PICTURE_WIDTH = CARD_WIDTH - 16
export const TOP_PICTURE_HEIGHT = Math.round(TOP_PICTURE_WIDTH * 9 / 16)
const TOP_PICTURE_GAP = 4

// scopeNodes is threaded through every geometry helper because a container's
// ports are DERIVED from the doorway nodes inside it — see getNodeInputs. Miss
// one of these call sites and the container grows a socket the card does not
// draw, or draws one the wires do not land on.
export const cardHeight = (node, scopeNodes = null) => {
    const rows = Math.max(getNodeInputs(node, scopeNodes).length, getNodeOutputs(node, scopeNodes).length, 1)
    const picture = isTopType(node?.typeId) ? TOP_PICTURE_HEIGHT + TOP_PICTURE_GAP : 0
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + picture + CARD_FOOT
}

export const getCardBox = (node, scopeNodes = null) => ({
    x: node?.graphX ?? 0,
    y: node?.graphY ?? 0,
    width: CARD_WIDTH,
    height: cardHeight(node, scopeNodes)
})
