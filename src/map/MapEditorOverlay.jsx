import { useCallback, useMemo, useRef, useState } from 'react'
import { cornersToPixels, guideCandidates, isDegenerateQuad, snapToGrid, snapToGuides } from './cornerPin.js'
import { addPointOnOutline, isWarpable, movePointTo, outlineOnStage, removePoint } from './pointEditing.js'

// Hold alt to place a corner exactly where the pointer is, ignoring both the
// grid and every neighbour. Every tool that snaps needs one key that doesn't,
// or the one surface that genuinely sits a hair off a neighbour cannot be
// expressed at all.
const snapOff = (event) => Boolean(event?.altKey)

const HANDLE_R = 7
const POINT_R = 5
// How near a corner has to come, in screen pixels, before it agrees with a
// neighbour. Converted to normalised units against the stage, so the feel is
// the same whether the preview is small or the output is 4K.
const SNAP_PIXELS = 7
// How near an edge a double-click has to land to put a point on it. Wider
// than the snap: a double-click is aimed at a line one pixel thick.
const EDGE_PIXELS = 10
const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL']

// The handles, drawn over the stage in the SAME pixel space the surfaces are
// pinned into. Not scaled with the stage: a handle is for a finger or a mouse,
// so it stays the size of a finger however small the preview gets.
//
// The grammar is Resolume's, because that is the grammar in the hands of
// everyone who has ever mapped a wall, and there is NO MODE: a selected
// surface shows its corners and its points at once. Drag a corner to pin,
// drag the body to move (every selected surface moves together), double-click
// an edge to put a point there and drag it to bend the picture, click a
// point to hold it, shift-click a surface to add it to the selection.
export default function MapEditorOverlay({
    mapping,
    width,
    height,
    selectedIds = [],
    selectedPointIndex = null,
    grid = 0,
    snap = true,
    onSelect,
    onSelectPoint,
    onCornersChange,
    onMoveSelection,
    onPointsChange,
    onAddPoint
}) {
    const svgRef = useRef(null)
    const dragRef = useRef(null)
    // Which lines the corner currently agrees with. Drawn while dragging and
    // gone the moment the finger lifts: a snap nobody can see is a snap nobody
    // can trust.
    const [guides, setGuides] = useState({ x: null, y: null })

    const primaryId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

    // Solved once per render so handles and hit-testing agree with what the
    // browser is actually drawing.
    const geometry = useMemo(
        () => (mapping?.surfaces || []).map((surface) => {
            const corners = cornersToPixels(surface.corners, width, height)
            return { surface, corners, degenerate: isDegenerateQuad(corners), outline: outlineOnStage(surface, width, height) }
        }),
        [mapping, width, height]
    )

    const pointAt = useCallback((event) => {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return [0, 0]
        return [event.clientX - rect.left, event.clientY - rect.top]
    }, [])

    const endDrag = useCallback((event) => {
        dragRef.current = null
        setGuides({ x: null, y: null })
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already gone */ }
    }, [])

    const onPointerMove = useCallback((event) => {
        const drag = dragRef.current
        if (!drag) return
        const [x, y] = pointAt(event)

        if (drag.kind === 'corner') {
            // Grid first, then guides: the grid is a coarse decision about
            // where things may sit at all, and a neighbour's edge should be
            // able to win over it.
            let point = snapToGrid([x / width, y / height], snapOff(event) ? 0 : grid)
            let agreed = { guideX: null, guideY: null }
            if (snap && !snapOff(event)) {
                const result = snapToGuides(point, drag.candidates, SNAP_PIXELS / width)
                point = result.point
                agreed = result
            }
            setGuides({ x: agreed.guideX, y: agreed.guideY })
            const corners = drag.corners.map((corner, index) => (index === drag.index ? point : corner))
            onCornersChange?.(drag.surfaceId, corners)
            return
        }

        if (drag.kind === 'body') {
            // The delta is from where the drag BEGAN, against the surfaces as
            // they were then — never cumulative, so a drag that jitters does
            // not walk the group off by the sum of its jitters.
            onMoveSelection?.([(x - drag.origin[0]) / width, (y - drag.origin[1]) / height], drag.start)
            return
        }

        if (drag.kind === 'point') {
            // A point goes exactly where the finger is; the grid applies,
            // the neighbours' corners do not — a bend is a local thing.
            const point = snapToGrid([x / width, y / height], snapOff(event) ? 0 : grid)
            onPointsChange?.(drag.surfaceId, movePointTo(drag.points, drag.index, point))
        }
    }, [pointAt, width, height, grid, snap, onCornersChange, onMoveSelection, onPointsChange])

    const startCornerDrag = (surface, index) => (event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
            kind: 'corner',
            surfaceId: surface.id,
            index,
            corners: surface.corners,
            // Computed once per drag, not per frame: the candidate set cannot
            // change mid-drag, and rebuilding it 60 times a second across
            // every surface is work for nothing.
            candidates: guideCandidates(mapping?.surfaces || [], surface.id)
        }
        onSelect?.(surface.id, false)
        onSelectPoint?.(null)
    }

    const startBodyDrag = (surface) => (event) => {
        onSelect?.(surface.id, event.shiftKey)
        onSelectPoint?.(null)
        // Shift-click is a choice about the selection, not the start of a move.
        if (event.shiftKey) return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { kind: 'body', origin: pointAt(event), start: mapping?.surfaces || [] }
    }

    const startPointDrag = (surface, index) => (event) => {
        event.stopPropagation()
        // Shift-click removes a point; Delete on a held point does the same.
        if (event.shiftKey) {
            onPointsChange?.(surface.id, removePoint(surface.points, index))
            onSelectPoint?.(null)
            return
        }
        onSelectPoint?.(index)
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { kind: 'point', surfaceId: surface.id, index, points: surface.points }
    }

    // Double-click on the outline of a selected surface puts a point there.
    // The point starts exactly on the edge, so nothing moves until it is
    // dragged — and then the picture bends to follow it.
    const onDoubleClick = (event) => {
        const stagePoint = pointAt(event)
        for (const entry of geometry) {
            if (!selectedSet.has(entry.surface.id) || entry.degenerate) continue
            const added = addPointOnOutline(entry.surface, stagePoint, width, height, EDGE_PIXELS)
            if (added) { onAddPoint?.(entry.surface.id, added.points, added.index); return }
        }
    }

    return (
        <svg
            ref={svgRef}
            className="map-overlay"
            width={width}
            height={height}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={onDoubleClick}
        >
            {guides.x !== null ? (
                <line className="map-guide" x1={guides.x * width} y1={0} x2={guides.x * width} y2={height} />
            ) : null}
            {guides.y !== null ? (
                <line className="map-guide" x1={0} y1={guides.y * height} x2={width} y2={guides.y * height} />
            ) : null}
            {geometry.map((entry) => {
                const { surface, corners, degenerate, outline } = entry
                const selected = selectedSet.has(surface.id)
                const primary = surface.id === primaryId
                const bendable = isWarpable(surface.source?.kind)
                // The outline is the bent edge — the picture's real border on
                // the wall — not the four straight sides.
                const points = outline.map((node) => `${node.px[0]},${node.px[1]}`).join(' ')
                const classes = ['map-overlay-surface', selected ? 'is-selected' : '', primary ? 'is-primary' : '', surface.enabled ? '' : 'is-off']
                return (
                    <g key={surface.id} className={classes.filter(Boolean).join(' ')}>
                        <polygon className="map-overlay-hit" points={points} onPointerDown={startBodyDrag(surface)} />
                        <polygon className="map-overlay-outline" points={points} />
                        <text className="map-overlay-name" x={corners[0][0] + 6} y={corners[0][1] + 14}>
                            {surface.name || surface.id}
                        </text>
                        {degenerate ? (
                            <text className="map-overlay-warn" x={corners[0][0] + 6} y={corners[0][1] + 30}>
                                corners collapsed
                            </text>
                        ) : null}

                        {selected ? corners.map(([x, y], index) => (
                            <g key={index} className="map-overlay-handle">
                                <circle cx={x} cy={y} r={HANDLE_R} onPointerDown={startCornerDrag(surface, index)} />
                                {primary ? <text x={x + HANDLE_R + 3} y={y - HANDLE_R}>{CORNER_LABELS[index]}</text> : null}
                            </g>
                        )) : null}

                        {primary && bendable ? (surface.points || []).map((point, index) => (
                            <circle
                                key={index}
                                className={`map-overlay-point${index === selectedPointIndex ? ' is-selected' : ''}`}
                                cx={point.x * width}
                                cy={point.y * height}
                                r={index === selectedPointIndex ? POINT_R + 2 : POINT_R}
                                onPointerDown={startPointDrag(surface, index)}
                            />
                        )) : null}
                    </g>
                )
            })}
        </svg>
    )
}
