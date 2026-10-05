import { getNodeCardLines, getNodeInputs, getNodeOutputs } from '../../project/nodeRegistry.js'
import { isPictureType } from '../../project/tops/vjDeck.js'
import { hasCardPreview } from '../components/cardPreview/previewTypes.js'
import { countWrappedLines } from './textWrap.js'

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

// A card the person has resized keeps its size in the node's own values:
// `values.cardSize = { w, h }`, in graph units. Absent (or null) means the
// card sizes itself, as it always did. The minimum keeps the title and every
// port row readable: a card is never made smaller than its header and ports.
export const MIN_CARD_WIDTH = 140
export const cardSizeOf = (node) => {
    const size = node?.values?.cardSize
    const w = Number(size?.w)
    const h = Number(size?.h)
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : null
}
export const cardWidth = (node) => {
    const size = cardSizeOf(node)
    return size ? Math.max(MIN_CARD_WIDTH, size.w) : CARD_WIDTH
}
// Header, ports, picture and foot: what a card can never be shorter than.
export const cardMinHeight = (node, scopeNodes = null) => {
    const rows = cardPortRows(node, scopeNodes)
    const picture = hasCardPicture(node?.typeId) ? TOP_PICTURE_HEIGHT + TOP_PICTURE_GAP : 0
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + picture + CARD_FOOT
}

export const cardHeight = (node, scopeNodes = null) => {
    const size = cardSizeOf(node)
    if (size) return Math.max(cardMinHeight(node, scopeNodes), size.h)
    return cardMinHeight(node, scopeNodes) + cardContentHeight(node)
}

// The content lines a List or Text card shows (getNodeCardLines), BELOW the
// ports and any picture, for the same reason the picture is: no port moves.
//
// A row WRAPS (owner 2026-10-02 on the NOPA To do card: "text in a row is
// invisible, it goes out of the window" — 24 of 51 lines were cut to one line
// with an ellipsis). Each row takes as many lines as the browser needs, up to
// CARD_CONTENT_MAX_WRAP; a longer row ends in an ellipsis and reads in full in
// its window. The count comes from the browser's text metrics (textWrap.js),
// so the box reserved here is the box drawn.
export const CARD_CONTENT_LINE_HEIGHT = 14
export const CARD_CONTENT_GROUP_HEIGHT = 18
export const CARD_CONTENT_ROW_GAP = 3
export const CARD_CONTENT_MAX_WRAP = 6
const CARD_CONTENT_PAD = 8
// Must match raw.css: .raw-graph-node-content (left/right 10px) and
// .raw-graph-node-content-line.is-row (padding-left --di-space-2 = 7px), less
// 2px so a sub-pixel difference wraps one line early rather than late.
const CONTENT_WIDTH = CARD_WIDTH - 20
const ROW_INDENT = 7
const CONTENT_FONT_SIZE = 10
const CONTENT_FONT = `${CONTENT_FONT_SIZE}px Inter, "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

const lineBox = (line, contentWidth = CONTENT_WIDTH) => {
    if (line.kind === 'group') return { ...line, wraps: 1, height: CARD_CONTENT_GROUP_HEIGHT }
    const width = contentWidth - (line.kind === 'row' ? ROW_INDENT : 0) - 2
    const wraps = Math.min(CARD_CONTENT_MAX_WRAP, countWrappedLines(line.text, { width, font: CONTENT_FONT, fontSize: CONTENT_FONT_SIZE }))
    return { ...line, wraps, height: wraps * CARD_CONTENT_LINE_HEIGHT + CARD_CONTENT_ROW_GAP }
}

// The lines with their wrapped heights — one function for the geometry and
// the drawing, so they cannot disagree.
export const cardContentLayout = (node) => {
    const size = cardSizeOf(node)
    if (size) return sizedContentLayout(node, size)
    const content = getNodeCardLines(node)
    if (!content) return null
    const lines = content.lines.map((line) => lineBox(line))
    const moreHeight = content.more > 0 ? CARD_CONTENT_GROUP_HEIGHT : 0
    const height = lines.reduce((sum, line) => sum + line.height, 0) + moreHeight + CARD_CONTENT_PAD
    return { lines, more: content.more, moreHeight, height }
}

// A resized card draws as many of its lines as the room it was given holds,
// at the width it was given, and says "+ N more" only for the rest.
const sizedContentLayout = (node, size) => {
    const content = getNodeCardLines(node, { unlimited: true })
    if (!content) return null
    const width = cardWidth(node) - 20
    const room = Math.max(0, cardHeight(node) - cardMinHeight(node) - CARD_CONTENT_PAD)
    const all = content.lines.map((line) => lineBox(line, width))
    const lines = []
    let used = 0
    for (let i = 0; i < all.length; i += 1) {
        const left = all.length - i
        // keep room for the "+ N more" marker unless everything fits
        const reserve = left > 1 ? CARD_CONTENT_GROUP_HEIGHT : 0
        if (used + all[i].height + reserve > room && !(left === 1 && used + all[i].height <= room)) break
        lines.push(all[i])
        used += all[i].height
    }
    const more = content.more + (all.length - lines.length)
    const moreHeight = all.length - lines.length > 0 || content.more > 0 ? CARD_CONTENT_GROUP_HEIGHT : 0
    return { lines, more, moreHeight, height: used + moreHeight + CARD_CONTENT_PAD }
}

export const cardContentHeight = (node) => cardContentLayout(node)?.height ?? 0

export const getCardBox = (node, scopeNodes = null) => ({
    x: node?.graphX ?? 0,
    y: node?.graphY ?? 0,
    width: cardWidth(node),
    height: cardHeight(node, scopeNodes)
})
