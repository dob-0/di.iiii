// THE PLOT'S GEOMETRY — pure: scales, sheets, footprints, hit-testing, truss runs,
// label layout, dimensions. docs/architecture/RIG_BUILD.md §10 (view B).
//
// The plan is drawn in the room's own metres, seen from above: SVG x = room x, SVG
// y = room z (so -z is up the sheet: a true plan, not a mirror). Everything here
// takes and returns metres on that plane unless it says millimetres (paper).
//
// Standards used, not invented:
//   paper      ISO 216 A-series (A3 420 x 297 mm, A4 297 x 210 mm), landscape
//   scales     ISO 5455:1979 recommended reduction scales (1:10, 1:20, 1:50, 1:100,
//              1:200, 1:500, 1:1000), plus 1:25 — the ABTT's stage-plan scale
//              (UK theatre practice) — because a crew reads it
//   plot       USITT RP-2 (2006): a symbol per instrument type drawn at the hanging
//              point, the unit number with it, the channel (here: the console's
//              fixture #) and the address beside it, and an instrument key

import { PIECES, TRUSS_SECTION_M, TOWER_PLATE_M, pieceKindOf, pieceHeightOf, pieceWithHeight } from './pieces.js'
import { rotateY, snapToGrid } from './snap.js'
import { lensFromMount } from './lampGeometry.js'

export const SCALES = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]
export const SHEETS = {
    A3: { id: 'A3', w: 420, h: 297 },
    A4: { id: 'A4', w: 297, h: 210 }
}

const r3 = (v) => Math.round(v * 1000) / 1000

/** The largest drawing (the smallest N of 1:N) that fits `extent` metres into `area` mm. */
export const chooseScale = ([wM, hM], [wMM, hMM], scales = SCALES) => {
    for (const n of scales) if ((wM * 1000) / n <= wMM + 1e-9 && (hM * 1000) / n <= hMM + 1e-9) return n
    return scales[scales.length - 1]
}

/**
 * Where things go on a landscape sheet, in mm: a 10 mm border (ISO 5457 asks at
 * least 10 mm on A3/A4 with a 20 mm filing edge, which a rolled plot does not
 * need), the drawing on the left, a column on the right for the key and the
 * title block — the layout of sketch B.
 */
export const sheetLayout = (sheet = SHEETS.A3) => {
    const border = 10
    const column = sheet.id === 'A4' ? 78 : 96
    const frame = { x: border, y: border, w: sheet.w - 2 * border, h: sheet.h - 2 * border }
    const drawing = { x: frame.x + 4, y: frame.y + 4, w: frame.w - column - 8, h: frame.h - 8 }
    const side = { x: frame.x + frame.w - column, y: frame.y, w: column, h: frame.h }
    return { sheet, frame, drawing, side }
}

/** A scale bar for 1:N no longer than `maxMM`: a round length in metres and its ticks. */
export const scaleBar = (n, maxMM = 60) => {
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]
    let metres = steps[0]
    for (const s of steps) if ((s * 1000) / n <= maxMM) metres = s
    const mm = (metres * 1000) / n
    const divisions = metres % 5 === 0 ? 5 : metres % 2 === 0 ? 2 : metres
    const ticks = Array.from({ length: divisions + 1 }, (_, i) => ({ at: r3((mm * i) / divisions), label: `${r3((metres * i) / divisions)}` }))
    return { metres, mm: r3(mm), ticks }
}

// ---- footprints ------------------------------------------------------------------

const corners = (cx, cz, w, d, yaw) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
    .map(([x, z]) => {
        const p = rotateY([x, 0, z], yaw)
        return [r3(cx + p[0]), r3(cz + p[2])]
    })

/** A piece's outline on the plan: [[x, z] x4], with its size and height. */
export const pieceFootprint = ({ kind, position = [0, 0, 0], yaw = 0, height = null, roll = 0 }) => {
    const piece = pieceWithHeight(kind, height)
    if (!piece) return null
    const [x, , z] = position
    // a rolled (sloped) truss covers its length × cos(slope) on the plan
    const plan = piece.length * Math.cos(roll || 0)
    if (piece.category === 'truss') return { outline: corners(x, z, plan, TRUSS_SECTION_M, yaw), w: r3(plan), d: TRUSS_SECTION_M }
    if (piece.category === 'tower') return { outline: corners(x, z, TOWER_PLATE_M, TOWER_PLATE_M, yaw), w: TOWER_PLATE_M, d: TOWER_PLATE_M }
    return { outline: corners(x, z, piece.size[0], piece.size[2], yaw), w: piece.size[0], d: piece.size[2] }
}

/** Every piece of a document, as the plot draws it. */
export const piecesOf = (entities = []) => entities.map((e) => {
    const kind = pieceKindOf(e)
    if (!kind) return null
    const position = e.components?.transform?.position || [0, 0, 0]
    const yaw = e.components?.transform?.rotation?.[1] || 0
    // a truss piece rolled about its own length onto a slope (the cut, 2026-09-29): rotation z
    const roll = e.components?.transform?.rotation?.[2] || 0
    const height = pieceHeightOf(e)
    return { id: e.id, name: e.name || '', kind, category: PIECES[kind].category, position, yaw, ...(roll ? { roll } : {}), height, ...pieceFootprint({ kind, position, yaw, height, roll }) }
}).filter(Boolean)

// Anything else standing in the room that is a plain box (a riser, a DJ table, a
// barrier made of boxes): its footprint, so the plot shows it. The rig script's
// boxes are anchored on the floor at their centre, sized by scale x primitive.size.
export const boxesOf = (entities = [], { maxSide = 40 } = {}) => entities.filter((e) => e.type === 'box' && !pieceKindOf(e) && !e.components?.fixture).map((e) => {
    const t = e.components?.transform || {}
    const size = e.components?.primitive?.size || [1, 1, 1]
    const s = t.scale || [1, 1, 1]
    const w = Math.abs(size[0] * s[0])
    const d = Math.abs(size[2] * s[2])
    if (!(w > 0 && d > 0) || w > maxSide || d > maxSide) return null
    const [x, y, z] = t.position || [0, 0, 0]
    return { id: e.id, name: e.name || '', outline: corners(x, z, w, d, t.rotation?.[1] || 0), top: r3(y + Math.abs(size[1] * s[1])) }
}).filter(Boolean)

// ---- hit-testing -----------------------------------------------------------------

const inPolygon = ([x, z], poly) => {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i]
        const [xj, zj] = poly[j]
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
    }
    return inside
}

const segDist = ([px, pz], [ax, az], [bx, bz]) => {
    const dx = bx - ax
    const dz = bz - az
    const l2 = dx * dx + dz * dz
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

const polyDist = (p, poly) => (inPolygon(p, poly) ? 0 : Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length]))))

/**
 * What is under a point: lamps first (they sit on top of the truss they hang
 * from), then pieces, the nearest within `tolerance` metres; null if nothing.
 * @param {{lamps: {id, at: number[], r: number}[], pieces: {id, outline}[]}} items
 */
export const hitTest = ({ lamps = [], pieces = [] }, point, tolerance = 0.2) => {
    let best = null
    for (const l of lamps) {
        const d = Math.max(0, Math.hypot(point[0] - l.at[0], point[1] - l.at[1]) - l.r)
        if (d <= tolerance && (!best || d < best.d)) best = { id: l.id, d }
    }
    if (best) return best.id
    for (const p of pieces) {
        const d = polyDist(point, p.outline)
        if (d <= tolerance && (!best || d < best.d)) best = { id: p.id, d }
    }
    return best ? best.id : null
}

/** Everything whose anchor is inside a marquee [x0, z0, x1, z1] (any corner order). */
export const inMarquee = ({ lamps = [], pieces = [] }, [ax, az, bx, bz]) => {
    const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)]
    const [z0, z1] = [Math.min(az, bz), Math.max(az, bz)]
    const inside = ([x, z]) => x >= x0 && x <= x1 && z >= z0 && z <= z1
    return [
        ...lamps.filter((l) => inside(l.at)).map((l) => l.id),
        ...pieces.filter((p) => p.outline.every(inside)).map((p) => p.id)
    ]
}

// ---- truss runs ------------------------------------------------------------------

// A piece's axis in the room: local +X turned by its roll (about Z) then its yaw (Euler XYZ, x = 0).
export const pieceAxisOf = (p) => {
    const r = p.roll || 0
    const d = rotateY([Math.cos(r), 0, 0], p.yaw)
    return [d[0], Math.sin(r), d[2]]
}
const endsOf = (p) => {
    const half = PIECES[p.kind].length / 2
    const d = pieceAxisOf(p)
    return [-1, 1].map((k) => [p.position[0] + k * half * d[0], p.position[1] + k * half * d[1], p.position[2] + k * half * d[2]])
}

/**
 * Trusses joined end to end (ends within 1 cm, same height) are one RUN — what a
 * crew calls "the header", "the downstage truss". Each run: its pieces in order,
 * its two ends, its length and its height (the chord centre).
 */
export const trussRuns = (pieces = []) => {
    const trusses = pieces.filter((p) => p.category === 'truss')
    const ends = new Map(trusses.map((t) => [t.id, endsOf(t)]))
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.01
    const seen = new Set()
    const runs = []
    for (const t of trusses) {
        if (seen.has(t.id)) continue
        const group = []
        const stack = [t]
        seen.add(t.id)
        while (stack.length) {
            const cur = stack.pop()
            group.push(cur)
            for (const other of trusses) {
                if (seen.has(other.id)) continue
                if (ends.get(cur.id).some((a) => ends.get(other.id).some((b) => near(a, b)))) {
                    seen.add(other.id)
                    stack.push(other)
                }
            }
        }
        // Order along the run: project every end on the first piece's axis.
        const dir = rotateY([1, 0, 0], group[0].yaw)
        const along = (p) => p[0] * dir[0] + p[2] * dir[2]
        const all = group.flatMap((g) => ends.get(g.id))
        all.sort((a, b) => along(a) - along(b))
        group.sort((a, b) => along(a.position) - along(b.position))
        const from = all[0]
        const to = all[all.length - 1]
        runs.push({
            ids: group.map((g) => g.id),
            name: group.find((g) => g.name)?.name || '',
            from: [r3(from[0]), r3(from[2])],
            to: [r3(to[0]), r3(to[2])],
            length: r3(Math.hypot(to[0] - from[0], to[2] - from[2])),
            height: r3(group[0].position[1]),
            yaw: group[0].yaw,
            // a sloped run (its pieces rolled): its ends in 3D at the chord centre, its true
            // length along the slope and the slope itself — the plan above keeps the footprint
            ...(Math.abs(to[1] - from[1]) > 0.005 ? {
                from3: from.map(r3), to3: to.map(r3),
                length3: r3(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])),
                slopeDeg: r3((Math.atan2(to[1] - from[1], Math.hypot(to[0] - from[0], to[2] - from[2])) * 180) / Math.PI)
            } : {})
        })
    }
    return runs
}

/**
 * The ends of each run that no tower stands under (a tower's top within 10 cm on the
 * plan and at the chord's height less half a section). Not a fault by itself — a run
 * may be flown from the roof — but the plot says so: a free end needs a motor, a
 * rigging point or a tower, and nobody should find out at the get-in.
 */
export const freeEnds = (runs = [], pieces = []) => {
    const tops = pieces.filter((p) => p.category === 'tower').map((p) => [p.position[0], p.position[1] + (p.height || 0), p.position[2]])
    const out = []
    for (const run of runs) {
        for (const end of [run.from, run.to]) {
            const held = tops.some((t) => Math.hypot(t[0] - end[0], t[2] - end[1]) <= 0.1 && Math.abs(t[1] + TRUSS_SECTION_M / 2 - run.height) <= 0.05)
            if (!held) out.push({ run: run.ids[0], at: end })
        }
    }
    return out
}

/** A run of `length` metres in stock segments, longest first (3 m, 2 m, 1 m); whole metres. */
export const trussSegments = (length) => {
    let left = Math.max(1, Math.round(Number(length) || 0))
    const out = []
    for (const s of [3, 2, 1]) while (left >= s) { out.push(s); left -= s }
    return out
}

/**
 * Lay a run from `from` toward `to` ([x, z]) at chord height `y`: the heading is
 * snapped to `angleStepDeg`, the length rounded to whole metres, and the segments
 * (trussSegments) placed end to end from `from`. Returns piece poses for createEntity.
 */
export const layRun = ({ from, to, y, angleStepDeg = 15, length = null }) => {
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const step = (angleStepDeg * Math.PI) / 180
    // three.js yaw: a heading of `yaw` points local +X at (cos yaw, -sin yaw) in x/z.
    const raw = Math.atan2(-dz, dx)
    const yaw = step > 0 ? Math.round(raw / step) * step : raw
    const segments = trussSegments(length ?? Math.hypot(dx, dz))
    const dir = [Math.cos(yaw), -Math.sin(yaw)]
    let s = 0
    return segments.map((m) => {
        const c = s + m / 2
        s += m
        return { kind: `truss-${m}m`, position: [r3(from[0] + dir[0] * c), r3(y), r3(from[1] + dir[1] * c)], yaw: r3(yaw) === 0 ? 0 : Math.round(yaw * 1e9) / 1e9 }
    })
}

/** The lamps hanging on (or standing on) a piece: their mount within 5 cm of one of its slots or its top. */
export const ridersOf = (piece, lamps = [], tolerance = 0.05) => {
    const record = pieceWithHeight(piece.kind, piece.height)
    if (!record) return []
    const points = record.points.filter((p) => p.kind === 'slot' || p.kind === 'surface' || p.kind === 'top')
    const world = points.map((p) => {
        const r = rotateY(p.pos, piece.yaw)
        return { kind: p.kind, pos: [piece.position[0] + r[0], piece.position[1] + r[1], piece.position[2] + r[2]], extent: p.extent }
    })
    return lamps.filter((l) => world.some((w) => {
        if (w.kind === 'surface') {
            const local = rotateY([l.mount[0] - w.pos[0], 0, l.mount[2] - w.pos[2]], -piece.yaw)
            return Math.abs(l.mount[1] - w.pos[1]) <= tolerance && Math.abs(local[0]) <= w.extent[0] / 2 + tolerance && Math.abs(local[2]) <= w.extent[1] / 2 + tolerance
        }
        return Math.hypot(l.mount[0] - w.pos[0], l.mount[1] - w.pos[1], l.mount[2] - w.pos[2]) <= tolerance
    })).map((l) => l.id)
}

// ---- lamps -----------------------------------------------------------------------

/**
 * A new lamp's transform: its lens from its mount (the type's body heights), aimed
 * straight down when hung and straight up when standing — a neutral focus; looks
 * aim it later. A spot's local forward is -Y (spotLightAim.js), so up is a half
 * turn about X.
 */
export const lampTransform = ({ mount, hung, type }) => {
    const beam = hung ? [0, -1, 0] : [0, 1, 0]
    const lens = lensFromMount({ mount, hung, beam, type })
    return { position: lens.map(r3), rotation: [hung ? 0 : Math.PI, 0, 0], scale: [1, 1, 1] }
}

/** The next unit number on a position: one more than the highest used there. */
export const nextUnit = (entities = [], position = '') => {
    let max = 0
    for (const e of entities) {
        const f = e?.components?.fixture
        if (f && (f.position || '') === position && Number.isInteger(f.unit)) max = Math.max(max, f.unit)
    }
    return max + 1
}

// ---- labels ----------------------------------------------------------------------

/**
 * Where each symbol's label goes: the first of below / above / right / left that
 * overlaps no symbol and no label already placed; if every place overlaps, the
 * one that overlaps least. Greedy in the given order (put the important ones
 * first). Boxes are [x0, y0, x1, y1] in drawing units.
 * @param {{id, at: number[], r: number, w: number, h: number}[]} items  symbol centre,
 *        radius, and the label's width and height
 * @returns {Map<string, {x: number, y: number, anchor: 'start'|'middle'|'end', box: number[]}>}
 */
export const layoutLabels = (items = [], gap = 0) => {
    const placed = []
    const symbols = items.map((i) => [i.at[0] - i.r, i.at[1] - i.r, i.at[0] + i.r, i.at[1] + i.r])
    const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
    const out = new Map()
    items.forEach((item, index) => {
        const [x, y] = item.at
        const g = item.r + gap
        const candidates = [
            { x, y: y + g, anchor: 'middle', box: [x - item.w / 2, y + g, x + item.w / 2, y + g + item.h] },
            { x, y: y - g - item.h, anchor: 'middle', box: [x - item.w / 2, y - g - item.h, x + item.w / 2, y - g] },
            { x: x + g, y: y - item.h / 2, anchor: 'start', box: [x + g, y - item.h / 2, x + g + item.w, y + item.h / 2] },
            { x: x - g, y: y - item.h / 2, anchor: 'end', box: [x - g - item.w, y - item.h / 2, x - g, y + item.h / 2] }
        ]
        let best = null
        for (const c of candidates) {
            let cost = 0
            for (const p of placed) cost += overlap(c.box, p)
            symbols.forEach((s, j) => { if (j !== index) cost += overlap(c.box, s) })
            if (!best || cost < best.cost - 1e-12) best = { ...c, cost }
            if (cost === 0) break
        }
        placed.push(best.box)
        out.set(item.id, { x: best.x, y: best.y, anchor: best.anchor, box: best.box, clear: best.cost === 0 })
    })
    return out
}

// ---- dimensions ------------------------------------------------------------------

/**
 * A dimension line between two plan points, offset sideways by `offset` (drawing
 * practice: extension lines from the object, a dimension line parallel to it, the
 * figure centred above the line and read from the bottom or the right).
 */
export const dimension = (a, b, offset = 0) => {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const length = Math.hypot(dx, dz)
    const n = length ? [-dz / length, dx / length] : [0, 1]
    const A = [a[0] + n[0] * offset, a[1] + n[1] * offset]
    const B = [b[0] + n[0] * offset, b[1] + n[1] * offset]
    let angle = (Math.atan2(dz, dx) * 180) / Math.PI
    if (angle > 90) angle -= 180
    if (angle <= -90) angle += 180
    return { a: A, b: B, from: [a, b], mid: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], length: r3(length), angle: r3(angle), normal: n }
}

export const formatMetres = (m) => `${(Math.round(m * 100) / 100).toFixed(2)} m`

// ---- the view on screen ------------------------------------------------------------

/** A viewBox [x, y, w, h] in metres that shows `extent` [x0, z0, x1, z1] in a `w x h` px box, with a margin. */
export const fitView = (extent, [w, h], margin = 0.06) => {
    const [x0, z0, x1, z1] = extent
    const ew = Math.max(1, x1 - x0)
    const eh = Math.max(1, z1 - z0)
    const k = Math.max(ew / (w * (1 - 2 * margin)), eh / (h * (1 - 2 * margin)))
    const vw = w * k
    const vh = h * k
    return [r3((x0 + x1) / 2 - vw / 2), r3((z0 + z1) / 2 - vh / 2), r3(vw), r3(vh)]
}

/** Zoom a viewBox by `factor` (>1 zooms in) about a point in metres. */
export const zoomView = ([x, y, w, h], factor, [px, py]) => {
    const nw = w / factor
    const nh = h / factor
    return [px - ((px - x) * nw) / w, py - ((py - y) * nh) / h, nw, nh]
}

/** The extent of what is rigged, padded; the venue's when nothing is rigged yet. */
export const rigExtent = ({ lamps = [], pieces = [], boxes = [], zones = [] }, fallback = null, pad = 2) => {
    const xs = []
    const zs = []
    for (const l of lamps) { xs.push(l.at[0]); zs.push(l.at[1]) }
    for (const p of [...pieces, ...boxes]) for (const [x, z] of p.outline) { xs.push(x); zs.push(z) }
    for (const z of zones) for (const r of z.rects) { xs.push(r[0], r[2]); zs.push(r[1], r[3]) }
    if (!xs.length) return fallback
    return [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad]
}

/**
 * Where the room beside the plot opens: over the audience end of what is rigged,
 * looking back at it from 6 m up — inside the venue's walls (2 m in),
 * so it is never outside the hall looking at a wall; a wider lens on a portrait phone.
 */
export const roomCameraFor = (extent, venue = null, portrait = false) => {
    const [x0, z0, x1, z1] = extent
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const span = Math.max(x1 - x0, z1 - z0, 8)
    // Inside the walls and under the roof: a camera past the end wall sees the wall.
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
    let px = cx
    // Just inside the audience end of the rig, at 6 m: under what a hall hangs low
    // (MOXIR's crane girders at 8.15 m, runways at 6.56 m sit beside the nave).
    let pz = z1 - Math.min(4, span * 0.08)
    if (venue) {
        px = clamp(px, venue[0] + 2, venue[2] - 2)
        pz = clamp(pz, venue[1] + 2, venue[3] - 2)
    }
    return {
        position: [px, 6, pz],
        target: [cx, 2.5, cz + (z1 - z0) * 0.08],
        fov: portrait ? 75 : 55,
        projection: 'perspective',
        near: 0.1,
        far: 2000
    }
}

export { snapToGrid }
