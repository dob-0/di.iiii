import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapStage from './MapStage.jsx'
import { defaultMappingSurface } from '../shared/projectSchema.js'
import { isScreenKind, screenInput } from './wallScreens.js'
import {
    frameOf, groupFrame, inputCorners, moveCorners, rotateCorners, scaleCorners, sliceFrame, sliceOutline, toLocal, toWall, warpPoints
} from './sliceGeometry.js'

// The canvas of the mapping window: the wall (Output Transformation) or the
// composition (Input Selection) on a grey bed, zoomable and pannable, with the
// handles drawn over it in SCREEN pixels so they stay finger-sized at any zoom.
//
// Everything a drag changes is written as ONE op batch per pointer move —
// every selected slice at once — so a group move is one undo step after the
// history coalesces it.

const HANDLE = 9
const ROTATE_RING = 26
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

const cornerIndexOfPoint = (index, columns, rows) => {
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

export default function MapSliceCanvas({
    tab, mode, mapping, surfaces, W, H, zoom, onZoom, pan, onPan, hand, snap, grid,
    selectedIds, onSelect, selectedPoints, onSelectPoints, applyOps, live,
    spaceId, projectId, network, assets, onContextMenu, onFit
}) {
    const viewportRef = useRef(null)
    const dragRef = useRef(null)
    const [view, setView] = useState({ width: 0, height: 0 })
    const [guides, setGuides] = useState({ x: [], y: [] })
    const [marquee, setMarquee] = useState(null)
    const [spaceHeld, setSpaceHeld] = useState(false)
    const [grabbing, setGrabbing] = useState(false)

    useEffect(() => {
        const node = viewportRef.current
        if (!node || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(([entry]) => setView({ width: entry.contentRect.width, height: entry.contentRect.height }))
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    // "Fit" is a zoom computed from the viewport, reported up so the toolbar
    // can show its percentage.
    const fitZoom = view.width && view.height ? Math.max(0.02, Math.min((view.width - 80) / W, (view.height - 80) / H)) : 0.3
    const z = zoom === 'fit' ? fitZoom : zoom
    useEffect(() => { onFit?.(fitZoom) }, [fitZoom, onFit])
    const origin = useMemo(() => [((view.width - (W * z)) / 2) + pan[0], ((view.height - (H * z)) / 2) + pan[1]], [view.width, view.height, W, H, z, pan])
    const toScreen = useCallback(([x, y]) => [origin[0] + (x * z), origin[1] + (y * z)], [origin, z])
    const toOutput = useCallback((event) => {
        const rect = viewportRef.current.getBoundingClientRect()
        return [((event.clientX - rect.left) - origin[0]) / z, ((event.clientY - rect.top) - origin[1]) / z]
    }, [origin, z])

    // Space held = the hand, like every canvas tool.
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
    const panning = hand || spaceHeld

    // --- what each tab edits --------------------------------------------

    const editable = useCallback((surface) => tab === 'output' || isScreenKind(surface.source.kind) && surface.source.kind === 'wall', [tab])

    // The quad a slice shows on this tab, in OUTPUT pixels.
    const quadOf = useCallback((surface) => {
        if (tab === 'input') return inputCorners(screenInput(surface), surface.inputRotation || 0, W, H)
        return surface.corners.map(([x, y]) => [x * W, y * H])
    }, [tab, W, H])

    // The shape a person sees on this tab: the bent edge on the wall, the
    // plain input rectangle on the composition.
    const outlineOf = useCallback((surface) => (tab === 'input' ? quadOf(surface) : sliceOutline(quadOf(surface), surface.warp)), [tab, quadOf])

    // Write a new quad back as the right patch for this tab.
    const patchFor = useCallback((surface, quad) => {
        if (tab === 'input') {
            const frame = frameOf(quad)
            const input = [
                (frame.x - (frame.width / 2)) / W, (frame.y - (frame.height / 2)) / H,
                Math.max(1, frame.width) / W, Math.max(1, frame.height) / H
            ].map((value) => Math.round(value * 1e6) / 1e6)
            return { input, inputRotation: Math.round(frame.rotation * 1e4) / 1e4 }
        }
        return { corners: quad.map(([x, y]) => [Math.round((x / W) * 1e6) / 1e6, Math.round((y / H) * 1e6) / 1e6]) }
    }, [tab, W, H])

    const byId = useMemo(() => new Map(surfaces.map((surface) => [surface.id, surface])), [surfaces])
    const selected = useMemo(() => selectedIds.map((id) => byId.get(id)).filter(Boolean).filter(editable), [selectedIds, byId, editable])
    const primary = selected[selected.length - 1] || null

    // --- snapping --------------------------------------------------------

    const candidates = useMemo(() => {
        const xs = [0, W / 2, W]
        const ys = [0, H / 2, H]
        if (grid > 0) {
            for (let i = 1; i < grid; i += 1) { xs.push((W * i) / grid); ys.push((H * i) / grid) }
        }
        surfaces.forEach((surface) => {
            if (selectedIds.includes(surface.id) || !surface.enabled) return
            if (tab === 'input' && surface.source.kind !== 'wall') return
            quadOf(surface).forEach(([x, y]) => { xs.push(x); ys.push(y) })
        })
        return { xs, ys }
    }, [W, H, grid, surfaces, selectedIds, tab, quadOf])

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

    // --- the warp points of the primary slice (Edit Points) ---------------

    const points = useMemo(() => {
        if (tab !== 'output' || mode !== 'points' || !primary) return null
        const quad = quadOf(primary)
        const { columns, rows, points: grid0 } = warpPoints(primary.warp || { divisionsX: 0, divisionsY: 0 })
        const screen = grid0.map((local) => toWall(quad, local))
        if (screen.some((point) => !point)) return null
        return { columns, rows, local: grid0, output: screen, quad }
    }, [tab, mode, primary, quadOf])

    // --- pointer ---------------------------------------------------------

    const hitSlice = useCallback((point) => {
        for (let index = surfaces.length - 1; index >= 0; index -= 1) {
            const surface = surfaces[index]
            if (!surface.enabled || !editable(surface)) continue
            if (pointInQuad(point, outlineOf(surface))) return surface
        }
        return null
    }, [surfaces, editable, outlineOf])

    // One slice: its own frame (turned if it is a plain rectangle, else the
    // straight box round its bent shape). Several: the box round them all.
    const frame = useMemo(() => {
        if (!selected.length) return null
        if (selected.length > 1) return groupFrame(selected.map(outlineOf))
        return tab === 'input' ? frameOf(quadOf(selected[0])) : sliceFrame(quadOf(selected[0]), selected[0].warp)
    }, [selected, quadOf, outlineOf, tab])
    const handles = useMemo(() => (frame && mode === 'transform' || (frame && tab === 'input') ? frameHandles(frame) : []), [frame, mode, tab])

    const onPointerDown = (event) => {
        if (event.button === 1 || panning) {
            dragRef.current = { kind: 'pan', start: [event.clientX, event.clientY], pan }
            setGrabbing(true)
            event.currentTarget.setPointerCapture(event.pointerId)
            return
        }
        if (event.button !== 0) return
        const at = toOutput(event)
        const screenAt = [event.clientX, event.clientY]
        const rect = viewportRef.current.getBoundingClientRect()
        const local = [screenAt[0] - rect.left, screenAt[1] - rect.top]

        // Edit Points: a point first.
        if (points) {
            const hit = points.output.findIndex((point) => {
                const [sx, sy] = toScreen(point)
                return Math.hypot(sx - local[0], sy - local[1]) <= HANDLE + 3
            })
            if (hit !== -1) {
                let nextPoints = selectedPoints
                if (event.shiftKey) nextPoints = selectedPoints.includes(hit) ? selectedPoints.filter((i) => i !== hit) : [...selectedPoints, hit]
                else if (!selectedPoints.includes(hit)) nextPoints = [hit]
                onSelectPoints(nextPoints)
                dragRef.current = {
                    kind: 'points', start: at, surface: primary, quad: points.quad,
                    columns: points.columns, rows: points.rows, local: points.local, output: points.output,
                    moving: nextPoints, grab: hit
                }
                event.currentTarget.setPointerCapture(event.pointerId)
                return
            }
        }

        // Transform handles: corners scale, edges stretch, just outside a
        // corner rotates.
        if (frame && handles.length) {
            const index = handles.findIndex((point) => {
                const [sx, sy] = toScreen(point)
                return Math.hypot(sx - local[0], sy - local[1]) <= HANDLE + 4
            })
            const ring = index === -1 ? handles.slice(0, 4).findIndex((point) => {
                const [sx, sy] = toScreen(point)
                const distance = Math.hypot(sx - local[0], sy - local[1])
                return distance > HANDLE + 4 && distance <= ROTATE_RING
            }) : -1
            if (index !== -1 || ring !== -1) {
                const originals = new Map(selected.map((surface) => [surface.id, quadOf(surface)]))
                if (index !== -1) {
                    const opposite = index < 4 ? (index + 2) % 4 : 4 + ((index - 4 + 2) % 4)
                    dragRef.current = { kind: 'scale', start: at, frame, handle: index, pivot: handles[opposite], originals }
                } else {
                    dragRef.current = { kind: 'rotate', start: at, frame, originals }
                }
                event.currentTarget.setPointerCapture(event.pointerId)
                return
            }
        }

        // A slice's body: select it, and drag the whole selection.
        const hit = hitSlice(at)
        if (hit) {
            let ids = selectedIds
            if (event.shiftKey || event.ctrlKey || event.metaKey) ids = selectedIds.includes(hit.id) ? selectedIds.filter((id) => id !== hit.id) : [...selectedIds, hit.id]
            else if (!selectedIds.includes(hit.id)) ids = [hit.id]
            onSelect(ids)
            if (!ids.includes(hit.id)) return
            const moving = ids.map((id) => byId.get(id)).filter(Boolean).filter(editable)
            dragRef.current = { kind: 'move', start: at, originals: new Map(moving.map((surface) => [surface.id, quadOf(surface)])) }
            event.currentTarget.setPointerCapture(event.pointerId)
            return
        }

        // Empty bed: a marquee (points in Edit Points, slices otherwise).
        if (!event.shiftKey) {
            if (points) onSelectPoints([])
            else onSelect([])
        }
        dragRef.current = { kind: 'marquee', start: at, additive: event.shiftKey }
        setMarquee({ from: at, to: at })
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const writeQuads = (quads) => {
        const ops = []
        quads.forEach((quad, id) => {
            const surface = byId.get(id)
            if (surface) ops.push({ type: 'setMappingSurface', payload: { surfaceId: id, patch: patchFor(surface, quad) } })
        })
        if (ops.length) applyOps(ops)
    }

    const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag) return
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
            const pivot = event.altKey ? [f.x, f.y] : drag.pivot
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
            if (event.shiftKey && handle < 4) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * s; sy = Math.sign(sy || 1) * s }
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
            const patch = patchFor(surface, quad)
            const interior = drag.moving.filter((index) => cornerIndexOfPoint(index, drag.columns, drag.rows) === -1)
            const cornersMoved = interior.length !== drag.moving.length
            if (interior.length || (cornersMoved && surface.warp)) {
                // Interior points are stored in the slice's own square, so a
                // moved corner carries the unmoved points with it.
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
            if (points) {
                const hits = points.output.map((point, index) => (inside(point) ? index : -1)).filter((index) => index !== -1)
                onSelectPoints(drag.additive ? [...new Set([...selectedPoints, ...hits])] : hits)
            } else {
                const hits = surfaces.filter((surface) => surface.enabled && editable(surface) && outlineOf(surface).every(inside)).map((surface) => surface.id)
                onSelect(drag.additive ? [...new Set([...selectedIds, ...hits])] : hits)
            }
        }
    }

    // Wheel zooms about the pointer, the way Resolume's canvas does.
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

    // Input Selection shows the composition itself: one full-frame wall
    // screen, whatever is playing, nothing else.
    const composition = useMemo(() => ({
        ...mapping,
        surfaces: [{
            ...defaultMappingSurface,
            id: 'composition',
            corners: [[0, 0], [1, 0], [1, 1], [0, 1]],
            input: [0, 0, 1, 1],
            source: { kind: 'wall', ref: '' },
            resolution: [W, H]
        }]
    }), [mapping, W, H])

    const stageW = Math.max(1, Math.round(W * z))
    const stageH = Math.max(1, Math.round(H * z))
    const poly = (quad) => quad.map((point) => toScreen(point).map((value) => value.toFixed(1)).join(',')).join(' ')

    const gridLines = []
    if (grid > 0) {
        for (let i = 1; i < grid; i += 1) {
            const x = origin[0] + ((W * i * z) / grid)
            const y = origin[1] + ((H * i * z) / grid)
            gridLines.push(<line key={`gx${i}`} x1={x} y1={origin[1]} x2={x} y2={origin[1] + stageH} className="map-ao-grid" />)
            gridLines.push(<line key={`gy${i}`} x1={origin[0]} y1={y} x2={origin[0] + stageW} y2={y} className="map-ao-grid" />)
        }
    }

    const meshLines = (surface, quad) => {
        const { columns, rows, points: grid0 } = warpPoints(surface.warp || { divisionsX: 0, divisionsY: 0 })
        if (columns * rows <= 4) return null
        const out = grid0.map((local) => toWall(quad, local))
        if (out.some((point) => !point)) return null
        const lines = []
        for (let row = 0; row < rows; row += 1) {
            lines.push(out.slice(row * columns, (row + 1) * columns))
        }
        for (let column = 0; column < columns; column += 1) {
            lines.push(Array.from({ length: rows }, (_, row) => out[(row * columns) + column]))
        }
        return lines.map((line, index) => (
             
            <polyline key={index} className="map-ao-mesh" points={line.map((point) => toScreen(point).join(',')).join(' ')} />
        ))
    }

    const cursor = grabbing ? 'grabbing' : (panning ? 'grab' : 'default')

    return (
        <div
            className="map-ao-viewport"
            ref={viewportRef}
            role="application"
            aria-label={tab === 'input' ? 'Input selection' : 'Output transformation'}
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={onContext}
            data-help={tab === 'input'
                ? 'Input Selection: choose which part of the composition each slice takes. Drag to move, corners to scale, just outside a corner to rotate. Wheel zooms, space or the hand pans.'
                : 'Output Transformation: where each slice lands on the wall. Transform moves, scales and rotates; Edit Points bends the picture point by point.'}
        >
            {view.width > 0 ? (
                <div className="map-ao-stage" style={{ left: origin[0], top: origin[1], width: stageW, height: stageH }}>
                    <MapStage
                        mapping={tab === 'input' ? composition : mapping}
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
            <svg className="map-ao-overlay" width={view.width} height={view.height}>
                <rect className="map-ao-frame" x={origin[0]} y={origin[1]} width={stageW} height={stageH} />
                {gridLines}
                {surfaces.map((surface) => {
                    if (!surface.enabled || !editable(surface)) return null
                    const quad = quadOf(surface)
                    const isSelected = selectedIds.includes(surface.id)
                    const [lx, ly] = toScreen(quad[0])
                    return (
                        <g key={surface.id} className={`map-ao-slice${isSelected ? ' is-selected' : ''}`}>
                            <polygon points={poly(outlineOf(surface))} />
                            {tab === 'output' ? meshLines(surface, quad) : null}
                            <text x={lx + 6} y={ly + 16}>{surface.name || surface.id}</text>
                        </g>
                    )
                })}
                {guides.x.map((x) => <line key={`sx${x}`} className="map-ao-guide" x1={toScreen([x, 0])[0]} y1={0} x2={toScreen([x, 0])[0]} y2={view.height} />)}
                {guides.y.map((y) => <line key={`sy${y}`} className="map-ao-guide" x1={0} y1={toScreen([0, y])[1]} x2={view.width} y2={toScreen([0, y])[1]} />)}
                {handles.length ? (
                    <g className="map-ao-handles">
                        <polygon className="map-ao-frame-box" points={poly(handles.slice(0, 4))} />
                        {handles.map((point, index) => {
                            const [x, y] = toScreen(point)
                            return index < 4 ? (
                                 
                                <g key={index}>
                                    <circle className="map-ao-ring" cx={x} cy={y} r={HANDLE + 6} />
                                    <rect className="map-ao-handle" x={x - 5} y={y - 5} width={10} height={10} />
                                </g>
                            ) : (
                                 
                                <rect key={index} className="map-ao-handle" x={x - 5} y={y - 5} width={10} height={10} />
                            )
                        })}
                    </g>
                ) : null}
                {points ? (
                    <g className="map-ao-points">
                        {points.output.map((point, index) => {
                            const [x, y] = toScreen(point)
                            const corner = cornerIndexOfPoint(index, points.columns, points.rows) !== -1
                            const size = corner ? 16 : 10
                            return (
                                <rect
                                     
                                    key={index}
                                    className={`map-ao-point${selectedPoints.includes(index) ? ' is-selected' : ''}${corner ? ' is-corner' : ''}`}
                                    x={x - (size / 2)} y={y - (size / 2)} width={size} height={size}
                                />
                            )
                        })}
                    </g>
                ) : null}
                {marquee ? (() => {
                    const [ax, ay] = toScreen(marquee.from)
                    const [bx, by] = toScreen(marquee.to)
                    return <rect className="map-ao-marquee" x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} />
                })() : null}
            </svg>
        </div>
    )
}
