// FLOOR MAP — the place from above, drawn as it is walked.
//
// Pure: it turns coverage, the walked path, the kept shots, the person and the
// next spot into pixel primitives for a canvas of a given size. North is "up" =
// the direction the session started facing (-z), x to the right — the same
// orientation as the plans in scripts/place/ (paint_plan.py), so a map and a plan
// read the same way round.
//
// Each floor column shows its WORST cell: a wall seen well at eye height but
// missed at the top is still a gap, and the map is where gaps are found.

import { STATE_GOOD, STATE_MISSED, STATE_THIN, cellState } from './coverage.js'
import { forwardOf, headingOf } from './arMath.js'

const RANK = { [STATE_MISSED]: 0, [STATE_THIN]: 1, [STATE_GOOD]: 2 }
const MIN_SPAN_METRES = 4

export const floorMapModel = ({ coverage, path = [], shots = [], pose = null, spot = null, width, height, padPx = 8 }) => {
    const size = coverage?.cellMetres || 0.25
    const columns = new Map()
    for (const cell of coverage?.cells?.values() || []) {
        const key = `${Math.floor(cell.centre[0] / size)},${Math.floor(cell.centre[2] / size)}`
        const state = cellState(cell)
        const now = columns.get(key)
        if (!now || RANK[state] < RANK[now.state]) columns.set(key, { x: cell.centre[0], z: cell.centre[2], state })
    }
    const xs = [...[...columns.values()].map((c) => c.x), ...path.map((p) => p[0])]
    const zs = [...[...columns.values()].map((c) => c.z), ...path.map((p) => p[2])]
    if (pose) { xs.push(pose.position[0]); zs.push(pose.position[2]) }
    if (spot) { xs.push(spot.spot[0]); zs.push(spot.spot[2]) }
    if (!xs.length) return { scale: 0, cells: [], path: [], shots: [], me: null, spot: null }
    let minX = Math.min(...xs) - size
    let maxX = Math.max(...xs) + size
    let minZ = Math.min(...zs) - size
    let maxZ = Math.max(...zs) + size
    // A first second of walking must not fill the map with one metre.
    const grow = (lo, hi) => {
        const extra = Math.max(0, MIN_SPAN_METRES - (hi - lo)) / 2
        return [lo - extra, hi + extra]
    }
    ;[minX, maxX] = grow(minX, maxX)
    ;[minZ, maxZ] = grow(minZ, maxZ)
    const scale = Math.min((width - 2 * padPx) / (maxX - minX), (height - 2 * padPx) / (maxZ - minZ))
    const offX = (width - (maxX - minX) * scale) / 2
    const offY = (height - (maxZ - minZ) * scale) / 2
    const toPx = (x, z) => [offX + (x - minX) * scale, offY + (z - minZ) * scale]
    const cellPx = Math.max(1, size * scale)
    return {
        scale,
        metresAcross: maxX - minX,
        cells: [...columns.values()].map((c) => {
            const [x, y] = toPx(c.x, c.z)
            return { x: x - cellPx / 2, y: y - cellPx / 2, size: cellPx, state: c.state }
        }),
        path: path.map((p) => toPx(p[0], p[2])),
        shots: shots.map((p) => toPx(p[0], p[2])),
        me: pose ? { at: toPx(pose.position[0], pose.position[2]), heading: headingOf(forwardOf(pose.orientation)) } : null,
        spot: spot ? { at: toPx(spot.spot[0], spot.spot[2]), size: Math.max(8, 0.6 * scale) } : null
    }
}

/** Draw the model on a 2D canvas context. Square marks only — the signature. */
export const drawFloorMap = (ctx, model, { width, height, colours, pulse = 0 }) => {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = colours.ground
    ctx.fillRect(0, 0, width, height)
    for (const cell of model.cells) {
        ctx.fillStyle = colours[cell.state]
        ctx.fillRect(cell.x, cell.y, cell.size, cell.size)
    }
    if (model.path.length > 1) {
        ctx.strokeStyle = colours.path
        ctx.lineWidth = 1.5
        ctx.beginPath()
        model.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.stroke()
    }
    ctx.fillStyle = colours.shot
    for (const [x, y] of model.shots) ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
    if (model.spot) {
        const s = model.spot.size * (1 + 0.15 * pulse)
        ctx.strokeStyle = colours.spot
        ctx.lineWidth = 2
        ctx.strokeRect(model.spot.at[0] - s / 2, model.spot.at[1] - s / 2, s, s)
    }
    if (model.me) {
        const [x, y] = model.me.at
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(model.me.heading)
        ctx.fillStyle = colours.me
        ctx.beginPath()
        ctx.moveTo(0, -8)
        ctx.lineTo(5, 5)
        ctx.lineTo(-5, 5)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
    }
}
