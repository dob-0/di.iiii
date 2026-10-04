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

export const cardHeight = (node, scopeNodes = null) => {
    const rows = cardPortRows(node, scopeNodes)
    const picture = hasCardPicture(node?.typeId) ? TOP_PICTURE_HEIGHT + TOP_PICTURE_GAP : 0
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + picture + cardContentHeight(node) + CARD_FOOT
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
export const CARD_CONTENT_LINE_HEIGHT = 18
export const CARD_CONTENT_GROUP_HEIGHT = 18
export const CARD_CONTENT_ROW_GAP = 4
export const CARD_CONTENT_MAX_WRAP = 6
const CARD_CONTENT_PAD = 8
// Must match raw.css: .raw-graph-node-content (left/right 10px) and
// .raw-graph-node-content-line.is-row (padding-left --di-space-2 = 7px), less
// 2px so a sub-pixel difference wraps one line early rather than late.
const CONTENT_WIDTH = CARD_WIDTH - 20
const ROW_INDENT = 8
// Card body text: 13 graph units (audit §3.2; it was 10). CARD_WIDTH stays 200
// because saved projects are laid out on its pitch. On screen it is 13 x zoom,
// so it is 11px — the floor — at LEGIBLE_SCREEN_PX / CARD_BODY_FONT_PX.
export const CARD_BODY_FONT_PX = 13
export const LEGIBLE_SCREEN_PX = 11
const CONTENT_FONT_SIZE = CARD_BODY_FONT_PX
const CONTENT_FONT = `${CONTENT_FONT_SIZE}px Inter, "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

const lineBox = (line) => {
    if (line.kind === 'group') return { ...line, wraps: 1, height: CARD_CONTENT_GROUP_HEIGHT }
    const width = CONTENT_WIDTH - (line.kind === 'row' ? ROW_INDENT : 0) - 2
    const wraps = Math.min(CARD_CONTENT_MAX_WRAP, countWrappedLines(line.text, { width, font: CONTENT_FONT, fontSize: CONTENT_FONT_SIZE }))
    return { ...line, wraps, height: wraps * CARD_CONTENT_LINE_HEIGHT + CARD_CONTENT_ROW_GAP }
}

// The lines with their wrapped heights — one function for the geometry and
// the drawing, so they cannot disagree.
export const cardContentLayout = (node) => {
    const content = getNodeCardLines(node)
    if (!content) return null
    const lines = content.lines.map(lineBox)
    const moreHeight = content.more > 0 ? CARD_CONTENT_GROUP_HEIGHT : 0
    const height = lines.reduce((sum, line) => sum + line.height, 0) + moreHeight + CARD_CONTENT_PAD
    return { lines, more: content.more, moreHeight, height }
}

// The summary tier's lines: each group's name with its row count, or one line
// for rows with no group and for a Text. Rows themselves are never drawn.
export const summarizeCardContent = (lines = [], more = 0) => {
    const out = []
    let current = null
    let loose = 0
    for (const line of lines) {
        if (line.kind === 'group') {
            current = { name: line.text, count: 0 }
            out.push(current)
        } else if (current) {
            current.count += 1
        } else {
            loose += 1
        }
    }
    const summary = out.map((g) => `${g.name} · ${g.count}`)
    if (loose + more > 0 && !out.length) summary.push(`${loose + more} ${lines.some((l) => l.kind === 'line') ? 'lines' : 'rows'}`)
    return summary
}

export const cardContentHeight = (node) => cardContentLayout(node)?.height ?? 0

export const getCardBox = (node, scopeNodes = null) => ({
    x: node?.graphX ?? 0,
    y: node?.graphY ?? 0,
    width: CARD_WIDTH,
    height: cardHeight(node, scopeNodes)
})
