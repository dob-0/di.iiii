import { getNodeCardLines, getNodeInputs, getNodeOutputs } from '../../project/nodeRegistry.js'
import { isPictureType } from '../../project/tops/vjDeck.js'
import { hasCardPreview } from '../components/cardPreview/previewTypes.js'

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

// Whether a card carries a picture under its ports: a picture operator's live
// output (a VJ deck's is its master), or the live preview of a node that makes something visible (a cube,
// a light — see cardPreview/previewTypes.js). One size for both, so every
// picture on the desk lines up; grown BELOW the ports for the same reason.
export const hasCardPicture = (typeId) => isPictureType(typeId) || hasCardPreview(typeId)

// scopeNodes is threaded through every geometry helper because a container's
// ports are DERIVED from the doorway nodes inside it — see getNodeInputs. Miss
// one of these call sites and the container grows a socket the card does not
// draw, or draws one the wires do not land on.
// How many port rows the card's body holds. A card with no ports keeps one
// empty row so it is not a bare header — unless it has content lines to show,
// which then start right under the header (the Gear list's card opened with a
// blank 22px row above its rows).
export const cardPortRows = (node, scopeNodes = null) => {
    const ports = Math.max(getNodeInputs(node, scopeNodes).length, getNodeOutputs(node, scopeNodes).length)
    if (ports > 0) return ports
    return getNodeCardLines(node) ? 0 : 1
}

export const cardHeight = (node, scopeNodes = null) => {
    const rows = cardPortRows(node, scopeNodes)
    const picture = hasCardPicture(node?.typeId) ? TOP_PICTURE_HEIGHT + TOP_PICTURE_GAP : 0
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + picture + cardContentHeight(node) + CARD_FOOT
}

// The content lines a List or Text card shows (getNodeCardLines), BELOW the
// ports and any picture, for the same reason the picture is: no port moves.
export const CARD_CONTENT_LINE_HEIGHT = 18
const CARD_CONTENT_PAD = 8
export const cardContentHeight = (node) => {
    const content = getNodeCardLines(node)
    if (!content) return 0
    const lines = content.lines.length + (content.more > 0 ? 1 : 0)
    return lines * CARD_CONTENT_LINE_HEIGHT + CARD_CONTENT_PAD
}

export const getCardBox = (node, scopeNodes = null) => ({
    x: node?.graphX ?? 0,
    y: node?.graphY ?? 0,
    width: CARD_WIDTH,
    height: cardHeight(node, scopeNodes)
})
