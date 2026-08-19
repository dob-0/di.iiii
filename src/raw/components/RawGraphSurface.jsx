import { useEffect, useMemo, useRef, useState } from 'react'
import {
    arePortsCompatible,
    getNodeFamily,
    getNodeInputs,
    getNodeOutputs,
    getNodeType,
    getPortType
} from '../../project/nodeRegistry.js'

const CARD_WIDTH = 200
const HEADER_HEIGHT = 44
const PORT_ROW_HEIGHT = 22
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
// A fit that lands below this zoom is refused. Fitting a 33-node graph into a
// 393px phone gives ~0.2, where a whole card is a few pixels across, every
// control on it is under one fingertip, and no work is possible — an overview
// nobody can act on is worse than a working view of part of the graph. Below
// the floor we fit a legible neighbourhood instead and say so.
const FIT_MIN_USEFUL_ZOOM = 0.34
// Framing ONE node is allowed to magnify, unlike fit-all which caps at 1.
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
const LOD_LABELS = 0.62   // below: drop port labels and the category tag
const LOD_PORTS = 0.34    // below: drop port rows, mark port positions with ticks
const LOD_BLOCK = 0.18    // below: a solid block, no text at all
// Stops the markup flickering when a pinch hovers exactly on a threshold.
const LOD_HYSTERESIS = 0.02

export const LOD_TIERS = ['block', 'header', 'compact', 'full']

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
    if (zoom < bump(LOD_PORTS)) return 'header'
    if (zoom < bump(LOD_LABELS)) return 'compact'
    return 'full'
}
// The door's touch halo only ever extends LEFT, into the gutter between
// columns. That gutter is 100 graph units (COL 300 minus CARD_WIDTH 200), and a
// 44-screen-pixel halo is 44/zoom graph units — below this zoom it would reach
// across into the previous column's output-port strip, and because the door
// stops propagation the press would enter the wrong node. Below it the door is
// still there and still clickable; it just has no halo.
const DOOR_HALO_MIN_ZOOM = 0.44
// Screen width the door occupies to the left of its card, reserved by the fit
// so the leftmost card's door is not clipped by the surface's overflow.
const DOOR_WIDTH_PX = 34

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// scopeNodes is threaded through every geometry helper because a container's
// ports are DERIVED from the doorway nodes inside it — see getNodeInputs. Miss
// one of these call sites and the container grows a socket the card does not
// draw, or draws one the wires do not land on.
const cardHeight = (node, scopeNodes = null) => {
    const rows = Math.max(getNodeInputs(node, scopeNodes).length, getNodeOutputs(node, scopeNodes).length, 1)
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + 8
}

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
    onSelectNode,
    onEnterNode,
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
    activeMarkerTypeIds = []
}) {
    const containerRef = useRef(null)
    const [pendingWire, setPendingWire] = useState(null)
    const [draggingNodeId, setDraggingNodeId] = useState(null)
    const [isPanning, setIsPanning] = useState(false)
    const [isPanMoving, setIsPanMoving] = useState(false)
    const [hoveredWireId, setHoveredWireId] = useState(null)
    const dragOffsetRef = useRef({ x: 0, y: 0 })
    // pendingWire mirrored into a ref: the window-level pointerup handler is
    // registered once per drag and would otherwise close over a stale value.
    const pendingWireRef = useRef(null)
    const pointersRef = useRef(new Map())
    const pinchRef = useRef(null)
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
    const hasFitRef = useRef(false)
    const lastFitViewportRef = useRef(null)
    const lastFitInsetsRef = useRef(null)
    const [panX, setPanX] = useState(60)
    const [panY, setPanY] = useState(60)
    const [zoom, setZoom] = useState(initialZoom ?? 1)
    // viewportRef mirrors pan+zoom synchronously so event handlers always read current values
    const viewportRef = useRef({ panX: 60, panY: 60, zoom: initialZoom ?? 1 })
    // How much of the graph the last fit could show, and why — drives the
    // transient "showing 5 of 33" line rather than silently lying about it.
    const [fitNotice, setFitNotice] = useState(null)
    // Detail tier, carried in state rather than derived inline so the previous
    // tier is available for hysteresis and the markup does not flicker while a
    // pinch sits on a threshold.
    const [tier, setTier] = useState(() => lodTierForZoom(initialZoom ?? 1))
    useEffect(() => { setTier((previous) => lodTierForZoom(zoom, previous)) }, [zoom])

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
    //
    // The left edge includes the door, which hangs OUTSIDE the card. Without
    // this the leftmost card's door is half off-screen after a fit-all, because
    // .raw-graph-surface clips overflow and the bounds knew nothing about it.
    // The door is counter-scaled, so its width in graph units grows as the view
    // shrinks — hence the division rather than a constant.
    const doorGutter = () => DOOR_WIDTH_PX / Math.max(viewportRef.current.zoom, FIT_MIN_USEFUL_ZOOM)
    const boundsOf = (subset) => {
        if (!subset.length) return null
        const minX = Math.min(...subset.map((n) => (n.graphX ?? 0) - doorGutter()))
        const minY = Math.min(...subset.map((n) => n.graphY ?? 0))
        const maxX = Math.max(...subset.map((n) => (n.graphX ?? 0) + CARD_WIDTH))
        const maxY = Math.max(...subset.map((n) => (n.graphY ?? 0) + cardHeight(n, portScopeNodes)))
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

    // Pull the viewport back onto the content. Centring on one point inside a
    // large graph leaves a band of empty canvas on whichever side that point is
    // near — you land looking half at nothing. When the content is larger than
    // the visible box in an axis, no empty margin is allowed on either side of
    // that axis; when it is smaller, it stays centred.
    const clampPanToContent = (bounds) => {
        const box = visibleBox()
        if (!box || !bounds) return
        const vp = viewportRef.current
        const pad = GRAPH_FIT_PADDING_PX
        const contentW = bounds.width * vp.zoom
        const contentH = bounds.height * vp.zoom
        const visibleH = box.height - Math.max(0, bottomInset)

        let nextPanX = vp.panX
        let nextPanY = vp.panY
        const left = bounds.minX * vp.zoom + vp.panX
        const top = bounds.minY * vp.zoom + vp.panY

        if (contentW > box.width - pad * 2) {
            if (left > pad) nextPanX = vp.panX - (left - pad)
            else if (left + contentW < box.width - pad) nextPanX = vp.panX + ((box.width - pad) - (left + contentW))
        }
        if (contentH > visibleH - pad * 2) {
            if (top > pad) nextPanY = vp.panY - (top - pad)
            else if (top + contentH < visibleH - pad) nextPanY = vp.panY + ((visibleH - pad) - (top + contentH))
        }
        if (nextPanX !== vp.panX || nextPanY !== vp.panY) applyViewport(nextPanX, nextPanY, vp.zoom)
    }

    // The nodes one edge away from a seed, in either direction. What you want
    // to see when the whole graph will not fit legibly.
    const neighbourhoodOf = (seed) => {
        if (!seed) return []
        const ids = new Set([seed.id])
        for (const edge of edges) {
            if (edge.fromNodeId === seed.id) ids.add(edge.toNodeId)
            if (edge.toNodeId === seed.id) ids.add(edge.fromNodeId)
        }
        return nodes.filter((node) => ids.has(node.id))
    }

    // Where to look when there is no selection: the graph's entry point — a
    // node nothing feeds into, topmost-leftmost. For a patch that reads
    // left-to-right this is where a person would start reading.
    const entryNode = () => {
        const fed = new Set(edges.map((edge) => edge.toNodeId))
        const roots = nodes.filter((node) => !fed.has(node.id))
        const pool = roots.length ? roots : nodes
        return [...pool].sort((a, b) => (
            ((a.graphY ?? 0) - (b.graphY ?? 0)) || ((a.graphX ?? 0) - (b.graphX ?? 0))
        ))[0] || null
    }

    /**
     * Fit the graph. Caps at zoom 1 (never magnifies) — but refuses to drop
     * below FIT_MIN_USEFUL_ZOOM, because an overview too small to act on is
     * worse than a working view of part of the graph. Below the floor it fits a
     * legible neighbourhood and says how much it is showing.
     *
     * `force` runs the true overview anyway, at whatever zoom that takes.
     */
    const fitGraph = ({ force = false } = {}) => {
        if (!nodes.length) return
        const all = boundsOf(nodes)
        const overviewZoom = zoomToFitBounds(all, { maxZoom: 1 })
        if (overviewZoom === null) return

        if (force || overviewZoom >= FIT_MIN_USEFUL_ZOOM) {
            applyFitTo(all, overviewZoom)
            setFitNotice(null)
            return
        }

        const seed = nodes.find((node) => node.id === selectedNodeId) || entryNode()
        if (!seed) {
            applyFitTo(all, overviewZoom)
            setFitNotice(null)
            return
        }

        // Hold the legible floor and centre a WINDOW onto the graph, rather
        // than shrinking to fit something. Framing the seed's neighbourhood
        // does not work in general — a hub node's neighbours can be spread
        // across the whole graph, so its neighbourhood is no more fittable
        // than the graph was; and framing the seed alone jumps to 100% and
        // shows a single card, which is the opposite failure. A fixed legible
        // zoom centred where you would start reading gives you several cards
        // you can actually use, and the notice says it is a partial view.
        const neighbourhood = neighbourhoodOf(seed)
        const anchor = boundsOf(neighbourhood.length > 1 ? neighbourhood : [seed])
        const centre = {
            minX: (anchor.minX + anchor.maxX) / 2,
            maxX: (anchor.minX + anchor.maxX) / 2,
            minY: (anchor.minY + anchor.maxY) / 2,
            maxY: (anchor.minY + anchor.maxY) / 2
        }
        applyFitTo(centre, FIT_MIN_USEFUL_ZOOM)
        clampPanToContent(all)

        // Report honestly: how many cards actually landed on screen.
        const box = visibleBox()
        const vp = viewportRef.current
        const shown = box
            ? nodes.filter((node) => {
                const x = (node.graphX ?? 0) * vp.zoom + vp.panX
                const y = (node.graphY ?? 0) * vp.zoom + vp.panY
                const w = CARD_WIDTH * vp.zoom
                const h = cardHeight(node, portScopeNodes) * vp.zoom
                return x + w > 0 && x < box.width && y + h > 0 && y < box.height - Math.max(0, bottomInset)
            }).length
            : 0
        setFitNotice({ shown, total: nodes.length })
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
        setFitNotice(null)
    }

    // Fit once per scope. Keyed on the scope's node identity rather than a
    // count: entering a container node is the event worth re-fitting for, and
    // adding a node is emphatically not (no editor re-fits on every create —
    // it would yank the canvas out from under you mid-edit).
    // The key must be the SCOPE, nothing else — a node count or first-node id
    // in here made every create/delete miss the guard and re-fit, which is
    // exactly the yank the comment above forbids.
    const scopeKey = nodes.length ? `scope:${nodes[0]?.parentId || 'root'}` : ''
    const insetKey = `${contentInsets?.left || 0}:${contentInsets?.right || 0}:${contentInsets?.top || 0}:${contentInsets?.bottom || 0}`
    useEffect(() => {
        if (initialZoom !== null) return
        if (hasFitRef.current === scopeKey || !containerRef.current || nodes.length === 0) return
        if (!visibleBox()) return
        fitGraph()
        hasFitRef.current = scopeKey
        lastFitInsetsRef.current = insetKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey])

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
        const settled = lastFitViewportRef.current
        const now = viewportRef.current
        const untouched = settled
            && Math.abs(settled.panX - now.panX) < 0.5
            && Math.abs(settled.panY - now.panY) < 0.5
            && Math.abs(settled.zoom - now.zoom) < 0.001
        lastFitInsetsRef.current = insetKey
        if (untouched) fitGraph()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [insetKey])

    // The fit notice is transient — it reports on one fit, not a state.
    useEffect(() => {
        if (!fitNotice) return undefined
        const id = setTimeout(() => setFitNotice(null), 4000)
        return () => clearTimeout(id)
    }, [fitNotice])

    // Non-passive wheel listener — cursor-anchored zoom, no scroll
    useEffect(() => {
        const container = containerRef.current
        if (!container) return undefined
        const handleWheel = (event) => {
            event.preventDefault()
            const factor = event.deltaY < 0 ? 1.1 : 0.9
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
        if (!selectedNodeId || !onDeleteNode) return undefined
        const handler = (event) => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return
            const target = event.target
            const tag = target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
            // Only nodes rendered on THIS surface. Selection survives entering
            // a card (pointerdown selects, then dblclick enters), so without
            // this guard Backspace deleted the scope you were standing inside
            // — cascading over its whole subtree and dumping you back to the
            // parent with everything gone.
            if (!nodeById.has(selectedNodeId)) return
            onDeleteNode(selectedNodeId)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [selectedNodeId, onDeleteNode, nodeById])

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
    const resolveWireDrop = (clientX, clientY) => {
        const wire = pendingWireRef.current
        if (!wire) return null
        const point = clientPointToGraphPoint(clientX, clientY)
        const radius = PORT_DROP_RADIUS_PX / viewportRef.current.zoom
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
            const target = resolveWireDrop(event.clientX, event.clientY)
            pendingWireRef.current = null
            setPendingWire(null)
            if (!wire || !target) return
            onCreateEdge?.({
                fromNodeId: wire.fromNodeId,
                fromPort: wire.fromPort,
                toNodeId: target.toNodeId,
                toPort: target.toPort
            })
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
        const move = (event) => {
            if (pinchRef.current) return
            const node = nodeById.get(draggingNodeId)
            if (!node) return
            const point = clientPointToGraphPoint(event.clientX, event.clientY)
            pendingPos = {
                nextX: point.x - dragOffsetRef.current.x,
                nextY: point.y - dragOffsetRef.current.y
            }
            if (rafId === null) rafId = requestAnimationFrame(flush)
        }
        const up = () => {
            if (rafId !== null) { cancelAnimationFrame(rafId); flush() }
            setDraggingNodeId(null)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId)
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
    }, [edges, nodeById])

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
        const graphPoint = clientPointToGraphPoint(event.clientX, event.clientY)
        onDoubleClick({ clientX: event.clientX, clientY: event.clientY, graphX: graphPoint.x, graphY: graphPoint.y })
    }

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
            onDoubleClick={handleSectionDoubleClick}
            onKeyDown={handleSectionKeyDown}
            onPointerDown={handleSurfacePointerDown}
        >
            <div className={`raw-graph-zoom-controls${chromeless ? ' is-chromeless' : ''}`}>
                <button type="button" aria-label="Zoom out" onClick={() => updateZoom(zoom - GRAPH_ZOOM_STEP)}>-</button>
                <span className="raw-graph-zoom-value">{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => updateZoom(zoom + GRAPH_ZOOM_STEP)}>+</button>
                <button type="button" aria-label="Fit graph" title="Fit the graph" onClick={() => fitGraph()}>⤢</button>
                {selectedNodeId ? (
                    <button type="button" aria-label="Frame selection" title="Frame the selected node" onClick={frameSelection}>◎</button>
                ) : null}
            </div>
            {/* Says how much of the graph is on screen when the whole thing
                would have been too small to work with. Tappable, so the true
                overview is still one gesture away — the point is to stop
                silently pretending a 33-node graph fits a phone. */}
            {fitNotice ? (
                <button
                    type="button"
                    className="raw-graph-fit-notice"
                    onClick={() => fitGraph({ force: true })}
                >
                    showing {fitNotice.shown} of {fitNotice.total} — ⤢ fit all
                </button>
            ) : null}
            {nodes.length === 0 ? (
                // A blank workspace opens in ZEN, where there is NO topbar — so
                // the ⋯ menu, and everything in it, does not exist for the
                // person most likely to need it. The one offer that matters has
                // to live here, on the canvas they are actually looking at.
                <div className="raw-empty-state">
                    <p>{emptyHint}</p>
                    {onMakeScene ? (
                        <button type="button" onClick={onMakeScene}>Make me a scene</button>
                    ) : null}
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
                            const isHovered = hoveredWireId === wire.id
                            const path = buildWirePath(wire.from, wire.to)
                            return (
                                <g key={wire.id}>
                                    {/* Invisible fat stroke carries the hit test. The visible
                                        wire is 2px, which a finger cannot land on and which
                                        made deletion — the only way to remove an edge —
                                        desktop-only. */}
                                    <path
                                        d={path}
                                        stroke="transparent"
                                        strokeWidth={24}
                                        fill="none"
                                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                        onPointerEnter={() => setHoveredWireId(wire.id)}
                                        onPointerLeave={() => setHoveredWireId(null)}
                                        onClick={(e) => { e.stopPropagation(); onDeleteEdge?.(wire.id) }}
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
                        const showPorts = tier === 'full' || tier === 'compact'
                        const showPortLabels = tier === 'full'
                        return (
                            <div
                                key={node.id}
                                className={`raw-graph-node-card is-lod-${tier}${isSelected ? ' is-selected' : ''}`}
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
                                    onSelectNode?.(node.id)
                                    setIsPanning(false)
                                    setDraggingNodeId(node.id)
                                    event.currentTarget.setPointerCapture(event.pointerId)
                                }}
                                onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
                                onDoubleClick={(event) => { event.stopPropagation(); onEnterNode?.(node.id) }}
                            >
                                {/* The door. Hangs off the card's LEFT edge, counter-scaled so
                                    it is the same size on screen at every zoom — a control that
                                    shrinks with the graph is the bug this replaces. Left, not
                                    in the header, because nearestOutputPort's grab radius is 28
                                    SCREEN pixels and covers the card's right-hand end once the
                                    graph is zoomed out, so a door there competes with starting
                                    a wire. Never gated on having contents: RawEditor routes this
                                    same control to reopen a closed panel window, and an
                                    un-enterable empty container is a box that can never be
                                    filled. */}
                                {onEnterNode && tier !== 'block' ? (
                                    <div
                                        className="raw-graph-node-door-anchor"
                                        style={{ transform: `scale(${1 / Math.max(zoom, FIT_MIN_USEFUL_ZOOM)})` }}
                                    >
                                        <button
                                            type="button"
                                            className={`raw-graph-node-door${childCount > 0 ? ' has-contents' : ''}${zoom >= DOOR_HALO_MIN_ZOOM ? ' has-halo' : ''}`}
                                            title={childCount > 0
                                                ? `Enter ${node.label} — holds ${childCount} node${childCount === 1 ? '' : 's'}`
                                                : `Enter ${node.label}`}
                                            aria-label={childCount > 0
                                                ? `Enter ${node.label}, holds ${childCount} node${childCount === 1 ? '' : 's'}`
                                                : `Enter ${node.label}`}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            // The card's own dblclick also enters; without this
                                            // a double-tap on the door pushes the same scope
                                            // twice and takes two presses to leave.
                                            onDoubleClick={(event) => event.stopPropagation()}
                                            onClick={(event) => { event.stopPropagation(); onEnterNode?.(node.id) }}
                                        >
                                            {childCount > 0 ? (
                                                <span className="raw-graph-node-child-count">{childCount}</span>
                                            ) : null}
                                            <span aria-hidden="true">›</span>
                                        </button>
                                    </div>
                                ) : null}
                                <header className="raw-graph-node-header">
                                    {activeMarkerTypeIds.includes(node.typeId) && (
                                        <button
                                            type="button"
                                            className={`raw-graph-node-active-toggle${isNodeActive(node) ? ' is-active' : ''}`}
                                            title={isNodeActive(node) ? 'Active in this scope' : 'Make active in this scope'}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => { event.stopPropagation(); onSetActive(node) }}
                                        >
                                            ●
                                        </button>
                                    )}
                                    <span className="raw-graph-node-icon" />
                                    {tier !== 'block' ? (
                                        <span className="raw-graph-node-label">{node.label}</span>
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
                                    {/* Entering a node used to be double-click only, cued by a
                                        hover-revealed chevron — so on a phone there was no
                                        affordance at all and no gesture that reliably worked.
                                        Containers make that fatal rather than annoying: a
                                        `studio` node you cannot enter is an empty box. This is
                                        a real button now, always visible on coarse pointers —
                                        but not when the card is too small to aim at. */}
                                    {/* The way in is NOT here any more — see the door on the
                                        card's left edge below. In the header it lived inside
                                        the graph's own transform, so at the zoom the auto-fit
                                        lands an oversized graph on it measured 7x7 screen
                                        pixels: present in the DOM, unusable in the browser, and
                                        a DOM-presence test passes anyway. It also sat inside
                                        nearestOutputPort's 28-screen-pixel grab radius, which
                                        covers the card's right-hand end at low zoom. */}
                                </header>
                                {/* This box keeps its exact height at every tier — it is
                                    part of the geometry the wires are drawn from. Only its
                                    contents change. See graphGeometry.test.js. */}
                                <div style={{ position: 'relative', height: h - HEADER_HEIGHT }}>
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
                                            {showPortLabels ? (
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
        </div>
    )
}
