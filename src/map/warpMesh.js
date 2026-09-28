import { applyHomography, solveHomography } from './cornerPin.js'

// THE WARP.
//
// A projector never sees a wall straight on, and a wall is rarely flat: a
// pillar, a folded panel, a curtain. Four corners can pin a picture to a
// plane; they cannot bend it round a column. Points can. A point sits on one
// of the surface's four edges, at a position `t` along that edge, and says
// where on the output that piece of edge actually lands. The picture is bent
// so that its edge passes through every point, and the inside follows.
//
// The bend is a DISPLACEMENT on top of the corner pin, not a replacement for
// it. With no points the mesh is the homography exactly — every vertex is
// where the matrix3d would have put it — so a mapping aligned before points
// existed does not move by a pixel. With points, each edge is displaced by a
// piecewise-linear curve through its points (zero at the corners), and the
// inside is a Coons blend of the four edge displacements: the standard
// transfinite interpolation, the same thing KantanMapper and MadMapper do
// for linear edges.
//
// Everything here is arithmetic on plain arrays so it can be tested without
// a GL context; MapWarpedSurface.jsx draws it.

const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]]

// Where a parameter along a side lands in the surface's own unit square.
// Sides are numbered like the corners: 0 top (TL→TR), 1 right (TR→BR),
// 2 bottom (BR→BL), 3 left (BL→TL) — each running from corner[s] to
// corner[s+1], and `t` from 0 at corner[s] to 1 at corner[s+1].
export const edgePoint = (side, t) => {
    switch (side) {
        case 0: return [t, 0]
        case 1: return [1, t]
        case 2: return [1 - t, 1]
        default: return [0, 1 - t]
    }
}

// The pin as a function: unit square → output, in whatever unit the corners
// are given (normalised or pixels).
export const pinFunction = (corners) => {
    const h = solveHomography(UNIT, corners)
    return (u, v) => applyHomography(h, [u, v])
}

// The displacement curve of one side: the points on that side sorted by t,
// each with the vector from where the pin would put it to where it has been
// dragged. Zero at both corners, linear between neighbours.
const sideCurve = (points, side, pin, scale) => {
    const own = points
        .filter((point) => point.side === side)
        .map((point) => {
            const [u, v] = edgePoint(side, point.t)
            const base = pin(u, v)
            return { t: point.t, d: [(point.x * scale[0]) - base[0], (point.y * scale[1]) - base[1]] }
        })
        .sort((a, b) => a.t - b.t)
    const knots = [{ t: 0, d: [0, 0] }, ...own, { t: 1, d: [0, 0] }]
    return (t) => {
        for (let i = 1; i < knots.length; i += 1) {
            const a = knots[i - 1]
            const b = knots[i]
            if (t <= b.t) {
                const span = b.t - a.t
                const k = span > 0 ? (t - a.t) / span : 0
                return [a.d[0] + ((b.d[0] - a.d[0]) * k), a.d[1] + ((b.d[1] - a.d[1]) * k)]
            }
        }
        return [0, 0]
    }
}

// The warp as a function: unit square → output pixels, corners in normalised
// output space, points in normalised output space, scale = [width, height].
export const warpFunction = (corners, points = [], scale = [1, 1]) => {
    const pin = pinFunction(corners.map(([x, y]) => [x * scale[0], y * scale[1]]))
    if (!points.length) return pin
    const top = sideCurve(points, 0, pin, scale)
    const right = sideCurve(points, 1, pin, scale)
    const bottom = sideCurve(points, 2, pin, scale)
    const left = sideCurve(points, 3, pin, scale)
    return (u, v) => {
        const base = pin(u, v)
        if (!base) return base
        // Each side's parameter runs from ITS first corner; bottom and left
        // run the other way round the square, so u and v are turned round
        // for them.
        const dTop = top(u)
        const dBottom = bottom(1 - u)
        const dRight = right(v)
        const dLeft = left(1 - v)
        const dx = ((1 - v) * dTop[0]) + (v * dBottom[0]) + ((1 - u) * dLeft[0]) + (u * dRight[0])
        const dy = ((1 - v) * dTop[1]) + (v * dBottom[1]) + ((1 - u) * dLeft[1]) + (u * dRight[1])
        return [base[0] + dx, base[1] + dy]
    }
}

// The mesh MapWarpedSurface draws: (n+1)² vertices over the unit square,
// positions in stage pixels, uvs in texture space, and the triangle indices.
// Flat typed arrays, ready for a buffer.
export const buildWarpMesh = (corners, points, width, height, n = 32) => {
    const warp = warpFunction(corners, points, [width, height])
    const count = (n + 1) * (n + 1)
    const positions = new Float32Array(count * 2)
    const uvs = new Float32Array(count * 2)
    let degenerate = false
    for (let j = 0; j <= n; j += 1) {
        for (let i = 0; i <= n; i += 1) {
            const u = i / n
            const v = j / n
            const p = warp(u, v)
            const k = ((j * (n + 1)) + i) * 2
            if (!p) { degenerate = true; positions[k] = 0; positions[k + 1] = 0 } else { positions[k] = p[0]; positions[k + 1] = p[1] }
            uvs[k] = u
            uvs[k + 1] = v
        }
    }
    const indices = new Uint16Array(n * n * 6)
    let at = 0
    for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
            const a = (j * (n + 1)) + i
            const b = a + 1
            const c = a + n + 1
            const d = c + 1
            indices[at++] = a; indices[at++] = c; indices[at++] = b
            indices[at++] = b; indices[at++] = c; indices[at++] = d
        }
    }
    return { positions, uvs, indices, n, degenerate }
}

// The outline the desk draws and the wall shows: round the four sides, each
// corner then that side's points in order. Normalised output space.
export const warpOutline = (corners, points = []) => {
    const outline = []
    for (let side = 0; side < 4; side += 1) {
        outline.push({ side, t: 0, x: corners[side][0], y: corners[side][1], corner: side })
        points
            .map((point, index) => ({ ...point, index }))
            .filter((point) => point.side === side)
            .sort((a, b) => a.t - b.t)
            .forEach((point) => outline.push(point))
    }
    return outline
}
