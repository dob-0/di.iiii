import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapStage from './MapStage.jsx'
import {
    groupFrame, moveCorners, rotateCorners, scaleCorners, sliceFrame, sliceOutline, toLocal, toWall, warpPoints
} from './sliceGeometry.js'

// THE WALL, in the mapping window (MapAdvancedOutput.jsx).
//
// One view, no modes (Emily, 2026-11-11: comfortable, "not like resolume
// reverse engineered"). What the pointer is over decides what a drag does,
// and the cursor and the hint line say so before you press:
//
//   inside a piece      move it (and every piece picked with it)
//   a corner            pin that corner where it really is on the wall
//   an amber point      bend the picture there (a bent piece)
//   an edge bar         stretch that side (shift keeps the shape)
//   the knob above it   turn it (shift: 15° steps)
//   empty space         drag a box round pieces to pick them
//   double-click        start bending a piece (the window adds the points)
//
// Handles are drawn in SCREEN pixels so they stay finger-sized at any zoom.
// Everything a drag changes is ONE op batch per pointer move, so a group move
// is one undo step after the history coalesces it.

const HANDLE = 9
const KNOB_OUT = 30
const KNOB_R = 8
const SNAP_PX = 8

const pointInQuad = ([px, py], quad) => {
    let inside = false
    for (let a = 0, b = quad.length - 1; a < quad.length; b = a, a += 1) {
        const [ax, ay] = quad[a]
        const [bx, by] = quad[b]
        if ((ay > py) !== (by > py) && px < (((bx - ax) * (py - ay)) / (by - ay)) + ax) inside = !inside
    }
    return inside
}

// Grid index -> corner (TL, TR, BR, BL), or -1 for a point between.
export const cornerIndexOfPoint = (index, columns, rows) => {
    if (index === 0) return 0
    if (index === columns - 1) return 1
    if (index === (columns * rows) - 1) return 2
    if (index === (rows - 1) * columns) return 3
    return -1
}

const rotatePoint = ([x, y], [cx, cy], radians) => {
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return [cx + ((x - cx) * cos) - ((y - cy) * sin), cy + ((x - cx) * sin) + ((y - cy) * cos)]
}

// Handle positions of a frame, in the frame's own units: 4 corners then 4 edges.
const frameHandles = (frame) => {
    const radians = (frame.rotation * Math.PI) / 180
    const hw = frame.width / 2
    const hh = frame.height / 2
    const local = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [0, -hh], [hw, 0], [0, hh], [-hw, 0]]
    return local.map(([x, y]) => rotatePoint([frame.x + x, frame.y + y], [frame.x, frame.y], radians))
}

const isBent = (surface) => {
    const { columns, rows } = warpPoints(surface?.warp || { divisionsX: 0, divisionsY: 0 })
    return columns * rows > 4
}

const CURSORS = { knob: 'grab', corner: 'crosshair', point: 'crosshair', edge: 'move', scale: 'nwse-resize', body: 'move' }

export default function MapSliceCanvas({
    mapping, surfaces, W, H, zoom, onZoom, pan, onPan, snap, grid,
    selectedIds, onSelect, selectedPoints, onSelectPoints, applyOps, live,
    spaceId, projectId, network, assets, onContextMenu, onFit, onBend, onHover
}) {
    const viewportRef = useRef(null)
    const dragRef = useRef(null)
    const [view, setView] = useState({ width: 0, height: 0 })
    const [guides, setGuides] = useState({ x: [], y: [] })
    const [marquee, setMarquee] = useState(null)
    const [spaceHeld, setSpaceHeld] = useState(false)
    const [grabbing, setGrabbing] = useState(false)
    const [hover, setHover] = useState(null)

    useEffect(() => {
        const node = viewportRef.current
        if (!node || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(([entry]) => setView({ width: entry.contentRect.width, height: entry.contentRect.height }))
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    // "Fit" is a zoom computed from the viewport, reported up so the view
    // controls can show its percentage.
    const fitZoom = view.width && view.height ? Math.max(0.02, Math.min((view.width - 96) / W, (view.height - 96) / H)) : 0.3
    const z = zoom === 'fit' ? fitZoom : zoom
    useEffect(() => { onFit?.(fitZoom) }, [fitZoom, onFit])
    const origin = useMemo(() => [((view.width - (W * z)) / 2) + pan[0], ((view.height - (H * z)) / 2) + pan[1]], [view.width, view.height, W, H, z, pan])
    const toScreen = useCallback(([x, y]) => [origin[0] + (x * z), origin[1] + (y * z)], [origin, z])
    const toOutput = useCallback((event) => {
        const rect = viewportRef.current.getBoundingClientRect()
        return [((event.clientX - rect.left) - origin[0]) / z, ((event.clientY - rect.top) - origin[1]) / z]
    }, [origin, z])

    // Space held = move the view, like every canvas tool.
    useEffect(() => {
        const down = (event) => {
            if (event.code !== 'Space' || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return
            setSpaceHeld(true)
            event.preventDefault()
        }
        const up = (event) => { if (event.code === 'Space') setSpaceHeld(false) }
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
    }, [])

    const quadOf = useCallback((surface) => surface.corners.map(([x, y]) => [x * W, y * H]), [W, H])
    const outlineOf = useCallback((surface) => sliceOutline(quadOf(surface), surface.warp), [quadOf])
    const patchFor = useCallback((quad) => ({
        corners: quad.map(([x, y]) => [Math.round((x / W) * 1e6) / 1e6, Math.round((y / H) * 1e6) / 1e6])
    }), [W, H])

    const byId = useMemo(() => new Map(surfaces.map((surface) => [surface.id, surface])), [surfaces])
    const selected = useMemo(() => selectedIds.map((id) => byId.get(id)).filter(Boolean), [selectedIds, byId])
    const single = selected.length === 1 ? selected[0] : null
    const singleBent = single ? isBent(single) : false

    // --- snapping --------------------------------------------------------

    const candidates = useMemo(() => {
        const xs = [0, W / 2, W]
        const ys = [0, H / 2, H]
        if (grid > 0) {
            for (let i = 1; i < grid; i += 1) { xs.push((W * i) / grid); ys.push((H * i) / grid) }
        }
        surfaces.forEach((surface) => {
            if (selectedIds.includes(surface.id) || !surface.enabled) return
            quadOf(surface).forEach(([x, y]) => { xs.push(x); ys.push(y) })
        })
        return { xs, ys }
    }, [W, H, grid, surfaces, selectedIds, quadOf])

    const nearest = (value, list, tolerance) => {
        let best = null
        list.forEach((entry) => {
            const distance = Math.abs(entry - value)
            if (distance <= tolerance && (best === null || distance < Math.abs(best - value))) best = entry
        })
        return best
    }

    // Snap one point; returns the point and the guides it agreed with.
    const snapPoint = useCallback((point, event) => {
        if (!snap || event?.altKey) return { point, gx: [], gy: [] }
        const tolerance = SNAP_PX / z
        const sx = nearest(point[0], candidates.xs, tolerance)
        const sy = nearest(point[1], candidates.ys, tolerance)
        return { point: [sx ?? point[0], sy ?? point[1]], gx: sx === null ? [] : [sx], gy: sy === null ? [] : [sy] }
    }, [snap, z, candidates])

    // Snap a moving set of points by one shared correction.
    const snapDelta = useCallback((points, event) => {
        if (!snap || event?.altKey) return { dx: 0, dy: 0, gx: [], gy: [] }
        const tolerance = SNAP_PX / z
        let bestX = null
        let bestY = null
        points.forEach(([x, y]) => {
            const sx = nearest(x, candidates.xs, tolerance)
            const sy = nearest(y, candidates.ys, tolerance)
            if (sx !== null && (bestX === null || Math.abs(sx - x) < Math.abs(bestX.d))) bestX = { d: sx - x, at: sx }
            if (sy !== null && (bestY === null || Math.abs(sy - y) < Math.abs(bestY.d))) bestY = { d: sy - y, at: sy }
        })
        return { dx: bestX?.d || 0, dy: bestY?.d || 0, gx: bestX ? [bestX.at] : [], gy: bestY ? [bestY.at] : [] }
    }, [snap, z, candidates])

    // --- the one picked piece's points: 4 corners, plus its bend points ----

    const points = useMemo(() => {
        if (!single) return null
        const quad = quadOf(single)
        const { columns, rows, points: grid0 } = warpPoints(single.warp || { divisionsX: 0, divisionsY: 0 })
        const output = grid0.map((local) => toWall(quad, local))
        if (output.some((point) => !point)) return null
        return { columns, rows, local: grid0, output, quad }
    }, [single, quadOf])

    // One piece: its own frame (turned if it is a plain rectangle, else the
    // straight box round its bent shape). Several: the box round them all.
    const frame = useMemo(() => {
        if (!selected.length) return null
        if (selected.length > 1) return groupFrame(selected.map(outlineOf))
        return sliceFrame(quadOf(selected[0]), selected[0].warp)
    }, [selected, quadOf, outlineOf])
    const handles = useMemo(() => (frame ? frameHandles(frame) : []), [frame])

    // The knob sits just outside the top edge, on the line from the centre.
    const knob = useMemo(() => {
        if (!frame) return null
        const top = toScreen(handles[4])
        const centre = toScreen([frame.x, frame.y])
        const length = Math.hypot(top[0] - centre[0], top[1] - centre[1])
        const dir = length > 1e-6 ? [(top[0] - centre[0]) / length, (top[1] - centre[1]) / length] : [0, -1]
        return { from: top, at: [top[0] + (dir[0] * KNOB_OUT), top[1] + (dir[1] * KNOB_OUT)] }
    }, [frame, handles, toScreen])

    // --- what is under the pointer -----------------------------------------

    const hitSlice = useCallback((point) => {
        for (let index = surfaces.length - 1; index >= 0; index -= 1) {
            const surface = surfaces[index]
            if (!surface.enabled) continue
            if (pointInQuad(point, outlineOf(surface))) return surface
        }
        return null
    }, [surfaces, outlineOf])

    const targetAt = useCallback((event) => {
        const rect = viewportRef.current.getBoundingClientRect()
        const local = [event.clientX - rect.left, event.clientY - rect.top]
        const near = (point, radius) => {
            const [sx, sy] = toScreen(point)
            return Math.hypot(sx - local[0], sy - local[1]) <= radius
        }
        if (knob && Math.hypot(knob.at[0] - local[0], knob.at[1] - local[1]) <= KNOB_R + 4) return { kind: 'knob' }
        if (points) {
            const index = points.output.findIndex((point) => near(point, HANDLE + 3))
            if (index !== -1) {
                const corner = cornerIndexOfPoint(index, points.columns, points.rows) !== -1
                return { kind: corner ? 'corner' : 'point', index }
            }
        }
        if (frame) {
            if (selected.length > 1) {
                const index = handles.findIndex((point) => near(point, HANDLE + 3))
                if (index !== -1) return { kind: 'scale', handle: index }
            } else if (!singleBent) {
                const index = handles.slice(4).findIndex((point) => near(point, HANDLE + 3))
                if (index !== -1) return { kind: 'edge', handle: index + 4 }
            }
        }
        const surface = hitSlice(toOutput(event))
        return surface ? { kind: 'body', surface } : { kind: 'none' }
    }, [knob, points, frame, selected.length, singleBent, handles, hitSlice, toOutput, toScreen])

    // --- pointer ---------------------------------------------------------

    const panning = spaceHeld
    const capture = (event) => event.currentTarget.setPointerCapture?.(event.pointerId)

    const onPointerDown = (event) => {
        if (event.button === 1 || panning) {
            dragRef.current = { kind: 'pan', start: [event.clientX, event.clientY], pan }
            setGrabbing(true)
            capture(event)
            return
        }
        if (event.button !== 0) return
        const at = toOutput(event)
        const target = targetAt(event)

        if (target.kind === 'knob') {
            dragRef.current = { kind: 'rotate', start: at, frame, originals: new Map(selected.map((surface) => [surface.id, quadOf(surface)])) }
            setGrabbing(true)
            capture(event)
            return
        }

        if (target.kind === 'corner' || target.kind === 'point') {
            const hit = target.index
            let nextPoints = selectedPoints
            if (event.shiftKey) nextPoints = selectedPoints.includes(hit) ? selectedPoints.filter((i) => i !== hit) : [...selectedPoints, hit]
            else if (!selectedPoints.includes(hit)) nextPoints = [hit]
            onSelectPoints(nextPoints)
            if (!nextPoints.includes(hit)) return
            dragRef.current = {
                kind: 'points', start: at, surface: single, quad: points.quad,
                columns: points.columns, rows: points.rows, local: points.local, output: points.output,
                moving: nextPoints, grab: hit
            }
            capture(event)
            return
        }

        if (target.kind === 'edge' || target.kind === 'scale') {
            const index = target.handle
            const opposite = index < 4 ? (index + 2) % 4 : 4 + ((index - 4 + 2) % 4)
            dragRef.current = {
                kind: 'scale', start: at, frame, handle: index, pivot: handles[opposite],
                originals: new Map(selected.map((surface) => [surface.id, quadOf(surface)]))
            }
            capture(event)
            return
        }

        if (target.kind === 'body') {
            const hit = target.surface
            let ids = selectedIds
            if (event.shiftKey || event.ctrlKey || event.metaKey) ids = selectedIds.includes(hit.id) ? selectedIds.filter((id) => id !== hit.id) : [...selectedIds, hit.id]
            else if (!selectedIds.includes(hit.id)) ids = [hit.id]
            onSelect(ids)
            if (!ids.includes(hit.id)) return
            const moving = ids.map((id) => byId.get(id)).filter(Boolean)
            dragRef.current = { kind: 'move', start: at, originals: new Map(moving.map((surface) => [surface.id, quadOf(surface)])) }
            capture(event)
            return
        }

        // Empty space: let go of everything and draw a box to pick pieces.
        if (!event.shiftKey) {
            onSelectPoints([])
            onSelect([])
        }
        dragRef.current = { kind: 'marquee', start: at, additive: event.shiftKey }
        setMarquee({ from: at, to: at })
        capture(event)
    }

    const writeQuads = (quads) => {
        const ops = []
        quads.forEach((quad, id) => {
            if (byId.has(id)) ops.push({ type: 'setMappingSurface', payload: { surfaceId: id, patch: patchFor(quad) } })
        })
        if (ops.length) applyOps(ops)
    }

    const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag) {
            // Nothing held: say what a press here would do.
            if (panning) return
            const target = targetAt(event)
            const kind = target.kind === 'none' ? null : target.kind
            const id = target.surface?.id || null
            if (kind !== hover?.kind || id !== hover?.id) {
                setHover(kind ? { kind, id } : null)
                onHover?.(kind)
            }
            return
        }
        if (drag.kind === 'pan') {
            onPan([drag.pan[0] + (event.clientX - drag.start[0]), drag.pan[1] + (event.clientY - drag.start[1])])
            return
        }
        const at = toOutput(event)
        if (drag.kind === 'marquee') {
            setMarquee({ from: drag.start, to: at })
            return
        }
        if (drag.kind === 'move') {
            let dx = at[0] - drag.start[0]
            let dy = at[1] - drag.start[1]
            if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
            const moved = [...drag.originals.values()].flatMap((quad) => moveCorners(quad, dx, dy))
            const snapped = snapDelta(moved, event)
            setGuides({ x: snapped.gx, y: snapped.gy })
            const quads = new Map()
            drag.originals.forEach((quad, id) => quads.set(id, moveCorners(quad, dx + snapped.dx, dy + snapped.dy)))
            writeQuads(quads)
            return
        }
        if (drag.kind === 'rotate') {
            const center = [drag.frame.x, drag.frame.y]
            let degrees = ((Math.atan2(at[1] - center[1], at[0] - center[0]) - Math.atan2(drag.start[1] - center[1], drag.start[0] - center[0])) * 180) / Math.PI
            if (event.shiftKey) degrees = Math.round(degrees / 15) * 15
            const quads = new Map()
            drag.originals.forEach((quad, id) => quads.set(id, rotateCorners(quad, degrees, center)))
            setGuides({ x: [], y: [] })
            writeQuads(quads)
            return
        }
        if (drag.kind === 'scale') {
            const { frame: f, handle } = drag
            const radians = (f.rotation * Math.PI) / 180
            // Alt scales about the middle; an edge with shift keeps the shape,
            // so it scales about the middle too.
            const fromMiddle = event.altKey || (event.shiftKey && handle >= 4)
            const pivot = fromMiddle ? [f.x, f.y] : drag.pivot
            const snapped = snapPoint(at, event)
            setGuides({ x: snapped.gx, y: snapped.gy })
            // Into the frame's own axes.
            const toAxes = (point) => rotatePoint(point, pivot, -radians)
            const handlePoint = toAxes(frameHandles(f)[handle])
            const pointer = toAxes(snapped.point)
            const spanX = handlePoint[0] - pivot[0]
            const spanY = handlePoint[1] - pivot[1]
            let sx = handle === 4 || handle === 6 ? 1 : (Math.abs(spanX) > 1e-6 ? (pointer[0] - pivot[0]) / spanX : 1)
            let sy = handle === 5 || handle === 7 ? 1 : (Math.abs(spanY) > 1e-6 ? (pointer[1] - pivot[1]) / spanY : 1)
            if (event.shiftKey) {
                if (handle < 4) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * s; sy = Math.sign(sy || 1) * s }
                else if (handle === 4 || handle === 6) sx = Math.abs(sy)
                else sy = Math.abs(sx)
            }
            const quads = new Map()
            drag.originals.forEach((quad, id) => quads.set(id, scaleCorners(quad, sx, sy, pivot, f.rotation)))
            writeQuads(quads)
            return
        }
        if (drag.kind === 'points') {
            const dx0 = at[0] - drag.start[0]
            const dy0 = at[1] - drag.start[1]
            const grabbed = [drag.output[drag.grab][0] + dx0, drag.output[drag.grab][1] + dy0]
            const snapped = snapPoint(grabbed, event)
            setGuides({ x: snapped.gx, y: snapped.gy })
            const dx = snapped.point[0] - drag.output[drag.grab][0]
            const dy = snapped.point[1] - drag.output[drag.grab][1]
            const quad = drag.quad.map((corner) => [...corner])
            drag.moving.forEach((index) => {
                const corner = cornerIndexOfPoint(index, drag.columns, drag.rows)
                if (corner !== -1) quad[corner] = [drag.output[index][0] + dx, drag.output[index][1] + dy]
            })
            const surface = drag.surface
            const patch = patchFor(quad)
            const interior = drag.moving.filter((index) => cornerIndexOfPoint(index, drag.columns, drag.rows) === -1)
            const cornersMoved = interior.length !== drag.moving.length
            if (interior.length || (cornersMoved && surface.warp)) {
                // Bend points are stored in the piece's own square, so a
                // pinned corner carries the unmoved points with it.
                const nextLocal = drag.local.map((point) => [...point])
                interior.forEach((index) => {
                    const local = toLocal(quad, [drag.output[index][0] + dx, drag.output[index][1] + dy])
                    if (local) nextLocal[index] = [Math.round(local[0] * 1e6) / 1e6, Math.round(local[1] * 1e6) / 1e6]
                })
                const warp = surface.warp || { mode: 'linear', divisionsX: 0, divisionsY: 0 }
                patch.warp = { ...warp, points: nextLocal }
            }
            applyOps([{ type: 'setMappingSurface', payload: { surfaceId: surface.id, patch } }])
        }
    }

    const onPointerUp = (event) => {
        const drag = dragRef.current
        dragRef.current = null
        setGrabbing(false)
        setGuides({ x: [], y: [] })
        if (drag?.kind === 'marquee') {
            const at = toOutput(event)
            const [x0, x1] = [Math.min(drag.start[0], at[0]), Math.max(drag.start[0], at[0])]
            const [y0, y1] = [Math.min(drag.start[1], at[1]), Math.max(drag.start[1], at[1])]
            setMarquee(null)
            if (x1 - x0 < 2 / z && y1 - y0 < 2 / z) return
            const inside = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1
            const hits = surfaces.filter((surface) => surface.enabled && outlineOf(surface).every(inside)).map((surface) => surface.id)
            onSelect(drag.additive ? [...new Set([...selectedIds, ...hits])] : hits)
        }
    }

    const onPointerLeave = () => {
        if (dragRef.current) return
        if (hover) { setHover(null); onHover?.(null) }
    }

    const onDoubleClick = (event) => {
        if (panning) return
        const hit = hitSlice(toOutput(event))
        if (hit) onBend?.(hit.id)
    }

    // The wheel zooms about the pointer.
    const onWheel = (event) => {
        event.preventDefault()
        const rect = viewportRef.current.getBoundingClientRect()
        const at = [event.clientX - rect.left, event.clientY - rect.top]
        const next = Math.max(0.02, Math.min(8, z * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
        const before = [(at[0] - origin[0]) / z, (at[1] - origin[1]) / z]
        const centred = [(view.width - (W * next)) / 2, (view.height - (H * next)) / 2]
        onZoom(next)
        onPan([at[0] - (before[0] * next) - centred[0], at[1] - (before[1] * next) - centred[1]])
    }
    useEffect(() => {
        const node = viewportRef.current
        if (!node) return undefined
        const handler = (event) => onWheel(event)
        node.addEventListener('wheel', handler, { passive: false })
        return () => node.removeEventListener('wheel', handler)
    })

    const onContext = (event) => {
        event.preventDefault()
        const hit = hitSlice(toOutput(event))
        if (hit && !selectedIds.includes(hit.id)) onSelect([hit.id])
        onContextMenu?.(hit?.id || null, event.clientX, event.clientY)
    }

    // --- drawing ---------------------------------------------------------

    const stageW = Math.max(1, Math.round(W * z))
    const stageH = Math.max(1, Math.round(H * z))
    const poly = (quad) => quad.map((point) => toScreen(point).map((value) => value.toFixed(1)).join(',')).join(' ')

    const gridLines = []
    if (grid > 0) {
        for (let i = 1; i < grid; i += 1) {
            const x = origin[0] + ((W * i * z) / grid)
            const y = origin[1] + ((H * i * z) / grid)
            gridLines.push(<line key={`gx${i}`} x1={x} y1={origin[1]} x2={x} y2={origin[1] + stageH} className="map-mo-grid" />)
            gridLines.push(<line key={`gy${i}`} x1={origin[0]} y1={y} x2={origin[0] + stageW} y2={y} className="map-mo-grid" />)
        }
    }

    const meshLines = (surface, quad) => {
        const { columns, rows, points: grid0 } = warpPoints(surface.warp || { divisionsX: 0, divisionsY: 0 })
        if (columns * rows <= 4) return null
        const out = grid0.map((local) => toWall(quad, local))
        if (out.some((point) => !point)) return null
        const lines = []
        for (let row = 0; row < rows; row += 1) lines.push(out.slice(row * columns, (row + 1) * columns))
        for (let column = 0; column < columns; column += 1) lines.push(Array.from({ length: rows }, (_, row) => out[(row * columns) + column]))
        return lines.map((line, index) => (
            <polyline key={index} className="map-mo-mesh" points={line.map((point) => toScreen(point).join(',')).join(' ')} />
        ))
    }

    const cursor = grabbing ? 'grabbing' : (panning ? 'grab' : (CURSORS[hover?.kind] || 'default'))

    return (
        <div
            className="map-mo-viewport"
            ref={viewportRef}
            role="application"
            aria-label="The wall"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContext}
        >
            {view.width > 0 ? (
                <div className="map-mo-stage" style={{ left: origin[0], top: origin[1], width: stageW, height: stageH }}>
                    <MapStage
                        mapping={mapping}
                        spaceId={spaceId}
                        width={stageW}
                        height={stageH}
                        live={live}
                        network={network}
                        assets={assets}
                        projectId={projectId}
                    />
                </div>
            ) : null}
            <svg className="map-mo-overlay" width={view.width} height={view.height}>
                <rect className="map-mo-frame" x={origin[0]} y={origin[1]} width={stageW} height={stageH} />
                {gridLines}
                {surfaces.map((surface, index) => {
                    if (!surface.enabled) return null
                    const quad = quadOf(surface)
                    const isSelected = selectedIds.includes(surface.id)
                    const outline = outlineOf(surface)
                    const [lx, ly] = toScreen(quad[0])
                    // A piece too narrow on screen for its name shows its number.
                    const xs = outline.map(([x]) => x)
                    const roomy = (Math.max(...xs) - Math.min(...xs)) * z > 84
                    return (
                        <g key={surface.id} className={`map-mo-piece${isSelected ? ' is-selected' : ''}${hover?.id === surface.id ? ' is-hover' : ''}`}>
                            <polygon points={poly(outline)} />
                            {meshLines(surface, quad)}
                            <text x={lx + 5} y={ly + 14}><tspan className="map-mo-piece-num">{index + 1}</tspan>{roomy ? ` ${surface.name || ''}` : ''}</text>
                        </g>
                    )
                })}
                {guides.x.map((x) => <line key={`sx${x}`} className="map-mo-guide" x1={toScreen([x, 0])[0]} y1={0} x2={toScreen([x, 0])[0]} y2={view.height} />)}
                {guides.y.map((y) => <line key={`sy${y}`} className="map-mo-guide" x1={0} y1={toScreen([0, y])[1]} x2={view.width} y2={toScreen([0, y])[1]} />)}
                {selected.length > 1 && frame ? (
                    <g className="map-mo-groupbox">
                        <polygon points={poly(handles.slice(0, 4))} />
                        {handles.map((point, index) => {
                            const [x, y] = toScreen(point)
                            return <rect key={index} className="map-mo-handle" x={x - 4.5} y={y - 4.5} width={9} height={9} />
                        })}
                    </g>
                ) : null}
                {single && !singleBent && frame ? (
                    <g className="map-mo-edges">
                        {handles.slice(4).map((point, index) => {
                            const [x, y] = toScreen(point)
                            const horizontal = index % 2 === 0
                            const angle = frame.rotation
                            return (
                                <rect key={index} className="map-mo-edge" x={x - (horizontal ? 9 : 2.5)} y={y - (horizontal ? 2.5 : 9)}
                                    width={horizontal ? 18 : 5} height={horizontal ? 5 : 18} transform={`rotate(${angle} ${x} ${y})`} />
                            )
                        })}
                    </g>
                ) : null}
                {points ? (
                    <g className="map-mo-points">
                        {points.output.map((point, index) => {
                            const [x, y] = toScreen(point)
                            const corner = cornerIndexOfPoint(index, points.columns, points.rows) !== -1
                            const on = selectedPoints.includes(index)
                            return corner ? (
                                <rect key={index} className={`map-mo-pin${on ? ' is-selected' : ''}`} x={x - 6} y={y - 6} width={12} height={12} />
                            ) : (
                                <circle key={index} className={`map-mo-bend${on ? ' is-selected' : ''}`} cx={x} cy={y} r={5} />
                            )
                        })}
                    </g>
                ) : null}
                {knob ? (
                    <g className={`map-mo-knob${hover?.kind === 'knob' || grabbing ? ' is-hot' : ''}`}>
                        <line x1={knob.from[0]} y1={knob.from[1]} x2={knob.at[0]} y2={knob.at[1]} />
                        <circle cx={knob.at[0]} cy={knob.at[1]} r={KNOB_R} />
                    </g>
                ) : null}
                {marquee ? (() => {
                    const [ax, ay] = toScreen(marquee.from)
                    const [bx, by] = toScreen(marquee.to)
                    return <rect className="map-mo-marquee" x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} />
                })() : null}
            </svg>
        </div>
    )
}
