// SNAP — where a piece or a lamp lands when it is let go near others.
// docs/architecture/RIG_BUILD.md §2.3. Pure: poses in, a pose out.
//
// The joins, and nothing else:
//
//   truss end    ->  truss end     continues the line (opposite ends meet, the moving
//                                   truss turns to face along it)
//   truss end    ->  tower top     the truss's centre line lands half a section above
//                                   the top, the truss keeps its heading
//   tower top    ->  truss end     the same join from below: the tower stands under it
//   deck edge    ->  deck edge     side by side, tops level, facing edges together
//   lamp mount   ->  truss slot    hung under the truss (hung: true)
//   lamp mount   ->  deck top      standing on the deck, on the 0.5 m grid
//   anything     ->  the grid      x and z to 0.5 m; a deck, a tower or a lamp to the
//                                   floor (y = 0); a truss keeps its height
//
// A join wins when the moving point is within `radius` of the target point
// (default 0.35 m — a little over one truss section, so a truss end finds another
// without landing on the wrong one). The nearest join wins. Nothing is ever joined
// to itself. Yaw is a turn about Y in radians, three.js's sense (+X turns toward -Z).

import { GRID_M, LAMP_POINT, TRUSS_SECTION_M, pieceOf, pieceWithHeight } from './pieces.js'

export const SNAP_RADIUS_M = 0.35

const EPS = 1e-9

export const rotateY = ([x, y, z], yaw) => {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    return [x * c + z * s, y, -x * s + z * c]
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const clean = (v) => v.map((c) => (Math.abs(c) < 1e-9 ? 0 : Math.round(c * 1e6) / 1e6))
const headingOf = (v) => Math.atan2(-v[2], v[0])
export const wrapYaw = (yaw) => {
    let a = yaw % (2 * Math.PI)
    if (a <= -Math.PI) a += 2 * Math.PI
    if (a > Math.PI) a -= 2 * Math.PI
    return Math.abs(a) < EPS ? 0 : Math.round(a * 1e9) / 1e9
}
export const snapToGrid = (v, grid = GRID_M) => Math.round(v / grid) * grid

const pointsOf = (kind, height = null) => (kind === 'lamp' ? [LAMP_POINT] : pieceWithHeight(kind, height)?.points || [])

const worldPoints = ({ id, kind, position = [0, 0, 0], yaw = 0, height = null }) =>
    pointsOf(kind, height).map((point) => ({
        owner: id,
        ownerKind: kind,
        point,
        pos: add(position, rotateY(point.pos, yaw)),
        normal: rotateY(point.normal, yaw)
    }))

// Which (moving point kind, target point kind) pairs join. The piece category of
// each side is checked too, so a deck's `edge` never meets a truss.
const JOINS = [
    { move: ['truss', 'end'], to: ['truss', 'end'], how: 'face' },
    { move: ['truss', 'end'], to: ['tower', 'top'], how: 'sit' },
    { move: ['tower', 'top'], to: ['truss', 'end'], how: 'under' },
    { move: ['deck', 'edge'], to: ['deck', 'edge'], how: 'face' },
    { move: ['lamp', 'mount'], to: ['truss', 'slot'], how: 'hang' },
    { move: ['lamp', 'mount'], to: ['deck', 'surface'], how: 'stand' }
]

const categoryOf = (kind) => (kind === 'lamp' ? 'lamp' : pieceOf(kind)?.category || null)

// How far a moving point is from a target — for a surface, from the surface's
// patch (and only when above-or-at it, within the radius).
// `plan` measures in x and z only — a view from above (the plot) cannot say how
// high the hand is, so a truss end finds a tower top, and a lamp a truss slot, by
// where they are on the floor plan.
const planDist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])
// On the plan a deck's top is under the whole deck, so it would always win against
// a truss hanging over it: there it counts as just inside the radius, and any truss
// slot actually within reach is preferred (hang over stand).
const reach = (moving, target, plan = false, radius = SNAP_RADIUS_M) => {
    if (target.point.kind !== 'surface') return plan ? planDist(moving.pos, target.pos) : dist(moving.pos, target.pos)
    const local = rotateY(sub(moving.pos, target.pos), -target.yaw)
    const [w, d] = target.point.extent
    if (Math.abs(local[0]) > w / 2 + EPS || Math.abs(local[2]) > d / 2 + EPS) return Infinity
    return plan ? radius * 0.999 : Math.abs(local[1])
}

/**
 * @param {object} args
 * @param {string} args.kind       a piece kind (pieces.js) or 'lamp'
 * @param {number[]} args.position the candidate position (where the hand is)
 * @param {number} [args.yaw]      the candidate heading
 * @param {string} [args.id]       the moving entity's id, never joined to itself
 * @param {{id: string, kind: string, position: number[], yaw?: number}[]} [args.others]
 * @param {number} [args.grid]
 * @param {number} [args.radius]
 * @param {number} [args.height]   the moving tower's or deck's height, when not the catalogue's
 * @param {'space'|'plan'} [args.metric] 'plan' joins by x/z distance only (a view from above)
 * @returns {{position: number[], yaw: number, hung?: boolean, to: {id: string, point: string, join: string} | {grid: number}}}
 */
export const snap = ({ kind, position, yaw = 0, id = null, others = [], grid = GRID_M, radius = SNAP_RADIUS_M, height = null, metric = 'space' }) => {
    const category = categoryOf(kind)
    if (!category) throw new Error(`nothing to snap: unknown kind "${kind}"`)
    const moving = worldPoints({ id, kind, position, yaw, height })
    const plan = metric === 'plan'
    let best = null
    for (const other of others) {
        if (!other || other.id === id) continue
        const otherCategory = categoryOf(other.kind)
        if (!otherCategory || otherCategory === 'lamp') continue
        const targets = worldPoints(other).map((t) => ({ ...t, yaw: other.yaw || 0 }))
        for (const join of JOINS) {
            if (join.move[0] !== category || join.to[0] !== otherCategory) continue
            for (const m of moving) {
                if (m.point.kind !== join.move[1]) continue
                for (const t of targets) {
                    if (t.point.kind !== join.to[1]) continue
                    const d = reach(m, t, plan, radius)
                    if (d <= radius && (!best || d < best.d - EPS)) best = { d, join, m, t }
                }
            }
        }
    }
    if (best) return land(best, { kind, position, yaw, grid })
    return toGrid({ kind, category, position, yaw, grid })
}

const toGrid = ({ kind, category, position, yaw, grid }) => {
    const floor = category === 'lamp' || pieceOf(kind)?.standsOnFloor === true
    return {
        position: clean([snapToGrid(position[0], grid), floor ? 0 : position[1], snapToGrid(position[2], grid)]),
        yaw: wrapYaw(yaw),
        ...(category === 'lamp' ? { hung: false } : {}),
        to: { grid }
    }
}

const land = ({ join, m, t }, { position, yaw, grid }) => {
    const to = { id: t.owner, point: t.point.id, join: join.how }
    if (join.how === 'face') {
        // Turn the moving piece so its point's normal looks straight back at the
        // target's, then slide it so the two points meet.
        const nextYaw = wrapYaw(headingOf(t.normal.map((c) => -c)) - headingOf(m.point.normal))
        const at = sub(t.pos, rotateY(m.point.pos, nextYaw))
        return { position: clean(at), yaw: nextYaw, to }
    }
    if (join.how === 'sit') {
        const end = add(t.pos, [0, TRUSS_SECTION_M / 2, 0])
        return { position: clean(sub(end, rotateY(m.point.pos, yaw))), yaw: wrapYaw(yaw), to }
    }
    if (join.how === 'under') {
        const top = sub(t.pos, [0, TRUSS_SECTION_M / 2, 0])
        return { position: clean(sub(top, rotateY(m.point.pos, yaw))), yaw: wrapYaw(yaw), to }
    }
    if (join.how === 'hang') {
        return { position: clean(t.pos), yaw: wrapYaw(yaw), hung: true, to }
    }
    // stand: on the deck's top, on the grid in the deck's own frame.
    const local = rotateY(sub(position, t.pos), -t.yaw)
    const [w, d] = t.point.extent
    const lx = Math.max(-w / 2, Math.min(w / 2, snapToGrid(local[0], grid)))
    const lz = Math.max(-d / 2, Math.min(d / 2, snapToGrid(local[2], grid)))
    return { position: clean(add(t.pos, rotateY([lx, 0, lz], t.yaw))), yaw: wrapYaw(yaw), hung: false, to }
}

/** The pose snap() needs for an entity already in the room. */
export const snapPoseOf = (entity, kind, height = null) => ({
    id: entity.id,
    kind,
    position: entity.components?.transform?.position || [0, 0, 0],
    yaw: entity.components?.transform?.rotation?.[1] || 0,
    ...(height != null ? { height } : {})
})
