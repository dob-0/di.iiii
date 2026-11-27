// THE MATHS UNDER THE MAPPING WINDOW (MapAdvancedOutput.jsx).
//
// A slice is drawn in three steps, the way Resolume's Advanced Output does it:
//
//   1. INPUT — which piece of the wall picture: `input` [x, y, w, h] plus
//      `inputRotation`, in the output's normalised space (wallScreens.js).
//   2. WARP — the slice's own unit square, bent by a grid of points
//      (`warp.points`, row-major, (2^divisionsX + 1) × (2^divisionsY + 1)).
//      Points are stored in that pre-pin square, so moving the whole slice
//      carries its bends along with it.
//   3. PIN — the unit square onto the four `corners` on the wall, by a
//      homography. Corners stay the one source of truth for where a slice
//      sits, so every older reader (the 3D screen link, the Perform desk,
//      an old build) still finds the slice where it is.
//
// Transform-mode numbers (X, Y, Left, Top, Width, Height, Rotation) are READ
// from the corners and WRITTEN back as an affine move of the corners, so a
// slice that is already keystoned keeps its keystone when you widen it.

import { applyHomography, solveHomography } from './cornerPin.js'

const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]]
const EPSILON = 1e-6

// --- the warp grid ------------------------------------------------------

export const warpGridSize = (warp) => ({
    columns: (2 ** Math.max(0, Math.min(4, warp?.divisionsX | 0))) + 1,
    rows: (2 ** Math.max(0, Math.min(4, warp?.divisionsY | 0))) + 1
})

export const regularGrid = (divisionsX = 0, divisionsY = 0) => {
    const { columns, rows } = warpGridSize({ divisionsX, divisionsY })
    const points = []
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) points.push([column / (columns - 1), row / (rows - 1)])
    }
    return points
}

// The grid a slice actually has: its own points if they fit, else regular.
export const warpPoints = (warp) => {
    const { columns, rows } = warpGridSize(warp)
    const points = Array.isArray(warp?.points) && warp.points.length === columns * rows ? warp.points : null
    return { columns, rows, points: points || regularGrid(warp?.divisionsX | 0, warp?.divisionsY | 0) }
}

// A warp only costs anything when a point has actually left its place.
export const isWarpActive = (warp) => {
    if (!warp || warp.mode === 'perspective') return false
    const { columns, rows, points } = warpPoints(warp)
    return points.some(([u, v], index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        return Math.abs(u - (column / (columns - 1))) > EPSILON || Math.abs(v - (row / (rows - 1))) > EPSILON
    })
}

// Resample a grid to new divisions, keeping its shape: each new point is the
// old surface evaluated where the new point sits.
export const resampleWarp = (warp, divisionsX, divisionsY) => {
    const next = regularGrid(divisionsX, divisionsY).map(([u, v]) => evaluateWarp(warp, u, v))
    return { mode: warp?.mode || 'linear', divisionsX, divisionsY, points: next.map(([u, v]) => [round6(u), round6(v)]) }
}

const round6 = (value) => Math.round(value * 1e6) / 1e6
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

// Catmull-Rom through four values at t in [0, 1] between p1 and p2.
const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t
    const t3 = t2 * t
    return 0.5 * ((2 * p1) + ((-p0 + p2) * t) + (((2 * p0) - (5 * p1) + (4 * p2) - p3) * t2) + ((-p0 + (3 * p1) - (3 * p2) + p3) * t3))
}

// Where the unit-square point (u, v) goes inside the slice, after the warp.
export const evaluateWarp = (warp, u, v) => {
    if (!warp || warp.mode === 'perspective') return [u, v]
    const { columns, rows, points } = warpPoints(warp)
    const at = (column, row) => points[(clamp(row, 0, rows - 1) * columns) + clamp(column, 0, columns - 1)]
    const fx = clamp(u, 0, 1) * (columns - 1)
    const fy = clamp(v, 0, 1) * (rows - 1)
    const column = Math.min(columns - 2, Math.floor(fx))
    const row = Math.min(rows - 2, Math.floor(fy))
    const tx = fx - column
    const ty = fy - row
    if (warp.mode === 'bezier') {
        // Smooth through every point: a Catmull-Rom patch. Past the edge the
        // grid is continued in a straight line (2·edge − inner), not clamped:
        // a clamped neighbour flattens the end tangent and bends the first
        // and last cell of a grid nobody has touched.
        const extended = (c, r) => {
            const cc = clamp(c, 0, columns - 1)
            const rr = clamp(r, 0, rows - 1)
            const base = at(cc, rr)
            const stepC = c < 0 ? 1 : (c > columns - 1 ? -1 : 0)
            const stepR = r < 0 ? 1 : (r > rows - 1 ? -1 : 0)
            if (!stepC && !stepR) return base
            const inner = at(cc + stepC, rr + stepR)
            return [(2 * base[0]) - inner[0], (2 * base[1]) - inner[1]]
        }
        const result = [0, 0]
        for (let axis = 0; axis < 2; axis += 1) {
            const rowValues = [-1, 0, 1, 2].map((dy) => catmull(
                extended(column - 1, row + dy)[axis], extended(column, row + dy)[axis],
                extended(column + 1, row + dy)[axis], extended(column + 2, row + dy)[axis], tx
            ))
            result[axis] = catmull(rowValues[0], rowValues[1], rowValues[2], rowValues[3], ty)
        }
        return result
    }
    // Linear: bilinear inside each cell.
    const a = at(column, row)
    const b = at(column + 1, row)
    const c = at(column, row + 1)
    const d = at(column + 1, row + 1)
    const top = [a[0] + ((b[0] - a[0]) * tx), a[1] + ((b[1] - a[1]) * tx)]
    const bottom = [c[0] + ((d[0] - c[0]) * tx), c[1] + ((d[1] - c[1]) * tx)]
    return [top[0] + ((bottom[0] - top[0]) * ty), top[1] + ((bottom[1] - top[1]) * ty)]
}

// --- the pin --------------------------------------------------------------

// Unit square -> the slice's corners, in whatever space the corners are in.
export const pinOf = (corners) => solveHomography(UNIT, corners)
export const unpinOf = (corners) => solveHomography(corners, UNIT)

export const toWall = (corners, local) => applyHomography(pinOf(corners), local)
export const toLocal = (corners, point) => applyHomography(unpinOf(corners), point)

// A tessellated slice: an n×n lattice of [local u, v] -> output point.
// `corners` in output pixels. Used by the WebGL mesh and the point editor's
// outline alike.
export const tessellate = (corners, warp, steps = 32) => {
    const pin = pinOf(corners)
    if (!pin) return null
    const lattice = []
    for (let j = 0; j <= steps; j += 1) {
        for (let i = 0; i <= steps; i += 1) {
            const u = i / steps
            const v = j / steps
            const local = evaluateWarp(warp, u, v)
            lattice.push({ u, v, point: applyHomography(pin, local) })
        }
    }
    return { steps, lattice }
}

// --- transform-mode numbers --------------------------------------------

// Read position, size and rotation off four corners in PIXELS. For a plain
// rectangle these are exact; for a keystoned quad they are the averages a
// person would call its size.
export const frameOf = (corners) => {
    const [tl, tr, br, bl] = corners
    const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4
    const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4
    const width = (Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) + Math.hypot(br[0] - bl[0], br[1] - bl[1])) / 2
    const height = (Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) + Math.hypot(br[0] - tr[0], br[1] - tr[1])) / 2
    const angle = Math.atan2((tr[1] - tl[1]) + (br[1] - bl[1]), (tr[0] - tl[0]) + (br[0] - bl[0]))
    return { x: cx, y: cy, width, height, rotation: (angle * 180) / Math.PI, left: cx - (width / 2), top: cy - (height / 2) }
}

const rotate = ([x, y], [cx, cy], radians) => {
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const dx = x - cx
    const dy = y - cy
    return [cx + (dx * cos) - (dy * sin), cy + (dx * sin) + (dy * cos)]
}

// Scale about a pivot along the slice's own axes (its rotation), so widening a
// rotated slice widens it along its length, not along the screen.
export const scaleCorners = (corners, sx, sy, pivot, rotationDeg = 0) => {
    const radians = (rotationDeg * Math.PI) / 180
    return corners.map((corner) => {
        const local = rotate(corner, pivot, -radians)
        const scaled = [pivot[0] + ((local[0] - pivot[0]) * sx), pivot[1] + ((local[1] - pivot[1]) * sy)]
        return rotate(scaled, pivot, radians)
    })
}

export const rotateCorners = (corners, degrees, pivot) => corners.map((corner) => rotate(corner, pivot, (degrees * Math.PI) / 180))
export const moveCorners = (corners, dx, dy) => corners.map(([x, y]) => [x + dx, y + dy])

// One typed number -> new corners (pixels).
export const setFrameField = (corners, field, value) => {
    const frame = frameOf(corners)
    const center = [frame.x, frame.y]
    switch (field) {
        case 'x': return moveCorners(corners, value - frame.x, 0)
        case 'y': return moveCorners(corners, 0, value - frame.y)
        case 'left': return moveCorners(corners, value - frame.left, 0)
        case 'top': return moveCorners(corners, 0, value - frame.top)
        case 'width': return frame.width > EPSILON ? scaleCorners(corners, value / frame.width, 1, center, frame.rotation) : corners
        case 'height': return frame.height > EPSILON ? scaleCorners(corners, 1, value / frame.height, center, frame.rotation) : corners
        case 'rotation': return rotateCorners(corners, value - frame.rotation, center)
        default: return corners
    }
}

// The same numbers for an input rectangle with a rotation, in pixels.
export const inputFrameOf = (input, rotation, W, H) => {
    const width = input[2] * W
    const height = input[3] * H
    const x = (input[0] * W) + (width / 2)
    const y = (input[1] * H) + (height / 2)
    return { x, y, width, height, rotation, left: x - (width / 2), top: y - (height / 2) }
}

export const inputFromFrame = ({ x, y, width, height }, W, H) => [
    (x - (width / 2)) / W, (y - (height / 2)) / H, Math.max(1, width) / W, Math.max(1, height) / H
]

// The four corners of an input rectangle, rotated about its centre, in pixels.
export const inputCorners = (input, rotation, W, H) => {
    const frame = inputFrameOf(input, rotation, W, H)
    const rect = [
        [frame.left, frame.top], [frame.left + frame.width, frame.top],
        [frame.left + frame.width, frame.top + frame.height], [frame.left, frame.top + frame.height]
    ]
    return rotateCorners(rect, rotation, [frame.x, frame.y])
}

// --- soft edge ------------------------------------------------------------

// Paul Bourke's edge-blend curve, which is what Resolume's Power, Luminance
// and Gamma name: x runs 0 at the outer edge to 1 where the blend ends.
export const softEdgeCurve = (x, { power = 2, luminance = 0.5, gamma = 1 } = {}) => {
    const t = clamp(x, 0, 1)
    const f = t < 0.5
        ? luminance * ((2 * t) ** power)
        : 1 - ((1 - luminance) * ((2 * (1 - t)) ** power))
    return clamp(f, 0, 1) ** (1 / Math.max(0.1, gamma))
}

// CSS mask for a soft edge on a box: one gradient across, one down, kept
// where both are opaque. Twelve stops per side is smooth at any size a
// projector blend is made at.
export const softEdgeMask = (softEdge) => {
    if (!softEdge?.enabled) return null
    const { left = 0, right = 0, top = 0, bottom = 0 } = softEdge
    if (!(left > 0 || right > 0 || top > 0 || bottom > 0)) return null
    const ramp = (from, width, reverse) => {
        const stops = []
        for (let step = 0; step <= 12; step += 1) {
            const x = step / 12
            const alpha = softEdgeCurve(x, softEdge)
            const at = reverse ? 100 - ((from + (width * x)) * 100) : (from + (width * x)) * 100
            stops.push({ at, alpha })
        }
        return reverse ? stops.reverse() : stops
    }
    const axis = (start, end, direction) => {
        const stops = [
            ...(start > 0 ? ramp(0, start, false) : [{ at: 0, alpha: 1 }]),
            ...(end > 0 ? ramp(0, end, true) : [{ at: 100, alpha: 1 }])
        ]
        return `linear-gradient(${direction}, ${stops.map(({ at, alpha }) => `rgba(0,0,0,${alpha.toFixed(4)}) ${at.toFixed(3)}%`).join(', ')})`
    }
    return `${axis(left, right, 'to right')}, ${axis(top, bottom, 'to bottom')}`
}

// --- colour ----------------------------------------------------------------

// Brightness / contrast / red / green / blue as one SVG component transfer,
// so a slice can be balanced against its neighbour on a different projector.
// brightness and contrast are stored as multipliers (1 = untouched); the
// window shows them 0-centred like Resolume.
export const colourTransfer = ({ brightness = 1, contrast = 1, red = 0, green = 0, blue = 0 } = {}) => {
    if (brightness === 1 && contrast === 1 && !red && !green && !blue) return null
    const channel = (gain) => {
        const slope = contrast * brightness * (1 + gain)
        const intercept = (0.5 - (0.5 * contrast)) * brightness * (1 + gain)
        return { slope: Number(slope.toFixed(4)), intercept: Number(intercept.toFixed(4)) }
    }
    return { r: channel(red), g: channel(green), b: channel(blue) }
}

// --- the shape a person sees -------------------------------------------

// The slice's real edge, after the warp: points walked round the unit
// square's border and pushed through warp and pin. This is what is outlined,
// hit-tested and boxed — the four corners alone lie as soon as an edge point
// has moved (2026-10-25: the outline stayed straight while the picture bent).
export const sliceOutline = (corners, warp, perEdge = 16) => {
    const pin = pinOf(corners)
    if (!pin) return corners
    if (!isWarpActive(warp)) return corners
    const border = []
    for (let i = 0; i < perEdge; i += 1) border.push([i / perEdge, 0])
    for (let i = 0; i < perEdge; i += 1) border.push([1, i / perEdge])
    for (let i = 0; i < perEdge; i += 1) border.push([1 - (i / perEdge), 1])
    for (let i = 0; i < perEdge; i += 1) border.push([0, 1 - (i / perEdge)])
    return border.map(([u, v]) => applyHomography(pin, evaluateWarp(warp, u, v)))
}

// Four corners that make a rectangle at some angle: right angles, opposite
// sides equal. Only such a slice keeps a turned transform box.
export const isRectangle = (corners, tolerance = 0.01) => {
    const [tl, tr, br, bl] = corners
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
    const dot = (a, b) => (a[0] * b[0]) + (a[1] * b[1])
    const len = (a) => Math.hypot(a[0], a[1])
    const top = sub(tr, tl)
    const left = sub(bl, tl)
    const bottom = sub(br, bl)
    const right = sub(br, tr)
    const scale = Math.max(len(top), len(left), 1e-9)
    return Math.abs(dot(top, left)) / (len(top) * len(left) || 1) < tolerance
        && Math.abs(len(top) - len(bottom)) / scale < tolerance
        && Math.abs(len(left) - len(right)) / scale < tolerance
        && Math.abs(dot(top, right)) / (len(top) * len(right) || 1) < tolerance
}

const boxOf = (points) => {
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    const left = Math.min(...xs)
    const top = Math.min(...ys)
    const width = Math.max(...xs) - left
    const height = Math.max(...ys) - top
    return { x: left + (width / 2), y: top + (height / 2), width, height, rotation: 0, left, top, boxed: true }
}

// The transform frame of a slice, in pixels. A plain (turned) rectangle keeps
// its own turned frame; anything keystoned or bent gets the straight box
// round everything it covers, as Resolume draws it.
export const sliceFrame = (corners, warp) => {
    if (!isWarpActive(warp) && isRectangle(corners)) return { ...frameOf(corners), boxed: false }
    return boxOf(sliceOutline(corners, warp))
}

// Several slices: always the straight box round all of them.
export const groupFrame = (outlines) => boxOf(outlines.flat())

// A typed number against a straight box: moves and scales along the screen's
// own axes, about the box, so the bends travel with the slice.
export const setBoxField = (corners, box, field, value) => {
    const center = [box.x, box.y]
    switch (field) {
        case 'x': return moveCorners(corners, value - box.x, 0)
        case 'y': return moveCorners(corners, 0, value - box.y)
        case 'left': return moveCorners(corners, value - box.left, 0)
        case 'top': return moveCorners(corners, 0, value - box.top)
        case 'width': return box.width > EPSILON ? scaleCorners(corners, value / box.width, 1, center, 0) : corners
        case 'height': return box.height > EPSILON ? scaleCorners(corners, 1, value / box.height, center, 0) : corners
        case 'rotation': return rotateCorners(corners, value, center)
        default: return corners
    }
}
