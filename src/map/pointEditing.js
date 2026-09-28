import { edgePoint, warpFunction, warpOutline } from './warpMesh.js'

// POINT EDITING, the way a mapper's hands expect it.
//
// Resolume taught a generation of operators one grammar: double-click an edge
// to put a point on it, click a point to hold it, Delete to take it away,
// arrows to nudge it, Ctrl+C / Ctrl+V to carry a slice. This file is the
// arithmetic under that grammar, kept out of the overlay so it can be tested
// without a pointer.
//
// A point BENDS the picture; it never cuts it. It lives on one of the four
// edges (side, t) and says where that piece of edge lands on the output
// (x, y — normalised output space, the same space the corners are in). The
// bending itself is src/map/warpMesh.js.

// A page cannot be bent: a cross-origin page cannot be sampled into a
// texture, so it stays a corner pin. Everything else is a picture we hold
// and can draw through a mesh.
export const isWarpable = (kind) => kind !== 'project' && kind !== 'url'

// Closest point on the segment a→b to p, and how far p is from it. The
// projection is clamped to the segment, so a point beyond an edge's end
// measures to that end rather than to empty space past it.
export const closestPointOnSegment = ([px, py], [ax, ay], [bx, by]) => {
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = (dx * dx) + (dy * dy)
    const t = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSquared))
    const point = [ax + (t * dx), ay + (t * dy)]
    return { point, t, distance: Math.hypot(px - point[0], py - point[1]) }
}

// The outline as stage pixels: every entry of warpOutline with its pixel
// position, in order round the shape.
export const outlineOnStage = (surface, width, height) =>
    warpOutline(surface.corners, surface.points || []).map((entry) => ({ ...entry, px: [entry.x * width, entry.y * height] }))

// Which segment of the outline a stage point is on, within `tolerance`
// pixels. Returns the segment's start entry, the point on it and the
// distance — or null, so a double-click in open space does nothing rather
// than putting a point on the nearest edge across the room.
export const nearestOutlineSegment = (outline, stagePoint, tolerance = Infinity) => {
    let best = null
    for (let i = 0; i < outline.length; i += 1) {
        const a = outline[i]
        const b = outline[(i + 1) % outline.length]
        const hit = closestPointOnSegment(stagePoint, a.px, b.px)
        if (hit.distance <= tolerance && (!best || hit.distance < best.distance)) {
            best = { start: a, end: b, point: hit.point, distance: hit.distance }
        }
    }
    return best
}

// Where along the STRAIGHT corner-to-corner line of a side a stage point
// falls — the parameter a warp point keeps, whatever the edge is bent into.
// Clamped just inside the corners: a point on a corner is a corner.
const sideParameter = (surface, side, [nx, ny]) => {
    const a = surface.corners[side]
    const b = surface.corners[(side + 1) % 4]
    const { t } = closestPointOnSegment([nx, ny], a, b)
    return Math.min(0.98, Math.max(0.02, t))
}

// Add a point where a double-click landed on the outline. The click is a
// stage pixel; the point goes on the side that piece of outline belongs to,
// at that position along it, pulled to exactly where the click was — so the
// edge already passes through the new point and nothing moves until it is
// dragged. Returns the new points and the new point's index, or null when
// the click was not on the outline at all.
export const addPointOnOutline = (surface, stagePoint, width, height, tolerance) => {
    if (!isWarpable(surface.source?.kind)) return null
    const outline = outlineOnStage(surface, width, height)
    const hit = nearestOutlineSegment(outline, stagePoint, tolerance)
    if (!hit) return null
    const side = hit.start.side
    const normalised = [hit.point[0] / width, hit.point[1] / height]
    const point = { side, t: sideParameter(surface, side, normalised), x: normalised[0], y: normalised[1] }
    const points = [...(surface.points || []), point]
    return { points, index: points.length - 1 }
}

// A point put on the middle of the piece of outline AFTER the held point —
// the panel's "+ Point" button, for a hand on the keyboard rather than the
// mouse. With nothing held, the middle of the top edge. Either way it sits
// on the edge as it is now, so adding a point changes nothing until it is
// moved.
export const addPointAfterHeld = (surface, heldIndex) => {
    if (!isWarpable(surface.source?.kind)) return null
    const points = surface.points || []
    const held = heldIndex !== null && points[heldIndex] ? points[heldIndex] : null
    const side = held ? held.side : 0
    const after = points.filter((point) => point.side === side && point.t > (held ? held.t : -1)).sort((a, b) => a.t - b.t)[0]
    const t = held
        ? (held.t + (after ? after.t : 1)) / 2
        : (after ? after.t / 2 : 0.5)
    const warp = warpFunction(surface.corners, points)
    const [x, y] = warp(...edgePoint(side, t))
    const next = [...points, { side, t, x, y }]
    return { points: next, index: next.length - 1 }
}

export const removePoint = (points, index) => {
    if (!Array.isArray(points) || index < 0 || index >= points.length) return points
    return points.filter((_, i) => i !== index)
}

// Put one point exactly at a normalised output position.
export const movePointTo = (points, index, [x, y]) =>
    points.map((point, i) => (i === index ? { ...point, x, y } : point))

// Move one point by a normalised delta — an arrow press is one output pixel,
// so the caller divides by the output size.
export const nudgePoint = (points, index, [dx, dy]) =>
    points.map((point, i) => (i === index ? { ...point, x: point.x + dx, y: point.y + dy } : point))

// --- values written by hand ---------------------------------------------
//
// The properties panel shows every corner and every point as X / Y in
// OUTPUT pixels — the projector's own pixels, the numbers a person on a
// ladder reads off the wall. Both are stored normalised, so both directions
// of the conversion live here, once.

export const cornerToOutput = ([x, y], output) => [x * output.width, y * output.height]
export const cornerFromOutput = ([x, y], output) => [x / output.width, y / output.height]
export const pointToOutput = (point, output) => [point.x * output.width, point.y * output.height]
export const pointFromOutput = (points, index, output, [x, y]) => movePointTo(points, index, [x / output.width, y / output.height])

// Every selected surface moved by one normalised delta — corners AND points,
// since the points are absolute on the output and a surface that moved
// without them would straighten out. One op per surface, applied as ONE
// batch, so a group drag is one undo step and the wall never shows half the
// group moved.
export const moveSurfacesOps = (surfaces, ids, [dx, dy]) => {
    const wanted = new Set(ids)
    return surfaces
        .filter((surface) => wanted.has(surface.id))
        .map((surface) => ({
            type: 'setMappingSurface',
            payload: {
                surfaceId: surface.id,
                patch: {
                    corners: surface.corners.map(([x, y]) => [x + dx, y + dy]),
                    points: (surface.points || []).map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }))
                }
            }
        }))
}

// --- carrying a surface through the clipboard ---------------------------
//
// Ctrl+C puts the selection on the SYSTEM clipboard as text, not only in
// the desk's memory: the desk that aligns a wall is often a second window or
// a second machine, and text is the one thing every clipboard on every
// machine agrees on. The marker lets paste tell a surface from any other
// text.

export const SURFACE_CLIPBOARD_MARK = 'di.iiii/mapping-surface'

const isSurfaceLike = (surface) => Boolean(surface && typeof surface === 'object' && Array.isArray(surface.corners))

// One or many: a single surface is written as `surface`, a selection as
// `surfaces`, and the reader accepts either, so a copy from an older desk
// still pastes.
export const surfacesToClipboardText = (surfaces) => {
    const list = Array.isArray(surfaces) ? surfaces : [surfaces]
    if (list.length === 1) return JSON.stringify({ kind: SURFACE_CLIPBOARD_MARK, surface: list[0] }, null, 2)
    return JSON.stringify({ kind: SURFACE_CLIPBOARD_MARK, surfaces: list }, null, 2)
}

export const surfacesFromClipboardText = (text) => {
    if (typeof text !== 'string' || !text.trim().startsWith('{')) return []
    try {
        const parsed = JSON.parse(text)
        if (parsed?.kind !== SURFACE_CLIPBOARD_MARK) return []
        const list = Array.isArray(parsed.surfaces) ? parsed.surfaces : [parsed.surface]
        return list.filter(isSurfaceLike)
    } catch {
        return []
    }
}

export const surfaceToClipboardText = (surface) => surfacesToClipboardText([surface])
export const surfaceFromClipboardText = (text) => surfacesFromClipboardText(text)[0] || null

// What a pasted surface looks like: the copy, without the original's id (the
// document hands out a new one), named as a copy, and set a little off so it
// is visibly its own thing rather than hiding exactly under the original.
const PASTE_OFFSET = 0.02

export const pastedSurface = (surface, offset = PASTE_OFFSET) => {
    const { id: _dropped, ...rest } = surface
    return {
        ...rest,
        name: `${surface.name || 'Surface'} copy`,
        corners: surface.corners.map(([x, y]) => [x + offset, y + offset]),
        points: (surface.points || []).map((point) => ({ ...point, x: point.x + offset, y: point.y + offset }))
    }
}
