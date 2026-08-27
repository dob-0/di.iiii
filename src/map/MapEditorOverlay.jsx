import { useCallback, useMemo, useRef } from 'react'
import { applyHomography, cornersToPixels, inverseHomography, isDegenerateQuad } from './cornerPin.js'

// Perpendicular distance from a point to a line SEGMENT (not the infinite
// line): the projection is clamped to the segment, so a point beyond an edge's
// end measures to that end rather than to empty space past it.
export const distanceToSegment = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = (dx * dx) + (dy * dy)
    if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)
    const t = Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSquared))
    return Math.hypot(px - (ax + (t * dx)), py - (ay + (t * dy)))
}

const HANDLE_R = 9
const MASK_R = 6
const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL']

// The handles, drawn over the stage in the SAME pixel space the surfaces are
// pinned into. Not scaled with the stage: a handle is for a finger or a mouse,
// so it stays the size of a finger however small the preview gets.
export default function MapEditorOverlay({
    mapping,
    width,
    height,
    selectedSurfaceId,
    maskMode = false,
    onSelectSurface,
    onCornersChange,
    onMaskChange
}) {
    const svgRef = useRef(null)
    const dragRef = useRef(null)

    const geometry = useMemo(() => (mapping?.surfaces || []).map((surface) => {
        const corners = cornersToPixels(surface.corners, width, height)
        const degenerate = isDegenerateQuad(corners)
        const [rw, rh] = surface.resolution
        const local = [[0, 0], [rw, 0], [rw, rh], [0, rh]]
        return {
            surface,
            corners,
            degenerate,
            // Solved once per render so mask handles and mask hit-testing
            // agree with what the browser is actually drawing.
            toStage: degenerate ? null : inverseHomography(corners, local),
            toLocal: degenerate ? null : inverseHomography(local, corners)
        }
    }), [mapping, width, height])

    const pointAt = useCallback((event) => {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return [0, 0]
        return [event.clientX - rect.left, event.clientY - rect.top]
    }, [])

    const endDrag = useCallback((event) => {
        dragRef.current = null
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* already gone */ }
    }, [])

    const onPointerMove = useCallback((event) => {
        const drag = dragRef.current
        if (!drag) return
        const [x, y] = pointAt(event)

        if (drag.kind === 'corner') {
            const corners = drag.corners.map((corner, index) => (
                index === drag.index ? [x / width, y / height] : corner
            ))
            onCornersChange?.(drag.surfaceId, corners)
            return
        }

        if (drag.kind === 'body') {
            const dx = (x - drag.origin[0]) / width
            const dy = (y - drag.origin[1]) / height
            onCornersChange?.(drag.surfaceId, drag.corners.map(([cx, cy]) => [cx + dx, cy + dy]))
            return
        }

        if (drag.kind === 'mask') {
            const local = applyHomography(drag.toLocal, [x, y])
            if (!local) return
            const [rw, rh] = drag.resolution
            const mask = drag.mask.map((point, index) => (
                index === drag.index ? [local[0] / rw, local[1] / rh] : point
            ))
            onMaskChange?.(drag.surfaceId, mask)
        }
    }, [pointAt, width, height, onCornersChange, onMaskChange])

    const startCornerDrag = (surface, index) => (event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { kind: 'corner', surfaceId: surface.id, index, corners: surface.corners }
        onSelectSurface?.(surface.id)
    }

    const startBodyDrag = (surface) => (event) => {
        onSelectSurface?.(surface.id)
        if (maskMode) return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { kind: 'body', surfaceId: surface.id, corners: surface.corners, origin: pointAt(event) }
    }

    const startMaskDrag = (entry, index) => (event) => {
        event.stopPropagation()
        // Alt-click removes a point. A mask needs three to enclose anything, so
        // the third-from-last removal is refused rather than silently turning
        // the mask off.
        if (event.altKey) {
            if (entry.surface.mask.length <= 3) return
            onMaskChange?.(entry.surface.id, entry.surface.mask.filter((_, i) => i !== index))
            return
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
            kind: 'mask',
            surfaceId: entry.surface.id,
            index,
            mask: entry.surface.mask,
            toLocal: entry.toLocal,
            resolution: entry.surface.resolution
        }
    }

    // Clicking inside the selected surface while masking adds a point.
    //
    // Below three points the shape is still being DRAWN, so clicks simply
    // append in the order they were made — tracing a paper edge is click,
    // click, click round the shape. From three on, the shape exists and a new
    // click is an EDIT, so the point goes into the edge it actually lands on.
    //
    // "Nearest edge" is distance to the SEGMENT, not to its midpoint. Midpoint
    // distance was the first version and it wove the polygon into a zigzag:
    // clicking near a long edge's end picks a short neighbouring edge whose
    // midpoint happens to be closer.
    const addMaskPoint = (entry) => (event) => {
        if (!maskMode || !entry.toLocal) return
        const [x, y] = pointAt(event)
        const local = applyHomography(entry.toLocal, [x, y])
        if (!local) return
        const [rw, rh] = entry.surface.resolution
        const point = [local[0] / rw, local[1] / rh]
        const mask = entry.surface.mask

        if (mask.length < 3) {
            onMaskChange?.(entry.surface.id, [...mask, point])
            return
        }

        let bestIndex = mask.length
        let bestDistance = Infinity
        for (let i = 0; i < mask.length; i += 1) {
            const distance = distanceToSegment(point, mask[i], mask[(i + 1) % mask.length])
            if (distance < bestDistance) { bestDistance = distance; bestIndex = i + 1 }
        }
        onMaskChange?.(entry.surface.id, [...mask.slice(0, bestIndex), point, ...mask.slice(bestIndex)])
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
        >
            {geometry.map((entry) => {
                const { surface, corners, degenerate } = entry
                const selected = surface.id === selectedSurfaceId
                const points = corners.map(([x, y]) => `${x},${y}`).join(' ')
                return (
                    <g key={surface.id} className={`map-overlay-surface${selected ? ' is-selected' : ''}${surface.enabled ? '' : ' is-off'}`}>
                        <polygon
                            className="map-overlay-hit"
                            points={points}
                            onPointerDown={maskMode && selected ? addMaskPoint(entry) : startBodyDrag(surface)}
                        />
                        <polygon className="map-overlay-outline" points={points} />
                        <text className="map-overlay-name" x={corners[0][0] + 8} y={corners[0][1] + 20}>
                            {surface.name || surface.id}
                        </text>
                        {degenerate ? (
                            <text className="map-overlay-warn" x={corners[0][0] + 8} y={corners[0][1] + 40}>
                                corners collapsed
                            </text>
                        ) : null}

                        {selected && !maskMode ? corners.map(([x, y], index) => (
                            <g key={index} className="map-overlay-handle">
                                <circle cx={x} cy={y} r={HANDLE_R} onPointerDown={startCornerDrag(surface, index)} />
                                <text x={x + HANDLE_R + 4} y={y - HANDLE_R}>{CORNER_LABELS[index]}</text>
                            </g>
                        )) : null}

                        {selected && maskMode && entry.toStage ? surface.mask.map((point, index) => {
                            const [rw, rh] = surface.resolution
                            const stage = applyHomography(entry.toStage, [point[0] * rw, point[1] * rh])
                            if (!stage) return null
                            return (
                                <circle
                                    key={index}
                                    className="map-overlay-mask-point"
                                    cx={stage[0]}
                                    cy={stage[1]}
                                    r={MASK_R}
                                    onPointerDown={startMaskDrag(entry, index)}
                                />
                            )
                        }) : null}
                    </g>
                )
            })}
        </svg>
    )
}
