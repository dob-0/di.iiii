// NEXT SPOT — where to stand for the next shot, and where to point.
//
// Computed from the gaps in coverage.js, never from a fixed walking pattern:
//
//   1. every MISSED cell weighs 2 and every THIN cell 1; they are gathered into
//      floor columns of CLUSTER_METRES;
//   2. each column scores weight / (1 + distance from the person / 4 m), so a
//      gap close by wins over a slightly bigger one across the hall — walking is
//      the expensive part of a scan;
//   3. the TARGET is the weighted middle of the winning column's cells;
//   4. the SPOT is STANDOFF_METRES back from the target, on the side the room
//      opens to (towards the middle of everything seen so far), kept inside the
//      floor found so far — a ring outside the room would be nonsense;
//   5. the AIM is from eye height at the spot to the target.
//
// 2 m back is a setting: at 2 m a phone's main camera (about 70° across) frames
// a 2.8 m wide patch, which keeps a wall's texture at a few millimetres per pixel
// and still overlaps the shot beside it.

import { DEG, forwardOf, headingOf, sub, wrap } from './arMath.js'
import { STATE_MISSED, STATE_THIN, coverageCells } from './coverage.js'

export const CLUSTER_METRES = 1
export const STANDOFF_METRES = 2
export const EYE_HEIGHT_METRES = 1.5
const FLOOR_INSET_METRES = 0.3

const floorBounds = (cells, path) => {
    const xs = []
    const zs = []
    for (const c of cells) { xs.push(c.centre[0]); zs.push(c.centre[2]) }
    for (const p of path || []) { xs.push(p[0]); zs.push(p[2]) }
    if (!xs.length) return null
    return {
        minX: Math.min(...xs) + FLOOR_INSET_METRES,
        maxX: Math.max(...xs) - FLOOR_INSET_METRES,
        minZ: Math.min(...zs) + FLOOR_INSET_METRES,
        maxZ: Math.max(...zs) - FLOOR_INSET_METRES
    }
}

const clamp = (x, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, x)))

/**
 * The next spot, or null when nothing is missing (or nothing is known yet).
 * `position` is where the person is; `floorY` the floor height (local-floor: 0).
 */
export const nextSpot = (coverage, { position, floorY = 0, path = [] } = {}) => {
    const cells = coverageCells(coverage)
    const gaps = cells.filter((c) => c.state === STATE_MISSED || c.state === STATE_THIN)
    if (!gaps.length || !position) return null
    const columns = new Map()
    for (const cell of gaps) {
        const key = `${Math.floor(cell.centre[0] / CLUSTER_METRES)},${Math.floor(cell.centre[2] / CLUSTER_METRES)}`
        const weight = cell.state === STATE_MISSED ? 2 : 1
        const column = columns.get(key) || { weight: 0, sum: [0, 0, 0], cells: 0 }
        column.weight += weight
        column.sum = column.sum.map((s, i) => s + cell.centre[i] * weight)
        column.cells += 1
        columns.set(key, column)
    }
    let best = null
    for (const column of columns.values()) {
        const middle = column.sum.map((s) => s / column.weight)
        const distance = Math.hypot(middle[0] - position[0], middle[2] - position[2])
        const score = column.weight / (1 + distance / 4)
        if (!best || score > best.score) best = { score, middle, weight: column.weight, cells: column.cells }
    }
    const target = best.middle
    // The side the room opens to: towards the middle of all that is known.
    const centre = cells.reduce((acc, c) => [acc[0] + c.centre[0], acc[1] + c.centre[2]], [0, 0]).map((s) => s / cells.length)
    let away = [centre[0] - target[0], centre[1] - target[2]]
    if (Math.hypot(away[0], away[1]) < 0.2) away = [position[0] - target[0], position[2] - target[2]]
    const n = Math.hypot(away[0], away[1]) || 1
    away = [away[0] / n, away[1] / n]
    const bounds = floorBounds(cells, path)
    const spot = [
        clamp(target[0] + away[0] * STANDOFF_METRES, bounds.minX, bounds.maxX),
        floorY,
        clamp(target[2] + away[1] * STANDOFF_METRES, bounds.minZ, bounds.maxZ)
    ]
    const eye = [spot[0], floorY + EYE_HEIGHT_METRES, spot[2]]
    const toTarget = sub(target, eye)
    const horizontal = Math.hypot(toTarget[0], toTarget[2])
    return {
        target,
        spot,
        heading: headingOf(toTarget),
        pitch: Math.atan2(toTarget[1], horizontal),
        gapCells: best.cells,
        distance: Math.hypot(spot[0] - position[0], spot[2] - position[2])
    }
}

/**
 * Where the arrow points from where the phone looks now: `turn` in degrees
 * (positive = turn right), `tilt` in degrees (positive = up).
 */
export const arrowFor = (pose, target) => {
    const forward = forwardOf(pose.orientation)
    const to = sub(target, pose.position)
    const turn = wrap(headingOf(to) - headingOf(forward)) / DEG
    const tiltNow = Math.atan2(forward[1], Math.hypot(forward[0], forward[2]))
    const tiltTo = Math.atan2(to[1], Math.hypot(to[0], to[2]))
    return { turn, tilt: (tiltTo - tiltNow) / DEG }
}

/** The one line that goes with the arrow. */
export const spotWords = (spot, arrow) => {
    if (!spot) return 'Everything found so far is covered — walk on to find more of the place.'
    if (spot.distance > 0.6) return `Walk to the square on the floor — ${spot.distance.toFixed(1)} m`
    if (Math.abs(arrow.turn) > 20) return arrow.turn > 0 ? 'Turn right, to the red' : 'Turn left, to the red'
    if (Math.abs(arrow.tilt) > 15) return arrow.tilt > 0 ? 'Point up a little' : 'Point down a little'
    return 'Hold still here — the shot is taken for you'
}
