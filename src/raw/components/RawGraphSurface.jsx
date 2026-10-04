import { useEffect, useMemo, useRef, useState } from 'react'
import useDeleteConfirm from '../../hooks/useDeleteConfirm.jsx'
import { createTapTracker } from '../utils/useDoubleTap.js'
import { dragClamp, edgePanVelocity } from '../utils/dragClamp.js'
import {
    CARD_BODY_FONT_PX,
    CARD_CONTENT_GROUP_HEIGHT,
    CARD_CONTENT_LINE_HEIGHT,
    CARD_WIDTH,
    HEADER_HEIGHT,
    LEGIBLE_SCREEN_PX,
    PORT_ROW_HEIGHT,
    TOP_PICTURE_HEIGHT,
    TOP_PICTURE_WIDTH,
    cardContentLayout,
    cardHeight,
    cardPortRows,
    hasCardPicture,
    summarizeCardContent
} from '../utils/cardGeometry.js'
import { isPictureType, pictureIdOf } from '../../project/tops/vjDeck.js'
import TopThumbnail from './TopThumbnail.jsx'
import CardPreview from './cardPreview/CardPreview.jsx'
import { hasCardPreview } from './cardPreview/previewTypes.js'
import { cardEmptyHint } from '../utils/cardEmptyHint.js'
import { isTypingTarget, keyHint, matchesKeyId } from '../input/keymap.js'
import ContextMenu from './ContextMenu.jsx'
import { useLongPress } from '../utils/useLongPress.js'
import { openingView } from '../utils/openingView.js'
import {
    arePortsCompatible,
    getNodeCardLines,
    getNodeCardSummary,
    getNodeFamily,
    getNodeInputs,
    getNodeOutputs,
    getNodeType,
    getNodeCardTitle,
    getPortType
} from '../../project/nodeRegistry.js'

const PORT_DOT_RADIUS = 5
const GRAPH_MIN_ZOOM = 0.05
const GRAPH_MAX_ZOOM = 8
const GRAPH_ZOOM_STEP = 0.1
// Wire drops resolve to the nearest compatible input port within this many
// SCREEN pixels of the release point, rather than requiring the pointerup to
// land on the 10px dot itself. Two reasons: a finger cannot hit a 10px target,
// and on touch the browser gives the output dot implicit pointer capture, so
// the pointerup is delivered there and NEVER to the input dot underneath —
// which made graph wiring impossible on a phone rather than merely fiddly.
const PORT_DROP_RADIUS_PX = 36
// Breathing room left around the graph when it is first fitted to the viewport.
const GRAPH_FIT_PADDING_PX = 24
// Starting a wire required landing a finger on the 10px output dot; only the
// DROP was forgiving. A pointerdown anywhere on a card within this many screen
// pixels of a port centre starts a wire instead of a card drag, so grabbing is
// as forgiving as dropping.
const PORT_GRAB_RADIUS_PX = 28
// Framing ONE node is allowed to magnify, unlike fit-all which caps at 1.
// A frame never goes below this (a node alone, unreadable, is no frame).
const FIT_MIN_USEFUL_ZOOM = 0.34
const FRAME_TARGET_ZOOM = 1
const FRAME_MAX_ZOOM = 1.6
// Semantic zoom. Below each threshold the card renders less, so that what is
// left stays legible instead of everything shrinking into an unreadable smear.
//
// LOAD-BEARING INVARIANT: tiers only ever change what is rendered INSIDE the
// card's box. `cardHeight`, CARD_WIDTH, HEADER_HEIGHT, PORT_ROW_HEIGHT and both
// port-centre functions are identical at every tier. Wire endpoints are
// computed from those, so a tier that changed any of them would visibly
// detach every wire on the node — the failure would read as a rendering
// glitch rather than a bug. `graphGeometryIsTierInvariant` in the test file
// asserts this and must not be deleted.
// Keyed to ON-SCREEN size (audit §3.7): a card's text is CARD_BODY_FONT_PX units
// tall, so it is 11 screen px — the floor — at 11 / 13 of a zoom.
const LOD_FULL = LEGIBLE_SCREEN_PX / CARD_BODY_FONT_PX  // below: the summary (title, group names, counts)
const LOD_SUMMARY = 0.5   // below: the title alone, counter-scaled to stay 11px
const LOD_BLOCK = 0.18    // below: a solid block, no text at all
// Stops the markup flickering when a pinch hovers exactly on a threshold.
const LOD_HYSTERESIS = 0.02

export const LOD_TIERS = ['block', 'header', 'summary', 'full']

/**
 * Which detail tier a card renders at. Pure, exported for tests.
 * `previous` applies hysteresis so a gesture sitting on a boundary is stable.
 */
export const lodTierForZoom = (zoom, previous = null) => {
    const bump = (threshold) => (
        previous && LOD_TIERS.indexOf(previous) > LOD_TIERS.indexOf('block')
            ? threshold - LOD_HYSTERESIS
            : threshold
    )
    if (zoom < bump(LOD_BLOCK)) return 'block'
    if (zoom < bump(LOD_SUMMARY)) return 'header'
    if (zoom < bump(LOD_FULL)) return 'summary'
    return 'full'
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// A List's rows under their group headings, or a Text's first lines, drawn in
// the card under its ports. Each row wraps to the line count cardContentLayout
// measured and is clamped to it, so the height the card reserved is exactly
// what is drawn — a wrong measure shows an ellipsis, never text over a port.
function CardContentLines({ content, top }) {
    return (
        <ul className="raw-graph-node-content" style={{ top }}>
            {content.lines.map((line, i) => (
                <li
                    key={i}
                    className={`raw-graph-node-content-line is-${line.kind}`}
                    style={line.kind === 'group'
                        ? { height: line.height, lineHeight: `${line.height}px` }
                        : {
                            height: line.height,
                            lineHeight: `${CARD_CONTENT_LINE_HEIGHT}px`,
                            WebkitLineClamp: line.wraps
                        }}
                    title={line.text}
                >
                    {line.text}
                </li>
            ))}
            {content.more > 0 ? (
                <li
                    className="raw-graph-node-content-line is-more"
                    style={{ height: content.moreHeight, lineHeight: `${content.moreHeight}px` }}
                >
                    + {content.more} more
                </li>
            ) : null}
        </ul>
    )
}

// The summary tier's body: group names with their row counts, never the rows.
// It sits in the same box CardContentLines would fill, so nothing moves.
function CardSummaryLines({ content, top }) {
    return (
        <ul className="raw-graph-node-content is-summary" style={{ top }}>
            {summarizeCardContent(content.lines, content.more).map((line, i) => (
                <li
                    key={i}
                    className="raw-graph-node-content-line is-group"
                    style={{ height: CARD_CONTENT_GROUP_HEIGHT, lineHeight: `${CARD_CONTENT_GROUP_HEIGHT}px` }}
                >
                    {line}
                </li>
            ))}
        </ul>
    )
}

// The card box itself (CARD_WIDTH, cardHeight) lives in cardGeometry.js: the
// editor places a panel node's window against it and must not guess.
const inputPortCenter = (node, portId, scopeNodes = null) => {
    const inputs = getNodeInputs(node, scopeNodes)
    const idx = inputs.findIndex((p) => p.id === portId)
    if (idx < 0) return { x: node.graphX, y: node.graphY + HEADER_HEIGHT }
    return {
        x: node.graphX,
        y: node.graphY + HEADER_HEIGHT + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
    }
}

const outputPortCenter = (node, portId, scopeNodes = null) => {
    const outputs = getNodeOutputs(node, scopeNodes)
    const idx = outputs.findIndex((p) => p.id === portId)
    if (idx < 0) return { x: node.graphX + CARD_WIDTH, y: node.graphY + HEADER_HEIGHT }
    return {
        x: node.graphX + CARD_WIDTH,
        y: node.graphY + HEADER_HEIGHT + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
    }
}

const buildWirePath = (from, to) => {
    const dx = Math.max(30, Math.abs(to.x - from.x) * 0.4)
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

export default function RawGraphSurface({
    // Zen: the zoom controls stop being resident. They are NOT removed — on a
    // touch screen there is no wheel, so they are the only way to zoom, and the
    // double-tap-vs-zoom-button guard exists because of a real bug. They fade
    // out of the way instead, and come back on touch or focus. Optional and
    // defaulted, because Studio wraps this component and passes no extra props.
    chromeless = false,
    topInset = 0,
    // Chrome that overlays the BOTTOM of the canvas (the selection sheet on a
    // phone). The fit used to centre content in the container's full height,
    // so on a narrow screen the graph landed jammed against the sheet with an
    // empty band above it — it was fitting a rectangle the user could not see.
    bottomInset = 0,
    // Where the mounted panel windows are docked, so the fit can land the graph
    // in the free band instead of centring it underneath one. See
    // getGraphEdgeInsets — a corridor that is wide enough but off-centre still
    // buries the cards, which is how a node ends up looking like it has no
    // connectors. Studio passes nothing and keeps the old full-box behaviour.
    contentInsets = null,
    // Skips the auto-fit and starts at a fixed zoom. Only for tests and for
    // callers that restore a saved viewport; normal use fits on mount.
    initialZoom = null,
    nodes = [],
    edges = [],
    // THE THINGS IN THE ROOM, as cards (src/raw/utils/objectCards.js). A
    // project holds things (Studio's objects) beside its nodes, and this
    // surface drew only nodes — so a room of Studio things opened here as an
    // empty grid. They arrive as their OWN pass rather than mixed into
    // `nodes`: a thing has no ports, no wires and no inside, so a node's body
    // would promise connections it cannot make. Positions are worked out by
    // the caller and never saved. Optional and defaulted: Studio wraps this
    // surface read-only and passes none.
    objectCards = [],
    selectedObjectId = null,
    onSelectObject = null,
    // How many nodes each node contains, by node id. Optional and defaulted:
    // Studio wraps this component read-only and passes nothing, and must keep
    // rendering exactly as before.
    childCounts = null,
    // EVERY node in the document, not the scoped card list. A container's ports
    // come from the doorway nodes INSIDE it, and those live in a different
    // scope from the container's own card — so the scoped list would find none
    // of them and the feature would fail in total silence, with every unit test
    // still green. Optional and defaulted: Studio wraps this read-only.
    portScopeNodes = null,
    selectedNodeId = null,
    emptyHint = 'Cursor is material. Double-click to place nodes.',
    onExplainScope = null,
    onSelectNode,
    // A plain tap/click on empty canvas clears the selection — the phone has
    // no Escape key, and the inspector sheet otherwise has no way to close
    // (audit 08-21). Optional: Studio wraps this read-only and passes none.
    onClearSelection = null,
    // Bumped by the editor after it inserts a whole graph at once (the
    // all-nodes example): the single-fit-per-scope guard is right for editing,
    // wrong for an insertion that lands mostly off-screen.
    fitSignal = null,
    onEnterNode,
    // The canvas keys' callbacks (input/keymap.js): U, N/F2, ?.
    onLeaveScope = null,
    onRenameNode = null,
    onShowKeys = null,
    // Middle-click a card: what it reads and gives (the reading sheet).
    onShowReading = null,
    // Right-click a card: Duplicate (RawEditor's handleDuplicateNode).
    onDuplicateNode = null,
    // A Geo card's way into Studio, standing inside that Geo (owner's decision
    // 2026-10-02). Optional: Studio's read-only wrapper and a local canvas,
    // which has no Studio twin, pass none and no button is drawn.
    onOpenInStudio = null,
    // Optional, like every other handler here: Studio wraps this read-only and
    // passes none, so no menu is offered there at all.
    onPromotePort = null,
    // Builds a worked example on a blank canvas. Optional: Studio wraps this
    // read-only and offers nothing.
    onMakeScene = null,
    onCreateEdge,
    onDeleteEdge,
    onDeleteNode,
    onMoveNode,
    onDoubleClick,
    // Kantan Mapper-style active marker: for scope-repeatable types where
    // exactly one "active" result is wanted (world.light/background/grid),
    // isNodeActive(node) says whether this card is the active one and
    // onSetActive(node) marks it so. activeMarkerTypeIds gates which cards
    // even show the toggle — most node types have no such concept.
    isNodeActive = () => false,
    onSetActive = () => {},
    activeMarkerTypeIds = [],
    // The canvas viewport, published upward so the editor can place things
    // that live in graph space but are not cards — the panel windows. Called
    // with { panX, panY, zoom, originLeft, originTop } on every change and on
    // resize; origin is this surface's box in the page. Optional: Studio's
    // read-only wrapper passes nothing.
    onViewportChange = null,
    // Graph-space rectangles that count as content for fit-all, so a world
    // window parked away from the cards is framed too. [{ x, y, width, height }]
    extraBounds = []
}) {
    const { requestDelete, deleteConfirm } = useDeleteConfirm()
    const containerRef = useRef(null)
    const [pendingWire, setPendingWire] = useState(null)
    const [draggingNodeId, setDraggingNodeId] = useState(null)
    const [isPanning, setIsPanning] = useState(false)
    const [isPanMoving, setIsPanMoving] = useState(false)
    const [hoveredWireId, setHoveredWireId] = useState(null)
    // A wire is removed in two steps: a click (a tap) MARKS it and shows a
    // Remove button where it was touched; the button or Delete removes it. One
    // click used to remove it outright — fine with a mouse, whose hover had
    // already turned it red, but a finger has no hover, so on a phone a tap
    // anywhere on a 24px band deleted a wire with no warning (audit
    // 2026-10-02). Select, then delete: how Blender and Unreal treat a link.
    const [armedWire, setArmedWire] = useState(null)
    const middlePressRef = useRef(null)
    // THE right-click menus (docs/raw/2026-10-02-keys-and-mouse.md): one per
    // thing under the pointer — empty canvas, a card, a wire — built here from
    // the same actions the keys use, each item showing its key (keymap.js).
    // Ports keep their own menu; windows' keys are their own. A long press is
    // the right-click on touch.
    const [contextMenu, setContextMenu] = useState(null)
    const dragOffsetRef = useRef({ x: 0, y: 0 })
    // Last pointer position of a card drag (client px), whether a move has
    // arrived yet (`live`), and the auto-pan clock (`last`).
    const dragPanRef = useRef({ x: 0, y: 0, live: false, last: 0 })
    // pendingWire mirrored into a ref: the window-level pointerup handler is
    // registered once per drag and would otherwise close over a stale value.
    const pendingWireRef = useRef(null)
    const pointersRef = useRef(new Map())
    const pinchRef = useRef(null)
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
    const hasFitRef = useRef(false)
    const lastFitViewportRef = useRef(null)
    const lastFitInsetsRef = useRef(null)
    // The visible box at the last fit or resize, so a resize knows what it was
    // before and which graph point sat in the middle of it.
    const lastBoxRef = useRef(null)
    const [panX, setPanX] = useState(60)
    const [panY, setPanY] = useState(60)
    const [zoom, setZoom] = useState(initialZoom ?? 1)
    // viewportRef mirrors pan+zoom synchronously so event handlers always read current values
    const viewportRef = useRef({ panX: 60, panY: 60, zoom: initialZoom ?? 1 })
    // How much of the graph the last fit could show, and why — drives the
    // transient "showing 5 of 33" line rather than silently lying about it.
    // Detail tier, carried in state rather than derived inline so the previous
    // tier is available for hysteresis and the markup does not flicker while a
    // pinch sits on a threshold.
    const [tier, setTier] = useState(() => lodTierForZoom(initialZoom ?? 1))
    useEffect(() => { setTier((previous) => lodTierForZoom(zoom, previous)) }, [zoom])

    // Everything the view has to hold, both kinds. Only the FIT and the
    // is-this-canvas-empty question use it — wires and ports stay on `nodes`
    // alone, because only nodes have any.
    const cardsInView = useMemo(
        () => (objectCards.length ? [...nodes, ...objectCards] : nodes),
        [nodes, objectCards]
    )

    const nodeById = useMemo(() => {
        const map = new Map()
        for (const node of nodes) map.set(node.id, node)
        return map
    }, [nodes])

    const clientPointToGraphPoint = (clientX, clientY) => {
        const rect = containerRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 }
        const vp = viewportRef.current
        return {
            x: (clientX - rect.left - vp.panX) / vp.zoom,
            y: (clientY - rect.top - vp.panY) / vp.zoom
        }
    }

    const applyViewport = (nextPanX, nextPanY, nextZoom) => {
        const clamped = clamp(nextZoom, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM)
        viewportRef.current = { panX: nextPanX, panY: nextPanY, zoom: clamped }
        setPanX(nextPanX)
        setPanY(nextPanY)
        setZoom(clamped)
    }

    // Publish the viewport whenever it moves — through applyViewport OR the
    // pan drag, which writes the ref directly; both end in these three state
    // values, so keying on them catches every path. Resize republishes the
    // origin, which is the only part that can change without a pan.
    useEffect(() => {
        if (!onViewportChange) return undefined
        const publish = () => {
            const rect = containerRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 }
            const vp = viewportRef.current
            onViewportChange({ panX: vp.panX, panY: vp.panY, zoom: vp.zoom, originLeft: rect.left, originTop: rect.top })
        }
        publish()
        window.addEventListener('resize', publish)
        return () => window.removeEventListener('resize', publish)
    }, [onViewportChange, panX, panY, zoom])

    const updateZoom = (nextZoom) => {
        const vp = viewportRef.current
        const container = containerRef.current
        const rect = container?.getBoundingClientRect() || { width: 800, height: 600 }
        const cx = rect.width / 2
        const cy = rect.height / 2
        const clamped = clamp(nextZoom, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM)
        const scale = clamped / vp.zoom
        applyViewport(cx - (cx - vp.panX) * scale, cy - (cy - vp.panY) * scale, clamped)
    }

    // Bounding box of a set of nodes, in graph coordinates.
    const boundsOf = (subset) => {
        if (!subset.length) return null
        const minX = Math.min(...subset.map((n) => (n.graphX ?? 0)))
        const minY = Math.min(...subset.map((n) => n.graphY ?? 0))
        const maxX = Math.max(...subset.map((n) => (n.graphX ?? 0) + CARD_WIDTH))
        const maxY = Math.max(...subset.map((n) => (n.graphY ?? 0) + cardHeight(n, portScopeNodes)))
        return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
    }

    // Widen a bounds box to include the world windows, so fit-all frames the
    // whole desk and not just the cards.
    const withExtraBounds = (bounds) => {
        const rects = (extraBounds || []).filter((r) => r && Number.isFinite(r.x) && Number.isFinite(r.y))
        if (!bounds || !rects.length) return bounds
        const minX = Math.min(bounds.minX, ...rects.map((r) => r.x))
        const minY = Math.min(bounds.minY, ...rects.map((r) => r.y))
        const maxX = Math.max(bounds.maxX, ...rects.map((r) => r.x + (r.width || 0)))
        const maxY = Math.max(bounds.maxY, ...rects.map((r) => r.y + (r.height || 0)))
        return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
    }

    // The rectangle of the container a person can actually SEE — the container
    // minus the chrome painted over it. Fitting to the raw container is why the
    // graph used to land shoved against the bottom sheet with dead space above.
    const visibleBox = () => {
        const rect = containerRef.current?.getBoundingClientRect?.()
        if (!rect?.width || !rect?.height) return null
        // topInset is NOT subtracted here. The surface is positioned with an
        // inline `top: topInset`, so its own rect already begins below the
        // topbar — counting it again pushed every fit down by the topbar's
        // height and left a dead band above the graph.
        //
        // bottomInset IS subtracted: the selection sheet is position:fixed
        // against the viewport, so it genuinely overlaps this element's box.
        // Docked windows are subtracted the same way: the band the graph can
        // actually occupy is the element minus the chrome AND minus whatever
        // is parked against its edges.
        const dockLeft = Math.max(0, contentInsets?.left || 0)
        const dockRight = Math.max(0, contentInsets?.right || 0)
        const dockTop = Math.max(0, contentInsets?.top || 0)
        const bottom = Math.max(0, bottomInset) + Math.max(0, contentInsets?.bottom || 0)
        return {
            width: rect.width,
            height: rect.height,
            // The free band's edges — what is not under a docked window.
            freeLeft: dockLeft,
            freeRight: rect.width - dockRight,
            freeTop: dockTop,
            freeBottom: rect.height - bottom,
            usableWidth: Math.max(1, rect.width - dockLeft - dockRight - GRAPH_FIT_PADDING_PX * 2),
            usableHeight: Math.max(1, rect.height - dockTop - bottom - GRAPH_FIT_PADDING_PX * 2),
            centerX: dockLeft + (rect.width - dockLeft - dockRight) / 2,
            // Centre of the VISIBLE band, not of the element.
            centerY: dockTop + (rect.height - dockTop - bottom) / 2
        }
    }

    // Place a bounding box in the visible band at a given zoom.
    const applyFitTo = (bounds, nextZoom) => {
        const box = visibleBox()
        if (!box || !bounds) return
        const cx = (bounds.minX + bounds.maxX) / 2
        const cy = (bounds.minY + bounds.maxY) / 2
        applyViewport(box.centerX - cx * nextZoom, box.centerY - cy * nextZoom, nextZoom)
        // Remembered so a later change in docked windows can tell whether the
        // person has moved the view since — see the re-fit effect below.
        lastFitViewportRef.current = { ...viewportRef.current }
        lastBoxRef.current = box
    }

    // Has the view stayed exactly where the last fit left it? Then nobody has
    // panned or zoomed since, and re-fitting moves nothing a person chose.
    const isViewAtLastFit = () => {
        const settled = lastFitViewportRef.current
        const now = viewportRef.current
        return Boolean(settled)
            && Math.abs(settled.panX - now.panX) < 0.5
            && Math.abs(settled.panY - now.panY) < 0.5
            && Math.abs(settled.zoom - now.zoom) < 0.001
    }

    // How many cards touch the visible part of the canvas right now.
    const countCardsOnScreen = () => {
        const box = visibleBox()
        if (!box) return 0
        const vp = viewportRef.current
        return cardsInView.filter((node) => {
            const x = (node.graphX ?? 0) * vp.zoom + vp.panX
            const y = (node.graphY ?? 0) * vp.zoom + vp.panY
            const w = CARD_WIDTH * vp.zoom
            const h = cardHeight(node, portScopeNodes) * vp.zoom
            // Only the free band counts: a card under a docked window is not
            // "shown" (it said 8 of 8 with two behind the List).
            return x + w > box.freeLeft && x < box.freeRight && y + h > box.freeTop && y < box.freeBottom
        }).length
    }

    const zoomToFitBounds = (bounds, { maxZoom = 1 } = {}) => {
        const box = visibleBox()
        if (!box || !bounds) return null
        return clamp(
            Math.min(box.usableWidth / bounds.width, box.usableHeight / bounds.height, maxZoom),
            GRAPH_MIN_ZOOM,
            GRAPH_MAX_ZOOM
        )
    }

    /**
     * Fit the graph: everything in view, top-left aligned, 24px in, never
     * magnified past 100% (openingView.js). There is no floor and no "showing N
     * of M": what is too small to read answers with fewer words, not with a
     * partial view (semantic zoom, lodTierForZoom).
     */
    const fitGraph = ({ everything = false } = {}) => {
        if (!cardsInView.length) return
        const box = visibleBox()
        if (!box) return
        const all = withExtraBounds(boundsOf(cardsInView))
        const view = openingView({ bounds: all, box, everything, minZoom: GRAPH_MIN_ZOOM, maxZoom: GRAPH_MAX_ZOOM })
        applyViewport(view.panX, view.panY, view.zoom)
        lastFitViewportRef.current = { ...viewportRef.current }
        lastBoxRef.current = box
    }

    // Zoom to the selected node. Unlike fit-all this is ALLOWED to magnify —
    // framing one card should bring it to a working size, not leave it tiny
    // because the rest of the graph is large.
    const frameSelection = () => {
        const target = nodes.find((node) => node.id === selectedNodeId)
        if (!target) { fitGraph(); return }
        const bounds = boundsOf([target])
        const nextZoom = clamp(
            Math.min(zoomToFitBounds(bounds, { maxZoom: FRAME_MAX_ZOOM }) ?? FRAME_TARGET_ZOOM, FRAME_MAX_ZOOM),
            FIT_MIN_USEFUL_ZOOM,
            FRAME_MAX_ZOOM
        )
        applyFitTo(bounds, nextZoom)
    }

    // Fit once per scope. Keyed on the scope's node identity rather than a
    // count: entering a container node is the event worth re-fitting for, and
    // adding a node is emphatically not (no editor re-fits on every create —
    // it would yank the canvas out from under you mid-edit).
    // The key must be the SCOPE, nothing else — a node count or first-node id
    // in here made every create/delete miss the guard and re-fit, which is
    // exactly the yank the comment above forbids.
    const scopeKey = cardsInView.length ? `scope:${nodes[0]?.parentId || 'root'}` : ''
    const insetKey = `${contentInsets?.left || 0}:${contentInsets?.right || 0}:${contentInsets?.top || 0}:${contentInsets?.bottom || 0}`
    useEffect(() => {
        if (initialZoom !== null) return
        if (hasFitRef.current === scopeKey || !containerRef.current || cardsInView.length === 0) return
        if (!visibleBox()) return
        // The card heights come from the card font's own metrics. A fit taken
        // while the font is still arriving measures a fallback and opens at a
        // different zoom than the next load (audit B7: 141 / 115 / 105 / 105 %).
        // The fonts effect below runs this fit once they are in.
        if (document.fonts?.status === 'loading') return
        fitGraph()
        hasFitRef.current = scopeKey
        lastFitInsetsRef.current = insetKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey])

    // Fit after `document.fonts.ready`, and again if a font lands later while
    // the view is still where the last fit left it (nobody has moved it).
    useEffect(() => {
        const fonts = typeof document !== 'undefined' ? document.fonts : null
        if (!fonts || initialZoom !== null) return undefined
        let alive = true
        const settle = () => {
            if (!alive || !cardsInView.length || !containerRef.current) return
            if (hasFitRef.current !== scopeKey) {
                if (!scopeKey || !visibleBox()) return
                fitGraphRef.current()
                hasFitRef.current = scopeKey
                lastFitInsetsRef.current = insetKey
            } else if (isViewAtLastFit()) {
                fitGraphRef.current()
            }
        }
        fonts.ready?.then?.(settle)
        fonts.addEventListener?.('loadingdone', settle)
        return () => { alive = false; fonts.removeEventListener?.('loadingdone', settle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey, insetKey])

    // Windows mount a beat after the graph does, so the first fit runs against
    // the windows that happen to exist YET — on a seeded workspace that was one
    // of two, and the graph got centred into the space the second window was
    // about to occupy. Re-fit when the docked edges change, but ONLY while the
    // view is still exactly where that fit left it: once a person has panned or
    // zoomed, moving the graph under them is the yank the single-fit guard
    // above exists to prevent.
    useEffect(() => {
        if (initialZoom !== null) return
        if (hasFitRef.current !== scopeKey) return
        if (lastFitInsetsRef.current === insetKey) return
        const untouched = isViewAtLastFit()
        lastFitInsetsRef.current = insetKey
        if (untouched) fitGraph()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [insetKey])

    // The browser window changes size under an untouched view — a new window
    // opened small and then tiled to half the screen kept the 49 % fit it got
    // at 800 × 600 (owner's screen, 2026-10-03; 82 % when opened at full size).
    // Same rule as the docked edges: re-fit only while the view is exactly
    // where the last fit left it. Also covers a first fit skipped because the
    // surface had no size yet.
    const fitGraphRef = useRef(fitGraph)
    useEffect(() => { fitGraphRef.current = fitGraph })
    useEffect(() => {
        const element = containerRef.current
        if (!element || typeof ResizeObserver === 'undefined' || initialZoom !== null) return undefined
        let frame = 0
        let lastSize = null
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
                const rect = element.getBoundingClientRect()
                const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`
                if (!rect.width || !rect.height || size === lastSize) return
                const first = lastSize === null
                lastSize = size
                if (hasFitRef.current !== scopeKey) {
                    if (!scopeKey) return
                    fitGraphRef.current()
                    hasFitRef.current = scopeKey
                    lastFitInsetsRef.current = insetKey
                    return
                }
                if (first) return
                const settled = lastFitViewportRef.current
                const now = viewportRef.current
                const untouched = settled
                    && Math.abs(settled.panX - now.panX) < 0.5
                    && Math.abs(settled.panY - now.panY) < 0.5
                    && Math.abs(settled.zoom - now.zoom) < 0.001
                if (untouched) fitGraphRef.current()
            })
        })
        observer.observe(element)
        return () => { cancelAnimationFrame(frame); observer.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey, insetKey])

    // An editor-side insertion of a whole graph (the all-nodes example)
    // lands mostly off-screen if the view stays where it was — the ONE case
    // where re-fitting under the user is the kindness, not the yank: they
    // asked for a graph they have not seen yet.
    const lastFitSignalRef = useRef(fitSignal)
    useEffect(() => {
        if (fitSignal === null || fitSignal === lastFitSignalRef.current) return
        lastFitSignalRef.current = fitSignal
        fitGraph()
        hasFitRef.current = scopeKey
        lastFitInsetsRef.current = insetKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitSignal])

    // A window that changes size keeps its cards (NOPA audit F1, 2026-10-02:
    // 2560 -> 1200 left 2 of 8 cards on screen). Untouched since the last fit,
    // the view fits again — it was a fit, and the fit is what the person saw.
    // Moved by hand, it keeps the zoom and keeps the same graph point in the
    // middle of the canvas (the way a map app keeps its centre on a window
    // resize), and only if that leaves no card at all on screen does it fit.
    // It also catches the first fit that never ran because the canvas had no
    // size when the cards arrived (F2).
    const handleResize = () => {
        if (initialZoom !== null) return
        const box = visibleBox()
        if (!box) return
        const prev = lastBoxRef.current
        lastBoxRef.current = box
        if (!cardsInView.length) return
        if (hasFitRef.current !== scopeKey) {
            fitGraph()
            hasFitRef.current = scopeKey
            lastFitInsetsRef.current = insetKey
            return
        }
        if (!prev || (Math.abs(prev.width - box.width) < 0.5 && Math.abs(prev.height - box.height) < 0.5)) return
        if (isViewAtLastFit()) {
            fitGraph()
            return
        }
        const vp = viewportRef.current
        const graphCentreX = (prev.centerX - vp.panX) / vp.zoom
        const graphCentreY = (prev.centerY - vp.panY) / vp.zoom
        applyViewport(box.centerX - graphCentreX * vp.zoom, box.centerY - graphCentreY * vp.zoom, vp.zoom)
        if (countCardsOnScreen() === 0) fitGraph()
    }
    const resizeHandlerRef = useRef(handleResize)
    useEffect(() => { resizeHandlerRef.current = handleResize })
    useEffect(() => {
        const run = () => resizeHandlerRef.current()
        window.addEventListener('resize', run)
        // The canvas also changes size without the window doing so (the bar
        // above it folds, a sync alert pushes it down).
        let observer = null
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
            observer = new ResizeObserver(run)
            observer.observe(containerRef.current)
        }
        return () => {
            window.removeEventListener('resize', run)
            observer?.disconnect?.()
        }
    }, [])

    // Cards that land after the first fit (a document arriving in parts) can
    // all sit outside a view nobody has touched yet; then show them (F2). Only
    // when NONE is on screen and the view is still the fit's own — adding a
    // card is never a reason to move the canvas under a person.
    useEffect(() => {
        if (initialZoom !== null) return
        if (hasFitRef.current !== scopeKey || !cardsInView.length) return
        if (!isViewAtLastFit()) return
        if (countCardsOnScreen() > 0) return
        fitGraph()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardsInView])

    // The fit notice is transient — it reports on one fit, not a state.

    // Non-passive wheel listener — cursor-anchored zoom, no scroll
    useEffect(() => {
        const container = containerRef.current
        if (!container) return undefined
        const handleWheel = (event) => {
            // Inside a window's BODY the wheel belongs to the panel — a text
            // note scrolls, a list scrolls, the Scene orbits. The frame of a
            // window (title bar, edges) and the canvas zoom the graph. Ctrl
            // (a trackpad pinch arrives as ctrl+wheel) zooms the graph from
            // anywhere, so a pinch over a window still zooms the desk.
            if (!event.ctrlKey && !event.metaKey && event.target?.closest?.('.raw-window-body')) return
            event.preventDefault()
            // Proportional to the delta, not a flat ±10% per event: a trackpad
            // fires dozens of small events per swipe and a flat step made it
            // fly; a mouse notch (deltaY 100) lands near the old step.
            const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
            const magnitude = clamp(Math.abs(event.deltaY) * unit, 1, 120)
            const factor = Math.exp((event.deltaY < 0 ? 1 : -1) * magnitude * 0.0016)
            const vp = viewportRef.current
            const rect = container.getBoundingClientRect()
            const mx = event.clientX - rect.left
            const my = event.clientY - rect.top
            const nextZoom = clamp(vp.zoom * factor, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM)
            const scale = nextZoom / vp.zoom
            applyViewport(mx - (mx - vp.panX) * scale, my - (my - vp.panY) * scale, nextZoom)
        }
        container.addEventListener('wheel', handleWheel, { passive: false })
        return () => container.removeEventListener('wheel', handleWheel)
    }, [])

    // Two-finger pinch zoom + pan. Wheel is the desktop equivalent and does not
    // exist on a phone, so without this the only way to zoom was two 28px
    // buttons in the corner.
    useEffect(() => {
        const container = containerRef.current
        if (!container) return undefined
        const pointers = pointersRef.current

        const midpointOf = (points) => {
            const rect = container.getBoundingClientRect()
            return {
                x: (points[0].x + points[1].x) / 2 - rect.left,
                y: (points[0].y + points[1].y) / 2 - rect.top
            }
        }
        const distanceOf = (points) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)

        const beginPinch = () => {
            const points = [...pointers.values()]
            if (points.length !== 2) return
            const vp = viewportRef.current
            const mid = midpointOf(points)
            pinchRef.current = {
                startDistance: Math.max(distanceOf(points), 1),
                startZoom: vp.zoom,
                // The graph-space point sitting under the initial midpoint. Keep
                // it pinned there for the whole gesture and both zoom anchoring
                // and two-finger panning fall out of the same equation.
                anchorX: (mid.x - vp.panX) / vp.zoom,
                anchorY: (mid.y - vp.panY) / vp.zoom
            }
            // A second finger means navigate, not edit. Cancel whatever the
            // first finger started — now that a press anywhere near a port
            // begins a wire, the opening touch of a pinch would otherwise
            // start dragging one and the pinch would do nothing.
            setIsPanning(false)
            setIsPanMoving(false)
            setDraggingNodeId(null)
            pendingWireRef.current = null
            setPendingWire(null)
        }

        const endPinch = () => { pinchRef.current = null }

        const down = (event) => {
            // Listening on window, not the container, and admitting any second
            // finger once the first is on the canvas.
            //
            // Why: pressing a card selects it, which raises the selection panel
            // — directly under where the second finger is about to land. That
            // finger then hit the panel instead of the canvas, its pointerdown
            // never reached the container, and the pinch silently never began.
            // Pinch-to-zoom therefore worked on empty canvas and failed over an
            // actual graph, which is the only place anyone would use it.
            const insideCanvas = container.contains(event.target)
            if (!insideCanvas && pointers.size === 0) return
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
            if (pointers.size === 2) beginPinch()
            else if (pointers.size > 2) endPinch()
        }

        const move = (event) => {
            if (!pointers.has(event.pointerId)) return
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
            const pinch = pinchRef.current
            if (!pinch) return
            const points = [...pointers.values()]
            if (points.length !== 2) return
            event.preventDefault?.()
            const nextZoom = clamp(
                pinch.startZoom * (distanceOf(points) / pinch.startDistance),
                GRAPH_MIN_ZOOM,
                GRAPH_MAX_ZOOM
            )
            const mid = midpointOf(points)
            applyViewport(mid.x - pinch.anchorX * nextZoom, mid.y - pinch.anchorY * nextZoom, nextZoom)
        }

        const up = (event) => {
            pointers.delete(event.pointerId)
            if (pointers.size < 2) endPinch()
        }

        window.addEventListener('pointerdown', down)
        window.addEventListener('pointermove', move, { passive: false })
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
        return () => {
            window.removeEventListener('pointerdown', down)
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            window.removeEventListener('pointercancel', up)
            pointers.clear()
            endPinch()
        }
    }, [])

    useEffect(() => {
        if (!armedWire && (!selectedNodeId || !onDeleteNode)) return undefined
        const handler = (event) => {
            if (event.key === 'Escape' && armedWire && !event.defaultPrevented) { event.preventDefault(); setArmedWire(null); return }
            if (event.key !== 'Delete' && event.key !== 'Backspace') return
            const target = event.target
            const tag = target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
            // A marked wire goes first: it is what the person just pointed at.
            if (armedWire) {
                onDeleteEdge?.(armedWire.id)
                setArmedWire(null)
                return
            }
            // Only nodes rendered on THIS surface. Selection survives entering
            // a card (pointerdown selects, then dblclick enters), so without
            // this guard Backspace deleted the scope you were standing inside
            // — cascading over its whole subtree and dumping you back to the
            // parent with everything gone.
            if (!onDeleteNode || !nodeById.has(selectedNodeId)) return
            const node = nodeById.get(selectedNodeId)
            requestDelete(
                { id: selectedNodeId, name: node?.label, author: node?.createdBy },
                () => onDeleteNode(selectedNodeId)
            )
        }
        // Capture phase: a marked wire takes Escape (and Delete) before the
        // editor's Escape ladder, which then sees it handled.
        window.addEventListener('keydown', handler, true)
        return () => window.removeEventListener('keydown', handler, true)
    }, [selectedNodeId, onDeleteNode, nodeById, requestDelete, armedWire, onDeleteEdge])

    // The output port nearest a screen point, within the grab radius. Distance
    // is in SCREEN pixels so the tolerance is a fingertip at every zoom.
    const nearestOutputPort = (node, clientX, clientY) => {
        const point = clientPointToGraphPoint(clientX, clientY)
        const radius = PORT_GRAB_RADIUS_PX / viewportRef.current.zoom
        let best = null
        let bestDistance = radius
        for (const port of getNodeOutputs(node, portScopeNodes)) {
            const centre = outputPortCenter(node, port.id, portScopeNodes)
            const distance = Math.hypot(centre.x - point.x, centre.y - point.y)
            if (distance > bestDistance) continue
            bestDistance = distance
            best = port
        }
        return best
    }

    const handleOutputPointerDown = (event, node, port, { fromCard = false } = {}) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        // When the press landed on the card rather than the dot itself, the
        // card is the capture target, so release there too.
        if (fromCard && event.pointerType !== 'mouse') {
            try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* not captured */ }
        }
        // Touch pointers get implicit capture on this dot, which would keep
        // every later pointer event retargeted here. Release it so the drag
        // reads as a normal move across the surface.
        if (event.pointerType !== 'mouse') {
            try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* not captured */ }
        }
        const point = clientPointToGraphPoint(event.clientX, event.clientY)
        const wire = {
            fromNodeId: node.id,
            fromPort: port.id,
            fromPortType: port.type,
            cursorX: point.x,
            cursorY: point.y
        }
        pendingWireRef.current = wire
        setPendingWire(wire)
    }

    // Nearest compatible input port to a release point, or null. Distance is
    // measured in screen pixels so the tolerance stays constant as you zoom.
    const resolveWireDrop = (clientX, clientY, { touch = false } = {}) => {
        const wire = pendingWireRef.current
        if (!wire) return null
        const point = clientPointToGraphPoint(clientX, clientY)
        // A fingertip is not a cursor: double the snap for touch releases
        // (the S24 audit's "flick fails silently" was largely endpoint
        // accuracy against a 36px radius and ~19-physical-px dots).
        const radius = (PORT_DROP_RADIUS_PX * (touch ? 2 : 1)) / viewportRef.current.zoom
        let best = null
        let bestDistance = radius
        for (const node of nodes) {
            if (node.id === wire.fromNodeId) continue
            for (const port of getNodeInputs(node, portScopeNodes)) {
                if (!arePortsCompatible(wire.fromPortType, port.type)) continue
                const center = inputPortCenter(node, port.id, portScopeNodes)
                const distance = Math.hypot(center.x - point.x, center.y - point.y)
                if (distance > bestDistance) continue
                bestDistance = distance
                best = { toNodeId: node.id, toPort: port.id }
            }
        }
        return best
    }

    // A transient, positioned one-liner for a wire that died on release —
    // names the incompatible pair when one was under the finger, otherwise
    // says the plain thing. Self-clears; a new notice replaces the old.
    const [wireNotice, setWireNotice] = useState(null)
    const wireNoticeTimer = useRef(null)
    useEffect(() => () => clearTimeout(wireNoticeTimer.current), [])
    const announceDeadDrop = (wire, clientX, clientY, touch) => {
        const point = clientPointToGraphPoint(clientX, clientY)
        const radius = (PORT_DROP_RADIUS_PX * (touch ? 2 : 1)) / viewportRef.current.zoom
        let near = null
        for (const node of nodes) {
            if (node.id === wire.fromNodeId) continue
            for (const port of getNodeInputs(node, portScopeNodes)) {
                const center = inputPortCenter(node, port.id, portScopeNodes)
                if (Math.hypot(center.x - point.x, center.y - point.y) <= radius) { near = { node, port }; break }
            }
            if (near) break
        }
        const fromType = getPortType(wire.fromPortType)
        const text = near
            ? `${fromType.label} can’t feed ${near.port.label} (${getPortType(near.port.type).label})`
            : 'Wire dropped — release it on a lit port'
        setWireNotice({ x: clientX, y: clientY, text })
        clearTimeout(wireNoticeTimer.current)
        wireNoticeTimer.current = setTimeout(() => setWireNotice(null), 2600)
    }

    const isDraggingWire = Boolean(pendingWire)
    const isDraggingNode = Boolean(draggingNodeId)

    // --- expose a port on the container ------------------------------------
    // Press and hold a port dot (or right-click it) and offer to put it on the
    // container's face, which places the doorway node and its wire for you.
    // Honest about itself: a long press advertises to nobody. It is a shortcut
    // for the gesture people who know it will reach for, not a discovery
    // mechanism — placing an In/Out node by hand from the palette remains the
    // way you FIND this.
    const [portMenu, setPortMenu] = useState(null)
    const longPressRef = useRef(null)

    const cancelLongPress = () => {
        if (!longPressRef.current) return
        clearTimeout(longPressRef.current.timer)
        window.removeEventListener('pointerup', longPressRef.current.cancel)
        window.removeEventListener('pointercancel', longPressRef.current.cancel)
        window.removeEventListener('pointermove', longPressRef.current.move)
        longPressRef.current = null
    }

    const openPortMenu = (next) => {
        // A press on an output dot has already armed a wire, and a press on an
        // input dot falls through to the card drag. Left armed, either creates a
        // plausible-looking wrong edge on the next release anywhere on the
        // canvas, because resolveWireDrop snaps within 36 screen pixels.
        pendingWireRef.current = null
        setPendingWire(null)
        setDraggingNodeId(null)
        cancelLongPress()
        setPortMenu(next)
    }

    const armLongPress = (event, node, port, dir) => {
        if (!onPromotePort) return
        const startX = event.clientX
        const startY = event.clientY
        // Window-level, not on the dot: handleOutputPointerDown releases pointer
        // capture for every non-mouse pointer, so on touch the pointerup is
        // delivered to whatever is under the finger. An element-level cancel
        // would leave the timer armed and pop the menu half a second later over
        // whatever was tapped next.
        const cancel = () => cancelLongPress()
        const move = (moveEvent) => {
            if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 10) cancelLongPress()
        }
        const timer = setTimeout(() => {
            openPortMenu({ node, port, dir, clientX: startX, clientY: startY })
        }, 550)
        longPressRef.current = { timer, cancel, move }
        window.addEventListener('pointerup', cancel)
        window.addEventListener('pointercancel', cancel)
        window.addEventListener('pointermove', move)
    }

    useEffect(() => cancelLongPress, [])

    const shouldStartPan = (event) => {
        const target = event.target
        if (target?.closest?.('.raw-graph-zoom-controls')) return false
        // The menu is a sibling of .raw-graph-stage, which carries the pan/zoom
        // transform — without this, tapping an item pans the canvas.
        if (target?.closest?.('.raw-graph-port-menu')) return false
        if (event.button === 1) return true
        if (event.button !== 0) return false
        return !target?.closest?.('.raw-graph-node-card')
    }

    const handleSurfacePointerDown = (event) => {
        if (!shouldStartPan(event) || isDraggingWire) return
        if (event.detail >= 2) return
        // A second finger landing turns the gesture into a pinch, not a pan.
        if (pointersRef.current.size > 1 || pinchRef.current) return
        event.preventDefault()
        const vp = viewportRef.current
        panStartRef.current = { x: event.clientX, y: event.clientY, panX: vp.panX, panY: vp.panY }
        setIsPanning(true)
        setIsPanMoving(false)
        // A press on the background that never travels is a tap, and a tap on
        // the background means "nothing selected" — the one deselect a phone
        // can reach (Escape needs a keyboard; audit 08-21). Registered HERE,
        // synchronously: a quick tap's pointerup beats the React effect that
        // attaches the pan listeners, so the pan path cannot see it.
        const downX = event.clientX
        const downY = event.clientY
        const onceUp = (upEvent) => {
            window.removeEventListener('pointerup', onceUp)
            window.removeEventListener('pointercancel', cancelTap)
            if (Math.hypot(upEvent.clientX - downX, upEvent.clientY - downY) < 8) onClearSelection?.()
        }
        const cancelTap = () => {
            window.removeEventListener('pointerup', onceUp)
            window.removeEventListener('pointercancel', cancelTap)
        }
        window.addEventListener('pointerup', onceUp)
        window.addEventListener('pointercancel', cancelTap)
    }
    
    useEffect(() => {
        if (!isDraggingWire) return undefined
        const move = (event) => {
            const point = clientPointToGraphPoint(event.clientX, event.clientY)
            setPendingWire((current) => current ? {
                ...current,
                cursorX: point.x,
                cursorY: point.y
            } : current)
        }
        const up = (event) => {
            const wire = pendingWireRef.current
            const touch = event.pointerType !== 'mouse'
            const target = resolveWireDrop(event.clientX, event.clientY, { touch })
            pendingWireRef.current = null
            setPendingWire(null)
            if (!wire) return
            if (!target) {
                // The wire died — say why, where it died. Two silent failure
                // modes (missed vs incompatible) looked identical on touch.
                announceDeadDrop(wire, event.clientX, event.clientY, touch)
                return
            }
            onCreateEdge?.({
                fromNodeId: wire.fromNodeId,
                fromPort: wire.fromPort,
                toNodeId: target.toNodeId,
                toPort: target.toPort
            })
            // The drop may have LANDED somewhere other than where it was
            // aimed: the nearest port under the finger can be incompatible,
            // and the snap quietly walks to the nearest compatible one (a
            // wire aimed at Size landed on Roughness in the 08-21 audit,
            // without a word). The wire is still made — often it is what was
            // wanted — but the redirect is said out loud.
            const point = clientPointToGraphPoint(event.clientX, event.clientY)
            const radius = (PORT_DROP_RADIUS_PX * (touch ? 2 : 1)) / viewportRef.current.zoom
            let aimed = null
            let aimedDistance = radius
            for (const node of nodes) {
                if (node.id === wire.fromNodeId) continue
                for (const port of getNodeInputs(node, portScopeNodes)) {
                    const center = inputPortCenter(node, port.id, portScopeNodes)
                    const distance = Math.hypot(center.x - point.x, center.y - point.y)
                    if (distance > aimedDistance) continue
                    aimedDistance = distance
                    aimed = { node, port }
                }
            }
            if (aimed && (aimed.node.id !== target.toNodeId || aimed.port.id !== target.toPort)
                && !arePortsCompatible(wire.fromPortType, aimed.port.type)) {
                const landedNode = nodeById.get(target.toNodeId)
                const landedPort = landedNode
                    ? getNodeInputs(landedNode, portScopeNodes).find((p) => p.id === target.toPort)
                    : null
                setWireNotice({
                    x: event.clientX,
                    y: event.clientY,
                    text: `${aimed.port.label} can’t take ${getPortType(wire.fromPortType).label} — wired to ${landedPort?.label || target.toPort} instead`
                })
                clearTimeout(wireNoticeTimer.current)
                wireNoticeTimer.current = setTimeout(() => setWireNotice(null), 3200)
            }
        }
        const cancel = () => {
            pendingWireRef.current = null
            setPendingWire(null)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', cancel)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            window.removeEventListener('pointercancel', cancel)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDraggingWire, nodes, onCreateEdge])

    useEffect(() => {
        if (!isDraggingNode) return undefined
        // rAF-gated: raw pointermove can fire far more often than the display
        // refresh rate (high-poll-rate mice/trackpads), and each call was
        // committing a document op + re-evaluating the whole node graph --
        // capping to one commit per animation frame is a real, safe win with
        // no change in drag responsiveness (2026-07-17 perf audit).
        let rafId = null
        let pendingPos = null
        const flush = () => {
            rafId = null
            if (!pendingPos) return
            const { nextX, nextY } = pendingPos
            pendingPos = null
            onMoveNode?.(draggingNodeId, nextX, nextY)
        }
        // The pointer and the pan clock live in refs: every committed move
        // changes `nodes`, which re-runs this effect, and a pointer held still
        // at the edge must keep panning across that.
        const drag = dragPanRef
        let panRaf = null
        // Where the card wants to be for the pointer as it is NOW and the
        // viewport as it is NOW, kept GRAB_PX inside the canvas (utils/dragClamp.js).
        const commitWanted = () => {
            const point = clientPointToGraphPoint(drag.current.x, drag.current.y)
            const rect = containerRef.current?.getBoundingClientRect?.()
            const vp = viewportRef.current
            const wanted = dragClamp(
                { x: point.x - dragOffsetRef.current.x, y: point.y - dragOffsetRef.current.y },
                { rect, panX: vp.panX, panY: vp.panY, zoom: vp.zoom }
            )
            pendingPos = { nextX: wanted.x, nextY: wanted.y }
        }
        // Edge auto-pan: while the pointer rests in the band at an edge (or
        // past it, off the canvas) the canvas pans under it and the card follows.
        const panTick = (now) => {
            panRaf = null
            if (!drag.current.live) return
            const velocity = edgePanVelocity(drag.current, containerRef.current?.getBoundingClientRect?.())
            if (!velocity) { drag.current.last = 0; return }
            const dt = drag.current.last ? Math.min(now - drag.current.last, 50) : 16
            drag.current.last = now
            const vp = viewportRef.current
            applyViewport(vp.panX + velocity.vx * dt / 1000, vp.panY + velocity.vy * dt / 1000, vp.zoom)
            commitWanted()
            flush()
            panRaf = requestAnimationFrame(panTick)
        }
        const armPan = () => {
            if (panRaf === null && edgePanVelocity(drag.current, containerRef.current?.getBoundingClientRect?.())) {
                panRaf = requestAnimationFrame(panTick)
            }
        }
        const move = (event) => {
            if (pinchRef.current) return
            const node = nodeById.get(draggingNodeId)
            if (!node) return
            drag.current.x = event.clientX
            drag.current.y = event.clientY
            drag.current.live = true
            commitWanted()
            if (rafId === null) rafId = requestAnimationFrame(flush)
            armPan()
        }
        if (drag.current.live) armPan()
        const up = () => {
            if (panRaf !== null) { cancelAnimationFrame(panRaf); panRaf = null }
            if (rafId !== null) { cancelAnimationFrame(rafId); flush() }
            drag.current.live = false
            drag.current.last = 0
            setDraggingNodeId(null)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId)
            if (panRaf !== null) cancelAnimationFrame(panRaf)
            window.removeEventListener('pointercancel', up)
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [isDraggingNode, draggingNodeId, nodeById, onMoveNode])

    useEffect(() => {
        if (!isPanning) return undefined
        const move = (event) => {
            if (pinchRef.current) return
            setIsPanMoving(true)
            const dx = event.clientX - panStartRef.current.x
            const dy = event.clientY - panStartRef.current.y
            panStartRef.current.moved = Math.max(panStartRef.current.moved || 0, Math.hypot(dx, dy))
            const nx = panStartRef.current.panX + dx
            const ny = panStartRef.current.panY + dy
            viewportRef.current.panX = nx
            viewportRef.current.panY = ny
            setPanX(nx)
            setPanY(ny)
        }
        const up = () => {
            setIsPanning(false)
            setIsPanMoving(false)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [isPanning])

    const wires = useMemo(() => {
        const out = []
        for (const edge of edges) {
            const fromNode = nodeById.get(edge.fromNodeId)
            const toNode = nodeById.get(edge.toNodeId)
            if (!fromNode || !toNode) continue
            const from = outputPortCenter(fromNode, edge.fromPort, portScopeNodes)
            const to = inputPortCenter(toNode, edge.toPort, portScopeNodes)
            const fromPort = getNodeOutputs(fromNode, portScopeNodes).find((p) => p.id === edge.fromPort)
            const color = fromPort ? getPortType(fromPort.type).color : '#999'
            out.push({ id: edge.id, from, to, color })
        }
        return out
    }, [edges, nodeById, portScopeNodes])

    const pendingFromPos = pendingWire ? outputPortCenter(nodeById.get(pendingWire.fromNodeId) || {}, pendingWire.fromPort, portScopeNodes) : null

    const handleSectionDoubleClick = (event) => {
        if (!onDoubleClick) return
        // Chrome that sits ON the surface still bubbles its clicks to it, so
        // two quick taps on the zoom buttons — an entirely reasonable way to
        // zoom out on a phone, where there is no wheel — counted as a
        // double-click on the canvas and opened the create palette over the
        // graph. shouldStartPan already excludes these controls from panning;
        // node creation needs the same exclusion.
        if (event.target?.closest?.('.raw-graph-zoom-controls')) return
        // …and the port menu, or a double-tap on an item opens the create
        // palette over the graph behind it.
        if (event.target?.closest?.('.raw-graph-port-menu')) return
        // …and a thing's card: a double-tap on it is two selects, not a
        // request to place a node on top of it.
        if (event.target?.closest?.('.raw-graph-object-card')) return
        const graphPoint = clientPointToGraphPoint(event.clientX, event.clientY)
        // Keep the whole card inside the part of the canvas you can SEE.
        // Double-tapping near an edge used to put the new card half off-screen,
        // so the thing you just made was partly unreachable.
        const rect = containerRef.current?.getBoundingClientRect?.()
        const clamped = { x: graphPoint.x, y: graphPoint.y }
        if (rect?.width && rect?.height) {
            // The card is placed CENTRED on this point by the caller, so the
            // usable band is inset by half a card on each side.
            const halfCard = CARD_WIDTH / 2
            const topLeft = clientPointToGraphPoint(rect.left + GRAPH_FIT_PADDING_PX, rect.top + GRAPH_FIT_PADDING_PX)
            // On a coarse pointer the docked inspector is ABOUT to appear
            // (creating selects the new card), covering the lower band of the
            // canvas — reserve that band now or the card lands occluded (3 of
            // 3 creations on the S24 audit: cube invisible, ports behind the
            // zoom bar, door behind the zoom bar).
            const coarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches
            const reservedBottom = Math.max(Math.max(0, bottomInset), coarsePointer ? rect.height * 0.45 : 0)
            const bottomRight = clientPointToGraphPoint(
                rect.right - GRAPH_FIT_PADDING_PX,
                rect.bottom - GRAPH_FIT_PADDING_PX - reservedBottom
            )
            const minX = topLeft.x + halfCard
            const maxX = bottomRight.x - halfCard
            const minY = topLeft.y + HEADER_HEIGHT
            const maxY = bottomRight.y - HEADER_HEIGHT
            if (maxX > minX) clamped.x = clamp(graphPoint.x, minX, maxX)
            if (maxY > minY) clamped.y = clamp(graphPoint.y, minY, maxY)
            // On a phone the usable band is narrower than a card, so every
            // placement clamps to nearly the same point and new cards land ON
            // TOP of the last one (3 of 3 on the 08-21 audit). Placement is a
            // suggestion, occupancy is a fact: walk down (then wrap right)
            // until the spot is not already the centre of someone's card.
            // The point is where the new card's MIDDLE will be (the editor
            // centres it — cardPlacement.js), so it is compared with each
            // card's middle, not its top-left corner.
            const occupied = (x, y) => nodes.some((other) =>
                Math.abs((other.graphX ?? 0) + CARD_WIDTH / 2 - x) < CARD_WIDTH * 0.6
                && Math.abs((other.graphY ?? 0) + cardHeight(other, portScopeNodes) / 2 - y) < HEADER_HEIGHT + PORT_ROW_HEIGHT * 2)
            let guard = 0
            while (occupied(clamped.x, clamped.y) && guard < 24) {
                guard += 1
                const stepped = clamped.y + HEADER_HEIGHT + PORT_ROW_HEIGHT * 3
                if (maxY > minY && stepped > maxY) {
                    clamped.y = minY
                    const shifted = clamped.x + CARD_WIDTH * 0.6
                    clamped.x = (maxX > minX && shifted > maxX) ? minX : shifted
                } else {
                    clamped.y = stepped
                }
            }
        }
        onDoubleClick({ clientX: event.clientX, clientY: event.clientY, graphX: clamped.x, graphY: clamped.y })
    }

    // Two taps on a phone must equal a double-click — the browser cannot be
    // trusted to synthesize dblclick from touch (dead on the 08-20 real-phone
    // test). The tracker also guards against Chromium firing BOTH paths.
    const doubleTap = useMemo(() => createTapTracker(), [])

    const canvasMenuItems = (clientX, clientY) => [
        onDoubleClick ? { id: 'add', label: 'Add a node here', kb: keyHint('add'), run: () => onDoubleClick({ clientX, clientY }) } : null,
        { sep: true },
        { id: 'fitAll', label: 'Fit everything', kb: keyHint('fitAll'), run: () => fitGraph({ everything: true }) },
        { id: 'frameSelected', label: 'Frame the selected node', kb: keyHint('frameSelected'), disabled: !selectedNodeId, run: () => frameSelection() },
        { id: 'zoom100', label: 'Zoom 100%', kb: keyHint('zoom100'), run: () => updateZoom(1) },
        onLeaveScope ? { id: 'leave', label: 'Leave this level', kb: keyHint('leave'), run: () => onLeaveScope() } : null,
        { sep: true },
        onShowKeys ? { id: 'keys', label: 'Keys and mouse', kb: keyHint('keys'), run: () => onShowKeys() } : null,
    ].filter(Boolean)

    const cardMenuItems = (node) => {
        return [
            // One word, one meaning for every kind (audit 2026-10-05 B2).
            onEnterNode ? { id: 'enter', label: 'Open', kb: keyHint('enter'), run: () => onEnterNode(node.id) } : null,
            onShowReading ? { id: 'reading', label: 'What it reads and gives', hint: 'middle-click', run: () => onShowReading(node.id) } : null,
            activeMarkerTypeIds.includes(node.typeId) && onSetActive ? { id: 'live', label: isNodeActive(node) ? 'Active here' : 'Make this the active one', disabled: isNodeActive(node), run: () => onSetActive(node) } : null,
            { sep: true },
            onRenameNode ? { id: 'rename', label: 'Rename', kb: keyHint('rename'), run: () => onRenameNode(node.id) } : null,
            onDuplicateNode ? { id: 'duplicate', label: 'Duplicate', kb: keyHint('duplicate'), run: () => onDuplicateNode(node.id) } : null,
            { sep: true },
            onDeleteNode ? {
                id: 'delete', label: 'Delete', kb: 'Del', danger: true,
                run: () => requestDelete({ id: node.id, name: node.label, author: node.createdBy }, () => onDeleteNode(node.id))
            } : null,
        ].filter(Boolean)
    }

    const wireMenuItems = (edge) => {
        const from = nodeById.get(edge.fromNodeId)
        const to = nodeById.get(edge.toNodeId)
        return [
            from && onSelectNode ? { id: 'from', label: `Select where it comes from: ${from.label || 'node'}`, run: () => onSelectNode(from.id) } : null,
            to && onSelectNode ? { id: 'to', label: `Select where it goes: ${to.label || 'node'}`, run: () => onSelectNode(to.id) } : null,
            { sep: true },
            onDeleteEdge ? { id: 'remove', label: 'Remove wire', kb: 'Del', danger: true, run: () => onDeleteEdge(edge.id) } : null,
        ].filter(Boolean)
    }

    // What is under the pointer decides the menu. Typing, windows and ports
    // keep their own right-click (a port's menu stops the event itself).
    const openContextMenuAt = (target, clientX, clientY) => {
        if (isTypingTarget(target) || target?.closest?.('.raw-window') || target?.closest?.('.raw-graph-port-dot')) return false
        const cardEl = target?.closest?.('[data-card-id]')
        const wireEl = target?.closest?.('[data-wire-id]')
        if (cardEl) {
            const node = nodeById.get(cardEl.getAttribute('data-card-id'))
            if (!node) return false
            onSelectNode?.(node.id)
            setContextMenu({ x: clientX, y: clientY, title: node.label || getNodeType(node.typeId)?.label, items: cardMenuItems(node) })
            return true
        }
        if (wireEl) {
            const edge = edges.find((candidate) => candidate.id === wireEl.getAttribute('data-wire-id'))
            if (!edge) return false
            setArmedWire(null)
            setContextMenu({ x: clientX, y: clientY, title: 'Wire', items: wireMenuItems(edge) })
            return true
        }
        setContextMenu({ x: clientX, y: clientY, items: canvasMenuItems(clientX, clientY) })
        return true
    }
    const longPress = useLongPress(({ clientX, clientY, target }) => openContextMenuAt(target, clientX, clientY))

    const handleSectionKeyDown = (event) => {
        if ((event.key === '+' || event.key === '=') && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            updateZoom(zoom + GRAPH_ZOOM_STEP)
            return
        }
        if (event.key === '-' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            updateZoom(zoom - GRAPH_ZOOM_STEP)
            return
        }
        // The canvas keys (input/keymap.js). Only here, on the canvas's own
        // handler, so they act while the canvas has focus (WCAG 2.1.4) — never
        // while typing, never inside a window, whose keys are its own.
        if (!isTypingTarget(event.target) && !event.target?.closest?.('.raw-window')) {
            const selected = selectedNodeId && nodeById.has(selectedNodeId) ? selectedNodeId : null
            const act = (fn) => { event.preventDefault(); fn() }
            if (matchesKeyId(event, 'fitAll')) return act(() => fitGraph({ everything: true }))
            if (matchesKeyId(event, 'frameSelected')) return act(() => (selected ? frameSelection() : fitGraph({ everything: true })))
            if (matchesKeyId(event, 'zoom100')) return act(() => updateZoom(1))
            if (matchesKeyId(event, 'enter') && selected && onEnterNode) return act(() => onEnterNode(selected))
            if (matchesKeyId(event, 'leave') && onLeaveScope) return act(() => onLeaveScope())
            if (matchesKeyId(event, 'rename') && selected && onRenameNode) return act(() => onRenameNode(selected))
            if (matchesKeyId(event, 'keys') && onShowKeys) return act(() => onShowKeys())
        }
        if (event.key !== 'Enter' || event.target !== event.currentTarget || !onDoubleClick) return
        const rect = event.currentTarget.getBoundingClientRect()
        onDoubleClick({
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        })
    }

    const handleNodeKeyDown = (event, nodeId) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        // Enter opens, the same as a double-click (audit 2026-10-05 B2);
        // Space selects.
        if (event.key === 'Enter' && onEnterNode) {
            onEnterNode(nodeId)
            return
        }
        onSelectNode?.(nodeId)
    }

    return (
        <div
            className="raw-graph-surface"
            ref={containerRef}
            role="button"
            tabIndex={0}
            aria-label="Create a graph node"
            style={{
                top: `${topInset}px`,
                // Published so on-canvas controls can sit clear of whatever is
                // covering the bottom of the canvas. Selecting a node used to
                // raise a sheet directly over the zoom controls — i.e. the act
                // of selecting something took the zoom away from you.
                '--raw-bottom-chrome': `${bottomInset}px`,
                cursor: (draggingNodeId || isPanMoving) ? 'grabbing' : undefined
            }}
            onDoubleClick={(event) => {
                if (doubleTap.justFired()) return
                handleSectionDoubleClick(event)
            }}
            onKeyDown={handleSectionKeyDown}
            onMouseDown={(event) => {
                // Remember where a middle press began: a click (no travel) on a
                // card asks for its reading; a drag is the pan, as before.
                if (event.button === 1) middlePressRef.current = { x: event.clientX, y: event.clientY }
                // Back/Forward (buttons 3/4) must not navigate the browser away.
                if (event.button === 3 || event.button === 4) event.preventDefault()
            }}
            onMouseUp={(event) => {
                if (event.button === 3) {
                    // Mouse Back = leave one level (input/keymap.js 'leave').
                    event.preventDefault()
                    onLeaveScope?.()
                    return
                }
                if (event.button === 4) event.preventDefault()
                if (event.button !== 1 || !middlePressRef.current) return
                const start = middlePressRef.current
                middlePressRef.current = null
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
                const card = event.target?.closest?.('[data-card-id]')
                if (card && onShowReading) {
                    event.preventDefault()
                    onShowReading(card.getAttribute('data-card-id'))
                }
            }}
            onContextMenu={(event) => {
                if (openContextMenuAt(event.target, event.clientX, event.clientY)) event.preventDefault()
            }}
            onPointerMove={(event) => longPress.onPointerMove?.(event)}
            onClickCapture={(event) => longPress.onClickCapture?.(event)}
            onPointerDown={(event) => {
                if (!event.target?.closest?.('.raw-graph-port-dot')) longPress.onPointerDown?.(event)
                // Anywhere but the Remove button lets go of a marked wire.
                if (armedWire && !event.target?.closest?.('.raw-wire-remove')) setArmedWire(null)
                doubleTap.down(event)
                handleSurfacePointerDown(event)
            }}
            onPointerUp={(event) => {
                longPress.onPointerUp?.(event)
                if (doubleTap.up(event)) handleSectionDoubleClick(event)
            }}
            onPointerCancel={(event) => {
                longPress.onPointerCancel?.(event)
                doubleTap.cancel(event)
            }}
        >
            <ContextMenu
                open={Boolean(contextMenu)}
                x={contextMenu?.x || 0}
                y={contextMenu?.y || 0}
                title={contextMenu?.title}
                items={contextMenu?.items || []}
                onClose={() => setContextMenu(null)}
            />
            {armedWire && edges.some((edge) => edge.id === armedWire.id) ? (
                <button
                    type="button"
                    className="raw-wire-remove"
                    style={{ left: `${armedWire.x}px`, top: `${armedWire.y}px` }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation()
                        onDeleteEdge?.(armedWire.id)
                        setArmedWire(null)
                    }}
                >
                    Remove wire
                </button>
            ) : null}
            {wireNotice ? (
                <div className="raw-wire-notice" style={{ left: `${wireNotice.x}px`, top: `${wireNotice.y}px` }} role="status">
                    {wireNotice.text}
                </div>
            ) : null}
            <div className={`raw-graph-zoom-controls${chromeless ? ' is-chromeless' : ''}`}>
                <button type="button" className="raw-zoom-cell raw-zoom-step" aria-label="Zoom out" onClick={() => updateZoom(zoom - GRAPH_ZOOM_STEP)}>−</button>
                <button type="button" className="raw-zoom-cell raw-graph-zoom-value" aria-label="Reset zoom to 100%" title="Reset to 100%" onClick={() => updateZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button type="button" className="raw-zoom-cell raw-zoom-step" aria-label="Zoom in" onClick={() => updateZoom(zoom + GRAPH_ZOOM_STEP)}>+</button>
                {/* The button is a request to see EVERYTHING, so it fits all
                    the cards at whatever zoom that takes (Figma's Shift+1 and
                    TouchDesigner's Home do the same). The legible floor stays
                    for the fits nobody asked for — opening, resizing. The
                    selection is framed by the F key (the ◎ button went: one
                    strip, [−] [100%] [+] [Fit], audit §3.8). */}
                <button type="button" className="raw-zoom-cell raw-zoom-fit" aria-label="Fit graph" title="Fit the whole graph (H)" onClick={() => fitGraph({ everything: true })}>Fit</button>
            </div>
            {cardsInView.length === 0 ? (
                // A blank workspace opens in ZEN, where there is NO topbar — so
                // the ⋯ menu, and everything in it, does not exist for the
                // person most likely to need it. The one offer that matters has
                // to live here, on the canvas they are actually looking at.
                <div className="raw-empty-state">
                    <p>{emptyHint}</p>
                    <div className="raw-empty-state-actions">
                        {/* First, because inside a node that has no inside it is
                            the answer to the question the person is standing in
                            front of; the offer to build something is the answer
                            to a different one. Both optional: Studio wraps this
                            component read-only and passes no handlers. */}
                        {onExplainScope ? (
                            <button type="button" onClick={onExplainScope}>What it&apos;s made of</button>
                        ) : null}
                        {onMakeScene ? (
                            <button type="button" onClick={onMakeScene}>Build an example</button>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <div
                className="raw-graph-stage"
                style={{ transform: `translate(${panX}px,${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}
            >
                    <svg
                        // 1×1, not 100%: the stage collapses to zero height (all
                        // children are absolute) and Chromium paints NOTHING inside
                        // a zero-area svg — overflow:visible only works with area.
                        style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', pointerEvents: 'none', overflow: 'visible' }}
                    >
                        {wires.map((wire) => {
                            const isHovered = hoveredWireId === wire.id || armedWire?.id === wire.id
                            const path = buildWirePath(wire.from, wire.to)
                            return (
                                <g key={wire.id}>
                                    {/* Invisible fat stroke carries the hit test. The visible
                                        wire is 2px, which a finger cannot land on and which
                                        made deletion — the only way to remove an edge —
                                        desktop-only. */}
                                    <path
                                        data-wire-id={wire.id}
                                        d={path}
                                        stroke="transparent"
                                        strokeWidth={24}
                                        fill="none"
                                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                        onPointerEnter={() => setHoveredWireId(wire.id)}
                                        onPointerLeave={() => setHoveredWireId(null)}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (!onDeleteEdge) return
                                            setArmedWire({ id: wire.id, x: e.clientX, y: e.clientY })
                                        }}
                                    />
                                    <path
                                        d={path}
                                        stroke={isHovered ? '#ff5555' : wire.color}
                                        strokeWidth={isHovered ? 4 : 2}
                                        fill="none"
                                        opacity={0.85}
                                        style={{ pointerEvents: 'none' }}
                                    />
                                </g>
                            )
                        })}
                        {pendingWire && pendingFromPos ? (
                            <path
                                d={buildWirePath(pendingFromPos, { x: pendingWire.cursorX, y: pendingWire.cursorY })}
                                stroke={getPortType(pendingWire.fromPortType).color}
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                fill="none"
                            />
                        ) : null}
                    </svg>
                    {nodes.map((node) => {
                        const inputs = getNodeInputs(node, portScopeNodes)
                        const outputs = getNodeOutputs(node, portScopeNodes)
                        const childCount = childCounts?.get(node.id) || 0
                        // `h` and the card's left/top/width come from the same
                        // geometry the wires use, at EVERY tier. The tier below
                        // only decides what is drawn inside this box.
                        const h = cardHeight(node, portScopeNodes)
                        const isSelected = node.id === selectedNodeId
                        const typeDef = getNodeType(node.typeId)
                        const showPorts = tier === 'full' || tier === 'summary'
                        const showPortLabels = tier === 'full'
                        return (
                            <div
                                key={node.id}
                                className={`raw-graph-node-card is-lod-${tier}${isSelected ? ' is-selected' : ''}`}
                                data-card-id={node.id}
                                style={{
                                    position: 'absolute',
                                    left: node.graphX,
                                    top: node.graphY,
                                    width: CARD_WIDTH,
                                    height: h,
                                    cursor: draggingNodeId === node.id ? 'grabbing' : 'grab',
                                    // One hue per card, handed to the stylesheet, which
                                    // decides where it lands (edge, icon) and at what
                                    // strength. Omitted when the type has no family, so
                                    // every fallback in raw.css still applies.
                                    ...(getNodeFamily(node.typeId)?.color
                                        ? { '--card-family': getNodeFamily(node.typeId).color }
                                        : {})
                                }}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectNode?.(node.id)}
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return
                                    // Grabbing a wire is now as forgiving as dropping one.
                                    // A press anywhere on the card that is near an output
                                    // port starts a wire; only the 10px dot did before, so
                                    // a fingertip that missed dragged the whole node
                                    // instead — silent and infuriating.
                                    if (showPorts) {
                                        const near = nearestOutputPort(node, event.clientX, event.clientY)
                                        if (near) {
                                            handleOutputPointerDown(event, node, near, { fromCard: true })
                                            return
                                        }
                                    }
                                    const point = clientPointToGraphPoint(event.clientX, event.clientY)
                                    dragOffsetRef.current = {
                                        x: point.x - node.graphX,
                                        y: point.y - node.graphY
                                    }
                                    dragPanRef.current = { x: event.clientX, y: event.clientY, live: false, last: 0 }
                                    onSelectNode?.(node.id)
                                    setIsPanning(false)
                                    setDraggingNodeId(node.id)
                                    event.currentTarget.setPointerCapture(event.pointerId)
                                }}
                                onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
                                onDoubleClick={(event) => { event.stopPropagation(); onEnterNode?.(node.id) }}
                            >
                                <header className="raw-graph-node-header">
                                    {activeMarkerTypeIds.includes(node.typeId) && (
                                        <button
                                            type="button"
                                            className={`raw-graph-node-active-toggle${isNodeActive(node) ? ' is-active' : ''}`}
                                            title={isNodeActive(node) ? 'Active here' : 'Make this the active one'}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => { event.stopPropagation(); onSetActive(node) }}
                                        >
                                            ●
                                        </button>
                                    )}
                                    <span className="raw-graph-node-icon" />
                                    {tier !== 'block' ? (
                                        <span
                                            className="raw-graph-node-label"
                                            // Under the summary tier the title is all that is left, so it
                                            // is counter-scaled to stay 11px on screen.
                                            style={tier === 'header' ? { fontSize: `${Math.min(LEGIBLE_SCREEN_PX / zoom, 28)}px` } : undefined}
                                        >{getNodeCardTitle(node)}</span>
                                    ) : null}
                                    {onOpenInStudio && node.typeId === 'geom.geo' && tier !== 'block' ? (
                                        // The header's own small glyph button (the ● toggle's
                                        // class), so the card keeps its exact geometry.
                                        <button
                                            type="button"
                                            className="raw-graph-node-active-toggle"
                                            title={`Open ${node.label} in Studio`}
                                            aria-label={`Open ${node.label} in Studio`}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onDoubleClick={(event) => event.stopPropagation()}
                                            onClick={(event) => { event.stopPropagation(); onOpenInStudio(node.id) }}
                                        >
                                            ↗
                                        </button>
                                    ) : null}
                                    {tier === 'full' ? (
                                        // The family, not the category: a studio card used to
                                        // say "universe" here — the raw code taxonomy leaking
                                        // onto the canvas. One vocabulary with the palette.
                                        <span
                                            className="raw-graph-node-category"
                                            style={{ color: getNodeFamily(node.typeId)?.color || undefined }}
                                        >
                                            {getNodeFamily(node.typeId)?.label || typeDef?.category || ''}
                                        </span>
                                    ) : null}
                                    {/* One way in: double-click, Enter, or Open in the
                                        settings. There is no control on the card for it, so
                                        a container's card only says how much is inside, as
                                        plain meta text (audit 2026-10-05 section 3.4). */}
                                    {childCount > 0 && tier !== 'block' ? (
                                        <span
                                            className="raw-graph-node-child-count"
                                            title={`Holds ${childCount} node${childCount === 1 ? '' : 's'}`}
                                        >
                                            {`▸ ${childCount}`}
                                        </span>
                                    ) : null}
                                </header>
                                {/* This box keeps its exact height at every tier — it is
                                    part of the geometry the wires are drawn from. Only its
                                    contents change. See graphGeometry.test.js. */}
                                <div style={{ position: 'relative', height: h - HEADER_HEIGHT }}>
                                    {/* A card whose type declares no ports has a body of
                                        pure empty box — see getNodeCardSummary. One line, and
                                        only where there is genuinely nothing else to draw, so
                                        it can never collide with a port row. */}
                                    {showPorts && !inputs.length && !outputs.length && getNodeCardSummary(node) && !getNodeCardLines(node) ? (
                                        <span className="raw-graph-node-summary">{getNodeCardSummary(node)}</span>
                                    ) : null}
                                    {/* What the card holds — a List's rows under their
                                        groups, a Text's first lines. Below the ports and any
                                        picture, inside the height cardHeight already gave it. */}
                                    {tier === 'summary' && getNodeCardLines(node) ? (
                                        <CardSummaryLines
                                            content={cardContentLayout(node)}
                                            top={cardPortRows(node, portScopeNodes) * PORT_ROW_HEIGHT
                                                + (hasCardPicture(node.typeId) ? TOP_PICTURE_HEIGHT + 4 : 0)}
                                        />
                                    ) : null}
                                    {tier === 'full' && getNodeCardLines(node) ? (
                                        <CardContentLines
                                            content={cardContentLayout(node)}
                                            top={cardPortRows(node, portScopeNodes) * PORT_ROW_HEIGHT
                                                + (hasCardPicture(node.typeId) ? TOP_PICTURE_HEIGHT + 4 : 0)}
                                        />
                                    ) : null}
                                    {showPorts && isPictureType(node.typeId) ? (
                                        <TopThumbnail
                                            nodeId={pictureIdOf(node)}
                                            top={Math.max(inputs.length, outputs.length, 1) * PORT_ROW_HEIGHT + 4}
                                        />
                                    ) : null}
                                    {showPorts && isPictureType(node.typeId) && cardEmptyHint(node, { edges, scopeNodes: portScopeNodes }) ? (
                                        <span
                                            className="raw-card-empty-hint"
                                            style={{ top: Math.max(inputs.length, outputs.length, 1) * PORT_ROW_HEIGHT + 4, width: TOP_PICTURE_WIDTH, height: TOP_PICTURE_HEIGHT }}
                                        >
                                            {cardEmptyHint(node, { edges, scopeNodes: portScopeNodes })}
                                        </span>
                                    ) : null}
                                    {/* The cube itself, on the Cube's card — the same slot and
                                        size as a picture operator's picture, below the ports, so
                                        no port or wire moves. Unmounted below the port tier,
                                        which is what keeps a zoomed-out desk free. */}
                                    {showPorts && hasCardPreview(node.typeId) ? (
                                        <CardPreview
                                            node={node}
                                            nodes={portScopeNodes || nodes}
                                            edges={edges}
                                            top={Math.max(inputs.length, outputs.length, 1) * PORT_ROW_HEIGHT + 4}
                                        />
                                    ) : null}
                                    {tier === 'header' ? (
                                        // Too small for ports, but the wires still land here,
                                        // so mark where. Ticks sit at the exact port centres.
                                        [...inputs.map((port, idx) => ({ port, idx, side: 'in' })),
                                            ...outputs.map((port, idx) => ({ port, idx, side: 'out' }))]
                                            .map(({ port, idx, side }) => (
                                                <span
                                                    key={`tick-${side}-${port.id}`}
                                                    className={`raw-graph-port-tick raw-graph-port-tick--${side}`}
                                                    style={{
                                                        top: idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2 - 1,
                                                        background: getPortType(port.type).color
                                                    }}
                                                />
                                            ))
                                    ) : null}
                                    {showPorts ? inputs.map((port, idx) => (
                                        <div
                                            key={`in-${port.id}`}
                                            className="raw-graph-port-row raw-graph-port-row--in"
                                            style={{ top: idx * PORT_ROW_HEIGHT }}
                                        >
                                            <span
                                                // While a wire is being dragged, every input dot
                                                // says whether it can take it — before this, an
                                                // incompatible drop was pure silence and the only
                                                // feedback was nothing happening.
                                                className={`raw-graph-port-dot raw-graph-port-dot--in${pendingWire ? (arePortsCompatible(pendingWire.fromPortType, port.type) ? ' is-compatible' : ' is-incompatible') : ''}`}
                                                data-node-id={node.id}
                                                data-port-id={port.id}
                                                onPointerDown={(event) => armLongPress(event, node, port, 'in')}
                                                onContextMenu={(event) => {
                                                    if (!onPromotePort) return
                                                    event.preventDefault()
                                                    event.stopPropagation()
                                                    openPortMenu({ node, port, dir: 'in', clientX: event.clientX, clientY: event.clientY })
                                                }}
                                                style={{ background: getPortType(port.type).color, left: -PORT_DOT_RADIUS }}
                                                title={`${port.label || port.id} (${port.type})${onPromotePort ? ' — hold to expose on the container' : ''}`}
                                            />
                                            {showPortLabels ? (
                                                <span className="raw-graph-port-label">{port.label || port.id}</span>
                                            ) : null}
                                        </div>
                                    )) : null}
                                    {showPorts ? outputs.map((port, idx) => (
                                        <div
                                            key={`out-${port.id}`}
                                            className="raw-graph-port-row raw-graph-port-row--out"
                                            style={{ top: idx * PORT_ROW_HEIGHT }}
                                        >
                                            {/* One value, one name: when the input on this row has the
                                                same name (a Text's Content in and out, a Scene's Title and
                                                Sky), the card says it once — "Content … Content" read as two
                                                parameters (owner, 2026-10-02). The dot stays; the hover
                                                title still names it. */}
                                            {showPortLabels && (port.label || port.id) !== (inputs[idx]?.label || inputs[idx]?.id) ? (
                                                <span className="raw-graph-port-label">{port.label || port.id}</span>
                                            ) : null}
                                            <span
                                                className="raw-graph-port-dot raw-graph-port-dot--out"
                                                data-node-id={node.id}
                                                data-port-id={port.id}
                                                onPointerDown={(event) => {
                                                    armLongPress(event, node, port, 'out')
                                                    handleOutputPointerDown(event, node, port)
                                                }}
                                                onContextMenu={(event) => {
                                                    if (!onPromotePort) return
                                                    event.preventDefault()
                                                    event.stopPropagation()
                                                    openPortMenu({ node, port, dir: 'out', clientX: event.clientX, clientY: event.clientY })
                                                }}
                                                style={{ background: getPortType(port.type).color, right: -PORT_DOT_RADIUS }}
                                                title={`${port.label || port.id} (${port.type})${onPromotePort ? ' — hold to expose on the container' : ''}`}
                                            />
                                        </div>
                                    )) : null}
                                </div>
                            </div>
                        )
                    })}
                    {/* The things. Same stage, so they pan and zoom with the
                        nodes and read as being in the same place — they ARE
                        in the same project. The node card's own classes, so a
                        thing reads as living on this canvas rather than pasted
                        onto it; what tells the two apart is the hue and the
                        absence of ports, not a second visual language. */}
                    {objectCards.map((card) => (
                        <div
                            key={card.id}
                            className={`raw-graph-node-card raw-graph-object-card is-lod-${tier}${card.entityId === selectedObjectId ? ' is-selected' : ''}`}
                            style={{
                                position: 'absolute',
                                left: card.graphX,
                                top: card.graphY,
                                width: CARD_WIDTH,
                                height: cardHeight(card, null),
                                cursor: onSelectObject ? 'pointer' : 'default',
                                ...(card.familyColor ? { '--card-family': card.familyColor } : {})
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={`${card.label}, a ${card.typeLabel} in the room${card.holds ? `, holds ${card.holds}` : ''}`}
                            title={`${card.label} — a thing in the room`}
                            onClick={() => onSelectObject?.(card.entityId)}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return
                                event.preventDefault()
                                onSelectObject?.(card.entityId)
                            }}
                        >
                            <header className="raw-graph-node-header">
                                <span className="raw-graph-node-icon" />
                                {tier !== 'block' ? (
                                    <span className="raw-graph-node-label">{card.label}</span>
                                ) : null}
                                {tier === 'full' ? (
                                    <span className="raw-graph-node-category" style={{ color: card.familyColor }}>thing</span>
                                ) : null}
                            </header>
                            <div style={{ position: 'relative', height: cardHeight(card, null) - HEADER_HEIGHT }}>
                                {tier === 'full' || tier === 'summary' ? (
                                    <span className="raw-graph-node-summary">
                                        {card.holds ? `${card.typeLabel} · holds ${card.holds}` : card.typeLabel}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
                {/* Outside .raw-graph-stage on purpose: the stage carries the
                    pan/zoom transform, and position:fixed inside a transformed
                    ancestor resolves against that ancestor rather than the
                    viewport — the menu would shrink with the graph and land in
                    the wrong place. */}
                {portMenu ? (
                    <div
                        className="raw-graph-port-menu"
                        style={{ left: portMenu.clientX, top: portMenu.clientY }}
                        role="menu"
                    >
                        <p className="raw-graph-port-menu-title">
                            {portMenu.port.label || portMenu.port.id}
                        </p>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                onPromotePort?.({ node: portMenu.node, port: portMenu.port, dir: portMenu.dir })
                                setPortMenu(null)
                            }}
                        >
                            Expose on the container
                        </button>
                        <button type="button" role="menuitem" onClick={() => setPortMenu(null)}>
                            Cancel
                        </button>
                    </div>
                ) : null}
            {deleteConfirm}
        </div>
    )
}
