// AIM — what the hand in the room is pointing at, and where the piece in it would
// land. View A of the rig builder, first person (docs/architecture/RIG_BUILD.md §12).
// Pure: a ray and the rig in, a hit and a pose out.
//
// The ray is cast against the RIG, not against the venue's mesh: the floor (y = 0),
// every piece as the box its catalogue record gives (pieces.js — the same numbers the
// GLB bodies are built from), and every lamp as a small sphere at its lens. That is
// exact for what can be built on, costs a few hundred multiplications a frame for a
// rig of 100 lamps, and needs no BVH over a 3.5 MB hall. The price, stated: the ray
// goes through the hall's walls and columns, so a floor spot behind a column can be
// aimed at; the reach limit keeps that honest.
//
// Where a piece lands is always the base's snap() (snap.js) — this module only turns
// "what the hand is on" into the candidate pose snap() is given, the way a first-person
// builder attaches a block to the face you look at:
//
//   hand on            lamp in hand          truss in hand            tower in hand          deck in hand
//   the floor          stands on the grid    hangs at its height      stands on the grid     stands on the grid
//   a truss            hangs at the nearest  continues from its       stands under its       —
//                      slot                  nearer end               nearer end
//   a tower            —                     sits on its top          —                      —
//   a deck             stands on its top     hangs over it            stands beside it       joins its nearest edge
//
// "—" is refused with a sentence, never guessed.

import { GRID_M, PIECES, TOWER_PLATE_M, TRUSS_SECTION_M, pieceOf, pieceWithHeight } from './pieces.js'
import { rotateY, snap, wrapYaw } from './snap.js'

/** How far the hand reaches, in metres. A hall is big; a hand on a truss 40 m away is not building. */
export const REACH_M = 40
/** A lamp is hit within this radius of its lens. */
export const LAMP_HIT_RADIUS_M = 0.35

const EPS = 1e-9
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const unit = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * The box a piece occupies, in its own frame (origin and yaw as pieces.js says):
 * [min, max]. A tower is aimed at by its plate's footprint, so a hand on the tower's
 * thin section is not a near miss.
 */
export const pieceBox = (kind, height = null) => {
    const piece = pieceWithHeight(kind, height)
    if (!piece) return null
    const h = TRUSS_SECTION_M / 2
    if (piece.category === 'truss') return [[-piece.length / 2, -h, -h], [piece.length / 2, h, h]]
    if (piece.category === 'tower') return [[-TOWER_PLATE_M / 2, 0, -TOWER_PLATE_M / 2], [TOWER_PLATE_M / 2, piece.height, TOWER_PLATE_M / 2]]
    const [w, hh, d] = piece.size
    return [[-w / 2, 0, -d / 2], [w / 2, hh, d / 2]]
}

// Ray against an axis-aligned box (the slab method, Kay & Kajiya 1986): the entry
// distance and the face's normal, or null.
const rayBox = (o, d, [min, max]) => {
    let t0 = -Infinity
    let t1 = Infinity
    let axis = -1
    let sign = 0
    for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < EPS) {
            if (o[i] < min[i] || o[i] > max[i]) return null
            continue
        }
        let a = (min[i] - o[i]) / d[i]
        let b = (max[i] - o[i]) / d[i]
        let s = -Math.sign(d[i])
        if (a > b) { [a, b] = [b, a] }
        if (a > t0) { t0 = a; axis = i; sign = s }
        if (b < t1) t1 = b
        if (t0 > t1) return null
    }
    if (t1 < 0) return null
    const normal = [0, 0, 0]
    if (axis >= 0) normal[axis] = sign
    return { t: Math.max(0, t0), normal }
}

/**
 * The first thing along the ray within reach.
 * @param {object} args
 * @param {number[]} args.origin   the eye
 * @param {number[]} args.direction the aim (need not be unit length)
 * @param {{id, kind, position, yaw, height}[]} [args.pieces]  piecesOf()
 * @param {{id, lens: number[]}[]} [args.lamps]                plotData().lamps
 * @param {number} [args.reach]
 * @returns {null | {what: 'floor'|'piece'|'lamp', id?: string, kind?: string, point: number[], normal: number[], distance: number}}
 */
export const castAim = ({ origin, direction, pieces = [], lamps = [], reach = REACH_M }) => {
    const d = unit(direction)
    let best = null
    const take = (hit) => { if (hit.distance <= reach && (!best || hit.distance < best.distance - EPS)) best = hit }
    if (d[1] < -EPS && origin[1] > 0) {
        const t = -origin[1] / d[1]
        take({ what: 'floor', point: add(origin, scale(d, t)).map(clean), normal: [0, 1, 0], distance: t })
    }
    for (const p of pieces) {
        const box = pieceBox(p.kind, p.height)
        if (!box) continue
        const yaw = p.yaw || 0
        const o = rotateY(sub(origin, p.position), -yaw)
        const dl = rotateY(d, -yaw)
        const hit = rayBox(o, dl, box)
        if (!hit) continue
        take({ what: 'piece', id: p.id, kind: p.kind, point: add(origin, scale(d, hit.t)).map(clean), normal: rotateY(hit.normal, yaw).map(clean), distance: hit.t })
    }
    for (const l of lamps) {
        const c = l.lens
        const oc = sub(origin, c)
        const b = dot(oc, d)
        const q = dot(oc, oc) - LAMP_HIT_RADIUS_M ** 2
        const disc = b * b - q
        if (disc < 0) continue
        const t = -b - Math.sqrt(disc)
        if (t < 0) continue
        take({ what: 'lamp', id: l.id, point: add(origin, scale(d, t)).map(clean), normal: unit(sub(add(origin, scale(d, t)), c)), distance: t })
    }
    return best
}

const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6)

const worldPointsOf = (piece) => (pieceWithHeight(piece.kind, piece.height)?.points || []).map((pt) => ({
    ...pt,
    pos: add(piece.position, rotateY(pt.pos, piece.yaw || 0)),
    normal: rotateY(pt.normal, piece.yaw || 0)
}))

const nearestPoint = (piece, kinds, at) => {
    let best = null
    for (const pt of worldPointsOf(piece)) {
        if (!kinds.includes(pt.kind)) continue
        const dd = dist(pt.pos, at)
        if (!best || dd < best.d) best = { ...pt, d: dd }
    }
    return best
}

/** The piece a hotbar slot carries: 'truss-3m', 'tower', 'deck-2x1' or 'lamp'. */
const categoryOfSlot = (slot) => (slot.kind === 'lamp' ? 'lamp' : pieceOf(slot.kind)?.category || null)

/**
 * Where the thing in hand would land, given what the hand is on.
 *
 * @param {object} args
 * @param {{kind: string, effect?: boolean}} args.slot  a piece kind, or {kind: 'lamp'} (effect: floor/deck only)
 * @param {object} args.hit        castAim()'s answer
 * @param {number} [args.yaw]      the heading R has turned it to
 * @param {number} [args.height]   a truss's hanging height (its centre line), a tower's or a deck's own height
 * @param {object[]} args.pieces   piecesOf()
 * @returns {{ok: true, kind: string, position: number[], yaw: number, height: number|null, hung?: boolean, to: object}
 *          | {ok: false, reason: string}}
 */
export const placement = ({ slot, hit, yaw = 0, height = null, pieces = [] }) => {
    if (!hit) return { ok: false, reason: 'aim at the floor, a truss, a tower or a deck' }
    if (hit.what === 'lamp') return { ok: false, reason: 'that is a lamp — aim at what it hangs on' }
    const category = categoryOfSlot(slot)
    const target = hit.what === 'piece' ? pieces.find((p) => p.id === hit.id) : null
    const on = target ? pieceOf(target.kind).category : 'floor'
    const others = pieces.map((p) => ({ id: p.id, kind: p.kind, position: p.position, yaw: p.yaw, height: p.height }))
    const done = (res, kind, h = null) => ({ ok: true, kind, position: res.position, yaw: res.yaw, height: h, ...(res.hung != null ? { hung: res.hung } : {}), to: res.to })

    if (category === 'lamp') {
        if (on === 'truss') {
            if (slot.effect) return { ok: false, reason: 'an effect stands on the floor or a deck, it does not hang' }
            const s = nearestPoint(target, ['slot'], hit.point)
            return done(snap({ kind: 'lamp', position: s.pos, others }), 'lamp')
        }
        if (on === 'tower') return { ok: false, reason: 'a tower has no clamp point here — hang it on a truss or stand it on a deck' }
        // The floor or a deck's top: stand. A deck's side is not its top — snap()
        // stands a lamp only when it is at the deck's height.
        const at = on === 'deck' ? [hit.point[0], target.height ?? pieceOf(target.kind).size[1], hit.point[2]] : [hit.point[0], 0, hit.point[2]]
        return done(snap({ kind: 'lamp', position: at, others }), 'lamp')
    }

    if (category === 'truss') {
        const piece = pieceOf(slot.kind)
        if (on === 'truss') {
            // Continue the line from the nearer end: the new truss's end meets it.
            const end = nearestPoint(target, ['end'], hit.point)
            const at = add(end.pos, scale(end.normal, piece.length / 2))
            return done(snap({ kind: slot.kind, position: at, yaw: target.yaw || 0, others }), slot.kind)
        }
        if (on === 'tower') {
            // Sit end A on the tower's top, the truss running along its heading.
            const top = nearestPoint(target, ['top'], hit.point)
            const at = sub(add(top.pos, [0, TRUSS_SECTION_M / 2, 0]), rotateY(piece.points[0].pos, yaw))
            return done(snap({ kind: slot.kind, position: at, yaw, others }), slot.kind)
        }
        const h = Number.isFinite(height) ? height : 6
        return done(snap({ kind: slot.kind, position: [hit.point[0], h, hit.point[2]], yaw, others }), slot.kind)
    }

    if (category === 'tower') {
        const h = Number.isFinite(height) ? height : PIECES.tower.height
        let foot = [hit.point[0], 0, hit.point[2]]
        if (on === 'truss') {
            const end = nearestPoint(target, ['end'], hit.point)
            foot = [end.pos[0], 0, end.pos[2]]
        } else if (on !== 'floor') {
            return { ok: false, reason: 'a tower stands on the floor — aim at the floor, or at a truss end to stand it under' }
        }
        // As the plot does (PlotSurface placementPose): measured on the plan, a tower
        // near a truss end stands on the floor and is built up to it.
        const res = snap({ kind: 'tower', position: foot, yaw, others, metric: 'plan', height: h })
        if (res.to.join === 'under') {
            return done({ ...res, position: [res.position[0], 0, res.position[2]] }, 'tower', Math.round((res.position[1] + h) * 1000) / 1000)
        }
        return done(snap({ kind: 'tower', position: foot, yaw, others, height: h }), 'tower', h)
    }

    if (category === 'deck') {
        if (on === 'deck') {
            // Beside it: the new deck's facing edge meets the aimed deck's nearest edge,
            // at the aimed deck's height (a riser is one level).
            const edge = nearestPoint(target, ['edge'], hit.point)
            const h = target.height ?? pieceOf(target.kind).size[1]
            const [w, , d] = pieceOf(slot.kind).size
            const half = Math.abs(edge.normal[0]) > 0.5 ? w / 2 : d / 2
            const at = [edge.pos[0] + edge.normal[0] * half, 0, edge.pos[2] + edge.normal[2] * half]
            return done(snap({ kind: slot.kind, position: at, yaw: target.yaw || 0, others, height: h }), slot.kind, h)
        }
        if (on !== 'floor') return { ok: false, reason: 'a deck stands on the floor or beside another deck' }
        const h = Number.isFinite(height) ? height : pieceOf(slot.kind).size[1]
        return done(snap({ kind: slot.kind, position: [hit.point[0], 0, hit.point[2]], yaw, others, height: h }), slot.kind, h)
    }
    return { ok: false, reason: 'nothing in hand' }
}

/** What snapped, in words, for the status line ("snap: truss slot 7"). */
export const snapWords = (res, pieces = []) => {
    if (!res?.ok) return res?.reason || ''
    if (res.to?.grid) return `grid ${res.to.grid} m`
    const target = pieces.find((p) => p.id === res.to?.id)
    const words = {
        face: target?.category === 'deck' ? 'deck edge' : 'truss end',
        sit: 'tower top',
        under: 'under the truss end',
        hang: `truss slot ${String(res.to?.point || '').replace('slot-', '')}`,
        stand: 'deck top'
    }
    return `snap: ${words[res.to?.join] || res.to?.join || '—'}`
}

// ---- Q / E and R: the hand's own adjustments ---------------------------------------

/** How Q/E step each piece's height, and its bounds (metres). */
export const HEIGHT_STEPS = Object.freeze({
    truss: { step: GRID_M, min: 1, max: 20, start: 6 },
    tower: { step: GRID_M, min: 1, max: 12, start: PIECES.tower.height },
    deck: { step: 0.2, min: 0.2, max: 2, start: 1 }
})

export const stepHeight = (category, height, dir) => {
    const s = HEIGHT_STEPS[category]
    if (!s) return height
    const h = Number.isFinite(height) ? height : s.start
    return Math.round(Math.min(s.max, Math.max(s.min, h + dir * s.step)) * 1000) / 1000
}

/** R turns a quarter; Shift+R a 15° step (the plot's heading step). */
export const turn = (yaw, { fine = false, back = false } = {}) => wrapYaw(yaw + (back ? -1 : 1) * (fine ? Math.PI / 12 : Math.PI / 2))
