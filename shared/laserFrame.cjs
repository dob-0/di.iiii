// THE LASER FRAME — what di's laser nodes send and the server and the room read (MOXIR, 2026-10-05).
//
// A frame is one drawing for one LaserCube, or for all of them: a list of points the scanner traces in
// order, again and again. A point is [x, y, r, g, b]:
//   x, y  -1 … 1, as the cube sees it: x to its right, y up, 0 the centre of its field
//   r, g, b  0 … 1, the beam's colour at that point; 0, 0, 0 is a blank move (the beam off)
// One shared definition, so the Nodes editor, serverXR and the room agree on it.
//
// FRAME v2 (2026-10-14, design the raw laser workflow decision of 2026-10-14 (docs/ai/decisions, with PR 933) §2.1): between laser
// nodes the value is a set of PATHS, not points — clean strokes with no blank points inside them:
//   { kind: 'laser', v: 2, paths: [{ p: [x,y,r,g,b, x,y,r,g,b, …], closed }], order: 'free' | 'kept' }
// Blank moves are made only when Laser Out FLATTENS the paths into the wire frame above: nearest-neighbour
// order (Rosenkrantz, Stearns & Lewis 1977; vpype `linesort`), then arc-length resampling to the point
// budget. The server wire does not change: it still receives { cube, points }.
// The galvo's own shaping (step limit, corners, dwell, blanking, rate) stays on the server (#931).
'use strict'

const FRAME_MAX_POINTS = 2000
const ALL_CUBES = 'all'
const FRAME_VERSION = 2
// Points per Laser Out per frame unless the graph says otherwise (owner, 2026-10-14).
const DEFAULT_BUDGET = 1000
const MIN_BUDGET = 16
// Auto budget: one point per this many field units of drawn line (the field is 2 wide). UNVALIDATED:
// a starting value, to be judged on the wall against flicker and corner sharpness.
const AUTO_STEP = 0.01
// What one value between laser nodes may hold before it is cut: bounds the work, never reached by hand.
const MAX_PATHS = 4000
const MAX_PATH_POINTS = 50000

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN)
const round4 = (v) => Math.round(v * 10000) / 10000

/**
 * A frame as the wire carries it, cleaned: at most FRAME_MAX_POINTS points, every number finite and
 * in range (a bad point is dropped, never guessed). Pure.
 * @returns {{ points: number[][], dropped: number }}
 */
const normaliseFramePoints = (points) => {
    const out = []
    let dropped = 0
    for (const p of Array.isArray(points) ? points : []) {
        if (out.length >= FRAME_MAX_POINTS) { dropped += 1; continue }
        const v = Array.isArray(p) ? p.slice(0, 5).map(num) : [num(p?.x), num(p?.y), num(p?.r), num(p?.g), num(p?.b)]
        if (v.length < 5 || v.some(Number.isNaN)) { dropped += 1; continue }
        out.push([clamp(v[0], -1, 1), clamp(v[1], -1, 1), clamp(v[2], 0, 1), clamp(v[3], 0, 1), clamp(v[4], 0, 1)])
    }
    return { points: out, dropped }
}

/** Legacy points -> v2 paths: split at blank points; each run of lit points is one open path. Pure. */
const pathsFromPoints = (points) => {
    const clean = normaliseFramePoints(points).points
    const paths = []
    let current = null
    for (const q of clean) {
        if (!(q[2] + q[3] + q[4] > 0)) { current = null; continue }
        if (!current) { current = { p: [], closed: false }; paths.push(current) }
        current.p.push(q[0], q[1], q[2], q[3], q[4])
    }
    return paths
}

// A path cleaned; a bad point (NaN, ±Infinity) SPLITS it (review of #934, finding 4): its neighbours
// are not joined by a lit line across the gap. A split path is never closed. @returns the pieces.
const cleanPath = (path, room) => {
    const src = Array.isArray(path?.p) ? path.p : []
    const n = Math.min(Math.floor(src.length / 5), room)
    const pieces = [[]]
    for (let i = 0; i < n; i += 1) {
        const o = i * 5
        const x = num(src[o]); const y = num(src[o + 1]); const r = num(src[o + 2]); const g = num(src[o + 3]); const b = num(src[o + 4])
        if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
            if (pieces[pieces.length - 1].length) pieces.push([])
            continue
        }
        pieces[pieces.length - 1].push(clamp(x, -1, 1), clamp(y, -1, 1), clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1))
    }
    const kept = pieces.filter((p) => p.length)
    const whole = kept.length === 1
    return kept.map((p) => ({ p, closed: whole && Boolean(path?.closed) && p.length >= 15 }))
}

/** Is this a laser value (v2 paths, a legacy frame, or a bare points array)? */
const isLaserValue = (value) => Array.isArray(value)
    || (Boolean(value) && typeof value === 'object' && value.kind === 'laser' && (Array.isArray(value.paths) || Array.isArray(value.points)))

/**
 * Any laser value -> a clean v2 frame. Legacy frames ({kind:'laser', points} or a bare array) are split
 * at their blank points into paths drawn as given (order 'kept'). Numbers are made finite and in range;
 * empty paths drop; at most MAX_PATHS paths and MAX_PATH_POINTS points. Pure.
 */
// Frames this module made: flattenLaserPaths does not normalise them twice (review of #934, finding 1).
const NORMALISED = new WeakSet()

const normaliseLaserPaths = (value) => {
    if (value && typeof value === 'object' && NORMALISED.has(value)) return value
    const frame = { kind: 'laser', v: FRAME_VERSION, paths: [], order: 'kept' }
    if (Array.isArray(value)) { frame.paths = pathsFromPoints(value); return frame }
    if (!value || typeof value !== 'object' || value.kind !== 'laser') return frame
    if (typeof value.source === 'string') frame.source = value.source
    if (typeof value.ms === 'number' && Number.isFinite(value.ms)) frame.ms = value.ms
    if (!Array.isArray(value.paths)) { frame.paths = pathsFromPoints(value.points); return frame }
    frame.order = value.order === 'kept' ? 'kept' : 'free'
    let room = MAX_PATH_POINTS
    for (const path of value.paths) {
        if (frame.paths.length >= MAX_PATHS || room <= 0) break
        for (const clean of cleanPath(path, room)) {
            if (frame.paths.length >= MAX_PATHS) break
            room -= clean.p.length / 5
            frame.paths.push(clean)
        }
    }
    NORMALISED.add(frame)
    return frame
}

const sq = (x, y) => x * x + y * y

// A path as an open polyline that starts at vertex `at`: a closed one is rotated and closed again by
// repeating its first vertex; an open one may be reversed.
const openPath = (path, at, reverse) => {
    const p = path.p
    const n = p.length / 5
    if (path.closed && n > 1) {
        const out = new Array((n + 1) * 5)
        for (let k = 0; k <= n; k += 1) {
            const s = ((at + k) % n) * 5
            for (let c = 0; c < 5; c += 1) out[k * 5 + c] = p[s + c]
        }
        return out
    }
    if (!reverse) return p.slice()
    const out = new Array(p.length)
    for (let k = 0; k < n; k += 1) for (let c = 0; c < 5; c += 1) out[k * 5 + c] = p[(n - 1 - k) * 5 + c]
    return out
}

/**
 * Greedy nearest-neighbour order with reversal: from `start` ([x, y]), always draw next the path whose
 * entry is nearest; an open path may be entered at either end, a closed one at its nearest vertex.
 * Never loses a path. Returns open polylines (flat stride-5 arrays). Pure.
 */
const orderLaserPaths = (paths, start) => {
    const left = paths.slice()
    const out = []
    let cx = Array.isArray(start) && Number.isFinite(start[0]) ? start[0] : 0
    let cy = Array.isArray(start) && Number.isFinite(start[1]) ? start[1] : 0
    while (left.length) {
        let best = 0
        let bestD = Infinity
        let bestAt = 0
        let bestRev = false
        for (let i = 0; i < left.length; i += 1) {
            const { p, closed } = left[i]
            const n = p.length / 5
            if (closed) {
                for (let k = 0; k < n; k += 1) {
                    const d = sq(p[k * 5] - cx, p[k * 5 + 1] - cy)
                    if (d < bestD) { bestD = d; best = i; bestAt = k; bestRev = false }
                }
            } else {
                const d0 = sq(p[0] - cx, p[1] - cy)
                const d1 = sq(p[(n - 1) * 5] - cx, p[(n - 1) * 5 + 1] - cy)
                if (d0 < bestD) { bestD = d0; best = i; bestAt = 0; bestRev = false }
                if (d1 < bestD) { bestD = d1; best = i; bestAt = 0; bestRev = true }
            }
            if (bestD === 0) break
        }
        const chosen = left.splice(best, 1)[0]
        const open = openPath(chosen, bestAt, bestRev)
        out.push(open)
        cx = open[open.length - 5]
        cy = open[open.length - 4]
    }
    return out
}

const polyLength = (p) => {
    let length = 0
    for (let i = 5; i < p.length; i += 5) length += Math.hypot(p[i] - p[i - 5], p[i + 1] - p[i - 4])
    return length
}

/** `count` points evenly spaced by arc length along a flat polyline, colour interpolated. Pure. */
const resamplePolyline = (p, count) => {
    const n = p.length / 5
    const out = []
    if (count <= 0 || n === 0) return out
    const total = polyLength(p)
    if (n === 1 || total === 0 || count === 1) {
        for (let k = 0; k < count; k += 1) out.push(p.slice(0, 5))
        return out
    }
    let seg = 1
    let segStart = 0
    let segLen = Math.hypot(p[5] - p[0], p[6] - p[1])
    for (let k = 0; k < count; k += 1) {
        const at = (total * k) / (count - 1)
        while (seg < n - 1 && segStart + segLen < at) {
            segStart += segLen
            seg += 1
            segLen = Math.hypot(p[seg * 5] - p[(seg - 1) * 5], p[seg * 5 + 1] - p[(seg - 1) * 5 + 1])
        }
        const t = segLen > 0 ? clamp((at - segStart) / segLen, 0, 1) : 0
        const a = (seg - 1) * 5
        const b = seg * 5
        out.push([0, 1, 2, 3, 4].map((c) => p[a + c] + (p[b + c] - p[a + c]) * t))
    }
    return out
}

// Largest-remainder split of `total` points over weights, each at least its minimum.
const allocate = (mins, weights, total) => {
    const counts = mins.slice()
    let left = total - mins.reduce((s, m) => s + m, 0)
    const wSum = weights.reduce((s, w) => s + w, 0)
    if (left <= 0 || wSum <= 0) return counts
    const shares = weights.map((w) => (left * w) / wSum)
    const floors = shares.map(Math.floor)
    floors.forEach((f, i) => { counts[i] += f })
    left -= floors.reduce((s, f) => s + f, 0)
    const order = shares.map((s, i) => [s - floors[i], i]).sort((a, b) => b[0] - a[0])
    for (let k = 0; k < left; k += 1) counts[order[k % order.length][1]] += 1
    return counts
}

/** The auto budget: blank points plus one point per AUTO_STEP of drawn line. Pure. */
const autoBudget = (length, paths) => Math.max(MIN_BUDGET, paths + Math.ceil(length / AUTO_STEP))

/**
 * Paths -> the wire's points. Order (nearest neighbour from `start` when the frame's order is 'free'),
 * then resample to exactly `budget` points (a number, or 'auto' / 0 / negative for the auto budget),
 * clamped to [MIN_BUDGET, min(FRAME_MAX_POINTS, cap)]. One blank point at the entry of every path;
 * the frame loops, so the jump back to the first path is blank too. `budget: null` keeps the paths'
 * own points (no resample) unless that is over the cap. If the budget cannot give every path its
 * minimum (2 points, a dot 1), the shortest paths are dropped and counted. Pure.
 * @returns {{ points: number[][], end: number[]|null, stats: object }}
 */
const flattenLaserPaths = (value, { budget = DEFAULT_BUDGET, start = null, cap = Infinity } = {}) => {
    const frame = normaliseLaserPaths(value)
    let list = frame.paths.slice()
    const lengthOf = (path) => polyLength(path.p) + (path.closed ? Math.hypot(path.p[0] - path.p[path.p.length - 5], path.p[1] - path.p[path.p.length - 4]) : 0)
    let lengths = list.map(lengthOf)
    const length = lengths.reduce((s, l) => s + l, 0)
    const inPoints = list.reduce((s, path) => s + path.p.length / 5 + (path.closed ? 1 : 0), 0)
    const ceiling = Math.max(MIN_BUDGET, Math.min(FRAME_MAX_POINTS, Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : FRAME_MAX_POINTS))
    const auto = budget === 'auto' || (typeof budget === 'number' && budget <= 0)
    let target = null
    if (auto) target = autoBudget(length, list.length)
    else if (typeof budget === 'number' && Number.isFinite(budget)) target = Math.round(budget)
    else if (inPoints + list.length > ceiling) target = ceiling
    if (target !== null) target = clamp(target, MIN_BUDGET, ceiling)
    // Each path costs one blank point plus its minimum lit points (2, a dot 1). When the budget cannot
    // pay for all, the longest lines are kept and dots are thinned evenly; the rest are counted, not hidden.
    const minOf = (l) => (l > 0 ? 2 : 1)
    let dropped = 0
    if (target !== null && list.length + lengths.reduce((s, l) => s + minOf(l), 0) > target) {
        const lines = lengths.map((l, i) => i).filter((i) => lengths[i] > 0).sort((a, b) => lengths[b] - lengths[a] || a - b)
        const dots = lengths.map((l, i) => i).filter((i) => !(lengths[i] > 0))
        const keep = []
        let room = target
        for (const i of lines) { if (room < 3) break; keep.push(i); room -= 3 }
        const m = Math.min(dots.length, Math.floor(room / 2))
        for (let j = 0; j < m; j += 1) keep.push(dots[Math.floor((j * dots.length) / m)])
        keep.sort((a, b) => a - b)
        dropped = list.length - keep.length
        list = keep.map((i) => list[i])
    }
    const ordered = frame.order === 'kept' ? list.map((path) => openPath(path, 0, false)) : orderLaserPaths(list, start)
    lengths = ordered.map(polyLength)
    const stats = { paths: ordered.length, inPoints, length: round4(length), budget: target, auto, dropped }
    if (!ordered.length) return { points: [], end: null, stats: { ...stats, outPoints: 0 } }
    const anyLength = lengths.some((l) => l > 0)
    const counts = target === null
        ? ordered.map((p) => p.length / 5)
        : allocate(lengths.map(minOf), lengths.map((l) => (anyLength ? l : 1)), target - ordered.length)
    const points = []
    ordered.forEach((p, i) => {
        points.push([round4(p[0]), round4(p[1]), 0, 0, 0])
        if (target !== null) for (const q of resamplePolyline(p, counts[i])) points.push(q.map(round4))
        else for (let k = 0; k < p.length; k += 5) points.push([p[k], p[k + 1], p[k + 2], p[k + 3], p[k + 4]].map(round4))
    })
    const last = points[points.length - 1]
    return { points, end: [last[0], last[1]], stats: { ...stats, outPoints: points.length } }
}

/** Concatenate laser values (TD Merge semantics): 'kept' only if every input is kept. Pure. */
const mergeLaserPaths = (values) => {
    const kept = (values || []).filter(isLaserValue).map(normaliseLaserPaths)
    if (!kept.length) return undefined
    const out = { kind: 'laser', v: FRAME_VERSION, paths: [], order: kept.every((f) => f.order === 'kept') ? 'kept' : 'free' }
    let ms = 0
    let timed = false
    for (const f of kept) {
        for (const path of f.paths) if (out.paths.length < MAX_PATHS) out.paths.push(path)
        if (typeof f.ms === 'number') { ms += f.ms; timed = true }
    }
    if (timed) out.ms = ms
    return out
}

module.exports = {
    FRAME_MAX_POINTS, ALL_CUBES, FRAME_VERSION, DEFAULT_BUDGET, MIN_BUDGET, AUTO_STEP, MAX_PATHS, MAX_PATH_POINTS,
    normaliseFramePoints, pathsFromPoints, isLaserValue, normaliseLaserPaths, orderLaserPaths, resamplePolyline,
    autoBudget, flattenLaserPaths, mergeLaserPaths,
}
