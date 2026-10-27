// COVERAGE — which surfaces of the place the kept shots have actually seen.
//
// The way Epic's RealityScan shows it on the phone (RealityScan mobile, "AR mode"
// coverage overlay): green where the reconstruction will have enough, yellow
// where it is thin, red where a surface was found but no kept shot covers it.
// Here it is COUNTED, not guessed:
//
//   * a surface is KNOWN when the AR session put a point on it — a depth sample
//     (WebXR depth-sensing) or, on a phone without depth, a hit-test result;
//   * a kept shot SEES a known cell when that cell had a sample in the very frame
//     that was kept, within MAX_VIEW_METRES of the camera;
//   * a cell is GOOD when at least GOOD_VIEWS kept shots saw it from directions at
//     least GOOD_SPREAD_DEG apart.
//
// The two numbers are the photogrammetry rule of thumb, cited in the decision
// record (docs/ai/decisions/2026-10-23-scan-ar-guidance.md): every point in three
// or more images (Agisoft Metashape User Manual, "Capturing scenarios";
// COLMAP needs two views to triangulate and three to check one), and a real
// baseline between them, because two shots from one spot triangulate nothing.
// They are settings with a source, not measurements of this phone; the first
// real walks are what will validate or move them.
//
// The grid is a sparse hash of CELL_METRES cubes, so a hall costs what was seen,
// not its volume.

import { dot, length, normalize, sub } from './arMath.js'

export const CELL_METRES = 0.25
export const GOOD_VIEWS = 3
export const GOOD_SPREAD_DEG = 15
export const MAX_VIEW_METRES = 6
// More views than this add nothing to the state and cost memory per cell.
const VIEWS_KEPT = 8

export const STATE_GOOD = 'good'
export const STATE_THIN = 'thin'
export const STATE_MISSED = 'missed'

export const cellIndex = (p, size = CELL_METRES) => [
    Math.floor(p[0] / size),
    Math.floor(p[1] / size),
    Math.floor(p[2] / size)
]
export const cellKey = (p, size = CELL_METRES) => cellIndex(p, size).join(',')

export const createCoverage = ({ cellMetres = CELL_METRES } = {}) => ({ cellMetres, cells: new Map(), keptShots: 0 })

const cellFor = (coverage, point) => {
    const key = cellKey(point, coverage.cellMetres)
    let cell = coverage.cells.get(key)
    if (!cell) {
        const [i, j, k] = cellIndex(point, coverage.cellMetres)
        const s = coverage.cellMetres
        cell = { key, centre: [(i + 0.5) * s, (j + 0.5) * s, (k + 0.5) * s], hits: 0, views: [] }
        coverage.cells.set(key, cell)
    }
    return cell
}

/** The widest angle, in degrees, between any two of a cell's view directions. */
export const viewSpread = (views) => {
    let widest = 0
    for (let a = 0; a < views.length; a += 1) {
        for (let b = a + 1; b < views.length; b += 1) {
            const c = Math.max(-1, Math.min(1, dot(views[a], views[b])))
            widest = Math.max(widest, Math.acos(c))
        }
    }
    return (widest * 180) / Math.PI
}

/**
 * Add one frame's surface points. `kept` says the frame was kept as a shot; only
 * then do the cells it touched gain a view, from `cameraPosition`.
 * Returns the number of cells that gained a view.
 */
export const addSamples = (coverage, points, { cameraPosition = null, kept = false } = {}) => {
    const touched = new Set()
    for (const point of points || []) {
        if (!point || !point.every(Number.isFinite)) continue
        const cell = cellFor(coverage, point)
        cell.hits += 1
        if (kept && cameraPosition) touched.add(cell)
    }
    let gained = 0
    for (const cell of touched) {
        const toCamera = sub(cameraPosition, cell.centre)
        if (length(toCamera) > MAX_VIEW_METRES) continue
        const direction = normalize(toCamera)
        // A second shot from (almost) the same place is not a second view.
        if (cell.views.some((v) => dot(v, direction) > Math.cos((2 * Math.PI) / 180))) continue
        if (cell.views.length < VIEWS_KEPT) cell.views.push(direction)
        else cell.views[VIEWS_KEPT - 1] = direction
        gained += 1
    }
    if (kept) coverage.keptShots += 1
    return gained
}

export const cellState = (cell) => {
    if (!cell.views.length) return STATE_MISSED
    if (cell.views.length >= GOOD_VIEWS && viewSpread(cell.views) >= GOOD_SPREAD_DEG) return STATE_GOOD
    return STATE_THIN
}

export const coverageSummary = (coverage) => {
    const counts = { good: 0, thin: 0, missed: 0 }
    for (const cell of coverage.cells.values()) counts[cellState(cell)] += 1
    const total = counts.good + counts.thin + counts.missed
    return { ...counts, total, goodShare: total ? counts.good / total : 0 }
}

/** Every cell with its state, for drawing. */
export const coverageCells = (coverage) =>
    [...coverage.cells.values()].map((cell) => ({ centre: cell.centre, state: cellState(cell), views: cell.views.length }))
