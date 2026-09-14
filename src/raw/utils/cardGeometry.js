import { getNodeInputs, getNodeOutputs } from '../../project/nodeRegistry.js'
import { isTopType } from '../../project/tops/topOperators.js'
import { hasCardPreview } from '../components/cardPreview/previewTypes.js'
import { hasCardViewer } from '../components/cardViewers/viewerKind.js'

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
// BELOW them, so no port moves and no wire lands anywhere new. Fills the
// card edge to edge (design audit B4 follow-up, 2026-09-14: a picture with
// an 8px gutter each side read as a small preview lost in a big empty card;
// the gutter added nothing a person could act on, so it is gone — the
// picture now touches the same edges the card's own border does).
export const TOP_PICTURE_WIDTH = CARD_WIDTH
export const TOP_PICTURE_HEIGHT = Math.round(TOP_PICTURE_WIDTH * 9 / 16)
const TOP_PICTURE_GAP = 4
// A card's live-value viewer (CardValueViewer — the number/lamp/swatch/
// sparkline strip) is text, not a picture, so it needs far less room. Grown
// BELOW the ports for the same reason the picture is: no port moves.
export const VALUE_VIEWER_HEIGHT = 34
const VALUE_VIEWER_GAP = 4

// Whether a card carries a picture under its ports: a picture operator's live
// output, or the live preview of a node that makes something visible (a cube,
// a light — see cardPreview/previewTypes.js). One size for both, so every
// picture on the desk lines up; grown BELOW the ports for the same reason.
export const hasCardPicture = (typeId) => isTopType(typeId) || hasCardPreview(typeId)

// A card gets AT MOST one bottom slot (owner, 2026-09-14: "one viewer per
// card"). A picture always wins the slot when the type has one; the value
// viewer only ever fills the slot a picture left empty.
export const hasCardViewerSlot = (node, scopeNodes = null) =>
    !hasCardPicture(node?.typeId) && hasCardViewer(node, scopeNodes)

// Folding unwired inputs (design audit B4: "every unwired port listed on
// cards" — a Cube with one wired input out of eight was 319px tall, almost
// all of it empty, because the card reserved a row for every DECLARED input
// whether or not it was drawn). The fix is not just hiding the unwired rows —
// it is not reserving their space at all:
//
// FOLDED — the normal resting state whenever a card has any unwired input:
// every WIRED input keeps its own row, compacted to consecutive rows in
// declared order (so a wired port that happens to be declared 6th draws on
// row 0 if it is the only one wired — nothing above it reserves space any
// more), and every unwired input collapses into exactly ONE extra row (the
// "+N" toggle), placed right after the last wired row.
//
// UNFOLDED — nothing is folding away: the card has been expanded by its own
// toggle, or a wire is being dragged (so every input stays a reachable drop
// target — RawGraphSurface unfolds every card in the graph while any wire is
// pending). Every declared input keeps its own row, at its declared index —
// the same arithmetic that predates folding, so a saved document's wires
// still land exactly where they always did once you expand the card.
//
// `isWired` is `(portId) => boolean` for THIS node — RawGraphSurface's
// wiredInputKeys is keyed `${nodeId}:${portId}` across the whole graph, so
// callers close over the node id: `(portId) => wiredInputKeys.has(...)`.
export const getInputRows = (node, scopeNodes = null, isWired = null, folded = false) => {
    const inputs = getNodeInputs(node, scopeNodes)
    if (!folded || typeof isWired !== 'function') {
        return inputs.map((port, index) => ({ port, row: index, folded: false }))
    }
    const rows = []
    let row = 0
    for (const port of inputs) {
        if (isWired(port.id)) {
            rows.push({ port, row, folded: false })
            row += 1
        }
    }
    const unwired = inputs.filter((port) => !isWired(port.id))
    if (unwired.length) rows.push({ ports: unwired, row, folded: true })
    return rows
}

export const inputRowCount = (node, scopeNodes = null, isWired = null, folded = false) =>
    getInputRows(node, scopeNodes, isWired, folded).length

// A single input's row. A WIRED port always has one (folded or not — see
// getInputRows), so this is the one anchor an existing edge is ever drawn
// from. An unwired port returns null while folded: nothing should be wiring
// to it directly, because starting a wire unfolds every card first.
export const inputRowForPort = (node, scopeNodes, portId, isWired = null, folded = false) => {
    const rows = getInputRows(node, scopeNodes, isWired, folded)
    const match = rows.find((entry) => entry.port?.id === portId)
    return match ? match.row : null
}

// The row band a card's port area occupies. Inputs (folded-aware, above) and
// outputs (never folded — every output is structurally always "there") share
// the same PORT_ROW_HEIGHT pitch, so whichever side is taller sets the band
// the picture/value-viewer slot and the card's own height are both measured
// from — the single source both cardHeight and RawGraphSurface's rendering
// read, so they can never disagree about where the ports end.
export const portRowCount = (node, scopeNodes = null, isWired = null, folded = false) =>
    Math.max(inputRowCount(node, scopeNodes, isWired, folded), getNodeOutputs(node, scopeNodes).length, 1)

// isWired/folded default to "nothing is folded" — the full, declared-order
// height — so a caller that only wants a safe upper bound (RawEditor.jsx
// placing a panel window next to a card, without wiring context) still gets
// a box the real card never draws taller than.
export const cardHeight = (node, scopeNodes = null, isWired = null, folded = false) => {
    const rows = portRowCount(node, scopeNodes, isWired, folded)
    const picture = hasCardPicture(node?.typeId) ? TOP_PICTURE_HEIGHT + TOP_PICTURE_GAP : 0
    const viewer = hasCardViewerSlot(node, scopeNodes) ? VALUE_VIEWER_HEIGHT + VALUE_VIEWER_GAP : 0
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + picture + viewer + CARD_FOOT
}

export const getCardBox = (node, scopeNodes = null) => ({
    x: node?.graphX ?? 0,
    y: node?.graphY ?? 0,
    width: CARD_WIDTH,
    height: cardHeight(node, scopeNodes)
})
