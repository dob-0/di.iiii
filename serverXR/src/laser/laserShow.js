// THE SHOW ON THE CUBES (2026-10-17) — a project's laser lines, played on the real LaserCubes.
//
// The room draws a laser line's `frames` ({ period, list }) by SHOW TIME: list[floor(((t mod period) / period) · n)],
// t the server's clock in seconds (src/objectComponents/laserLine.js §6; SpotLightObject.jsx useLaserFrameIndex). Until
// now that drawing reached the room only. This player gives the same frames to the cubes the engine drives: at every
// tick it reads the clock, picks each line's frame, re-aims it from the line's field into its cube's field, joins the
// cube's lines into one drawing, keeps it in the engine (setFrame) when it changes and keeps it alive (alive) in between.
// Nothing of the engine's safety moves: the zone, the guards and the arming are the engine's as before — a cube that is
// not armed takes the frame and emits nothing, and the sign-off phrase stays a person's to type.
//
// THE RE-AIM. In the room each laser line is its own lamp: a frame point (x, y) is a direction in THAT line's field
// (laserLine.js fieldDirection: forward −Y, right +X, up +Z, tan(x·half-angle)), and the line's own rotation (its
// transform, an XYZ Euler as the room applies it) carries it into the world. One real cube draws all of its lines, so
// each point is carried to the world through its line's rotation and back into the cube's field through the cube's: the
// cube's aim is the mean of its lines' forwards (as scripts/place/laser_frames.py defines a cube's axis), roll 0. A point
// that falls outside the cube's field is blanked and counted (`outside`), never pulled to the edge.
//
// Which lines are one cube: the rig builder (scripts/place/rig.mjs) names a cube's lines <group><letters>
// (rig-laser-1a … rig-laser-1f = one cube), so a line's group is its id without the trailing letters; a line whose id
// ends otherwise is a group of its own. Which real cube plays which group: `map` { cubeId: groupId }; by default the
// cubes and the groups in sorted order, side by side (cube-1 ↔ rig-laser-1 …). A frame the schema dropped is not drawn,
// exactly as in the room. The player holds its cubes as the Laser Out `show:<project>` (one Out per cube, laserEngine.js):
// a Nodes editor's Out on the same cube refuses it, and the state says so per cube.
//
// STILL BEAMS. A show of static lines (a comb over the audience) is, to the engine's still-beam guard, a frame of dots:
// held 200 ms it blanks the cube (laserEngine.js rule 7). The guard allows only the still beams the laser safety officer
// listed for that cube (laser.json stillBeams). `stillBeamsOfShow` lists every still dot the show's frames hold per real
// cube, so the officer can approve the show's set with the sign-off phrase (POST /laser/api/show/still); a dot the show
// does not hold stays forbidden, and an edited show must be approved again.
'use strict'

const { normaliseFramePoints } = require('../../../shared/laserFrame.cjs')

const TICK_MS = 50 // well inside the engine's signal-loss stop (FRAME_TIMEOUT_MS 200)
const RELOAD_MS = 15000 // the document read again: an edit during the show carries without a restart
const MAX_FRAMES = 256
const MAX_FRAME_POINTS_TOTAL = 20000
const FIELD_HALF_DEG = 18.5 // the room's default (laserLine.js FIELD_HALF_DEG) = the engine's SCAN_HALF_ANGLE_DEG
const DEG = Math.PI / 180
const BLANK = [0, 0, 0, 0, 0]

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0

// ---- geometry (pure) -------------------------------------------------------------------------------------------------

/** The 3×3 matrix of an XYZ Euler [rx, ry, rz] (radians), as three.js applies an entity's rotation. */
const eulerXYZ = ([rx, ry, rz]) => {
    const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz)
    const ae = a * e, af = a * f, be = b * e, bf = b * f
    return [
        [c * e, -c * f, d],
        [af + be * d, ae - bf * d, -b * c],
        [bf - ae * d, be + af * d, a * c]
    ]
}
const apply = (m, [x, y, z]) => [m[0][0] * x + m[0][1] * y + m[0][2] * z, m[1][0] * x + m[1][1] * y + m[1][2] * z, m[2][0] * x + m[2][1] * y + m[2][2] * z]
const applyT = (m, [x, y, z]) => [m[0][0] * x + m[1][0] * y + m[2][0] * z, m[0][1] * x + m[1][1] * y + m[2][1] * z, m[0][2] * x + m[1][2] * y + m[2][2] * z]

/** A frame point as a direction in the lamp's frame (laserLine.js fieldDirection): forward −Y, right +X, up +Z. */
const fieldDirection = (x, y, fieldHalfDeg = FIELD_HALF_DEG) => {
    const tx = Math.tan(clamp(x, -1, 1) * fieldHalfDeg * DEG)
    const ty = Math.tan(clamp(y, -1, 1) * fieldHalfDeg * DEG)
    const l = Math.hypot(tx, ty, 1)
    return [tx / l, -1 / l, ty / l]
}

/** fieldDirection undone: a lamp-frame direction as the field point that draws it, or null when it is behind or outside. */
const fieldPoint = ([dx, dy, dz], fieldHalfDeg = FIELD_HALF_DEG) => {
    if (!(-dy > 1e-9)) return null
    // Rounded to 1e-6 field units (0.00002°): a point on the cube's own axis reads 0, not −1e-17, which the zone's
    // edge (yMin 0) would otherwise blank.
    const x = Math.round((Math.atan(dx / -dy) / (fieldHalfDeg * DEG)) * 1e6) / 1e6
    const y = Math.round((Math.atan(dz / -dy) / (fieldHalfDeg * DEG)) * 1e6) / 1e6
    return Math.abs(x) <= 1 + 1e-9 && Math.abs(y) <= 1 + 1e-9 ? [clamp(x, -1, 1), clamp(y, -1, 1)] : null
}

/**
 * The rotation whose forward (−Y) is the world direction `d`, roll 0: [−π/2 − pitch, 0, yaw] (the rig's own convention).
 * With XYZ order the yaw turns the lamp first, then the pitch tips the turned lamp about world X, so the forward is
 * [sin yaw, sin pitch · cos yaw, cos pitch · cos yaw] (eulerXYZ) — undone here exactly, not by spherical angles.
 */
const aimAt = ([dx, dy, dz]) => {
    const l = Math.hypot(dx, dy, dz) || 1
    return [-Math.PI / 2 - Math.atan2(dy, dz), 0, Math.asin(clamp(dx / l, -1, 1))]
}

/** The cube's aim for a group of lines: the mean of their forwards, roll 0, and the field they share. */
const aimOfGroup = (lines) => {
    const sum = [0, 0, 0]
    for (const l of lines) { const f = apply(l.matrix, [0, -1, 0]); sum[0] += f[0]; sum[1] += f[1]; sum[2] += f[2] }
    const rotation = aimAt(sum)
    return { rotation, matrix: eulerXYZ(rotation), fieldHalfDeg: lines[0]?.fieldHalfDeg ?? FIELD_HALF_DEG }
}

/** A line's frame point in its cube's field: [x, y] or null (outside the cube's field, or behind it). */
const toCubeField = (line, cube, x, y) => fieldPoint(applyT(cube.matrix, apply(line.matrix, fieldDirection(x, y, line.fieldHalfDeg))), cube.fieldHalfDeg)

// ---- the document's lines --------------------------------------------------------------------------------------------

/** A line's group: its id without the trailing letters (rig-laser-1a → rig-laser-1), else the id itself. Pure. */
const groupOfLine = (id) => {
    const s = String(id || '')
    const m = /^(.*\d)[a-z]+$/.exec(s)
    return m ? m[1] : s
}

/** `frames` cleaned as the room cleans them (laserLine.js framesOf): { period, list } or null. Pure. */
const framesOf = (frames) => {
    if (!frames || typeof frames !== 'object' || !Array.isArray(frames.list)) return null
    const period = num(frames.period)
    if (!(period > 0)) return null
    const list = []
    let total = 0
    for (const f of frames.list.slice(0, MAX_FRAMES)) {
        const pts = normaliseFramePoints(f).points
        if (!pts.length) continue
        if (total + pts.length > MAX_FRAME_POINTS_TOTAL) break
        total += pts.length
        list.push(pts)
    }
    return list.length ? { period: Math.min(3600, Math.max(0.05, period)), list } : null
}

/** Which of `frames.list` is on at show time `t` (seconds) — the room's formula. Pure. */
const frameIndexAt = (frames, t) => {
    if (!frames?.list?.length || !(frames.period > 0)) return -1
    const n = frames.list.length
    const phase = ((num(t) % frames.period) + frames.period) % frames.period
    return Math.min(n - 1, Math.floor((phase / frames.period) * n))
}

const rotationOf = (entity) => {
    const r = entity?.components?.transform?.rotation
    return Array.isArray(r) && r.length >= 3 && r.slice(0, 3).every((v) => Number.isFinite(Number(v))) ? r.slice(0, 3).map(Number) : [0, 0, 0]
}

/**
 * The document's laser lines with frames, grouped by cube: Map groupId → { lines: [{ id, frames, rotation, matrix,
 * fieldHalfDeg }], cube: { rotation, matrix, fieldHalfDeg } }, groups and lines in sorted order. Pure.
 */
const lineGroupsOf = (document) => {
    const entities = Array.isArray(document?.entities) ? document.entities : []
    const byGroup = new Map()
    for (const e of entities) {
        const laser = e?.components?.beam?.laser
        const frames = framesOf(laser?.frames)
        if (!frames || !e.id) continue
        const g = groupOfLine(e.id)
        if (!byGroup.has(g)) byGroup.set(g, [])
        const rotation = rotationOf(e)
        const half = num(laser.fieldHalfDeg)
        byGroup.get(g).push({ id: String(e.id), frames, rotation, matrix: eulerXYZ(rotation), fieldHalfDeg: half > 0 ? half : FIELD_HALF_DEG })
    }
    const groups = new Map()
    for (const g of [...byGroup.keys()].sort()) {
        const lines = byGroup.get(g).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        groups.set(g, { lines, cube: aimOfGroup(lines) })
    }
    return groups
}

/**
 * One cube's drawing at show time `t`: each line's frame on now, re-aimed into the cube's field; lit strokes joined with
 * a blank move to the first point and a blank at the last. A point outside the cube's field is blanked and counted. A
 * cube with nothing lit draws one blank point (dark, as the compiled frames do). Pure.
 * @returns {{ points: number[][], outside: number }}
 */
const cubeFrameAt = (group, t, { scale = 1 } = {}) => {
    const strokes = []
    let outside = 0
    for (const l of group.lines) {
        const i = frameIndexAt(l.frames, t)
        if (i < 0) continue
        const pts = l.frames.list[i].map((p) => {
            const q = toCubeField(l, group.cube, p[0], p[1])
            if (!q && isLit(p)) outside += 1
            return q ? [q[0], q[1], p[2], p[3], p[4]] : [clamp(p[0], -1, 1), clamp(p[1], -1, 1), 0, 0, 0]
        })
        if (pts.some(isLit)) strokes.push(pts)
    }
    // The zoom (a projector's size control): a number about the cube's axis, or 'fit' — this picture fills the field
    // about its own lit centre. What leaves the field is blanked and counted.
    const { k, cx, cy } = zoomOf(scale, strokes)
    const out = []
    for (const pts of strokes) {
        const z = pts.map((p) => {
            const x = (p[0] - cx) * k
            const y = (p[1] - cy) * k
            if (Math.abs(x) <= 1 && Math.abs(y) <= 1) return [x, y, p[2], p[3], p[4]]
            if (isLit(p)) outside += 1
            return [clamp(x, -1, 1), clamp(y, -1, 1), 0, 0, 0]
        })
        if (!z.some(isLit)) continue
        const first = z[0]
        const last = z[z.length - 1]
        out.push([first[0], first[1], 0, 0, 0], ...z, [last[0], last[1], 0, 0, 0])
    }
    return { points: out.length ? out : [BLANK], outside }
}

const FIT_EDGE = 0.9 // 'fit' fills the field to here, a margin inside its edge

/** The zoom of a picture: { k, cx, cy } — 'fit' about the lit centre to FIT_EDGE, a number about the axis. Pure. */
const zoomOf = (scale, strokes) => {
    if (scale !== 'fit') return { k: scaleOf(scale), cx: 0, cy: 0 }
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (const pts of strokes) for (const p of pts) if (isLit(p)) { xMin = Math.min(xMin, p[0]); xMax = Math.max(xMax, p[0]); yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]) }
    if (!(xMin <= xMax)) return { k: 1, cx: 0, cy: 0 }
    const e = Math.max(xMax - xMin, yMax - yMin) / 2
    return { k: e > 1e-6 ? Math.min(10, FIT_EDGE / e) : 1, cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2 }
}

/** The zoom, 0.1 … 10, 1 when not a number: the room's picture as drawn. Pure. */
const scaleOf = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? clamp(n, 0.1, 10) : 1 }

/** The frame indices of a group's lines at `t`, as one key: it changes exactly when the drawing changes. Pure. */
const frameKeyAt = (group, t) => group.lines.map((l) => frameIndexAt(l.frames, t)).join(',')

/** Cubes and groups side by side in sorted order: { cubeId: groupId }. Extra cubes stay unmapped. Pure. */
const defaultMap = (cubeIds, groupIds) => {
    const cubes = [...cubeIds].map(String).sort()
    const groups = [...groupIds].map(String).sort()
    const map = {}
    cubes.forEach((c, i) => { if (i < groups.length) map[c] = groups[i] })
    return map
}

/**
 * Every still dot a group's frames hold over one period, as the engine's guard sees them (`stillBeams` is the engine's
 * own function), each once: [{ x, y, within }], `within` the engine's default tolerance. The frames are sampled at the
 * middle of every step of the finest list. Pure.
 */
const stillBeamsOfGroup = (group, stillBeams, { within = 0.01, grid = 0.005, scale = 1 } = {}) => {
    const n = Math.max(1, ...group.lines.map((l) => l.frames.list.length))
    const period = group.lines[0]?.frames.period ?? 1
    const seen = new Map()
    for (let i = 0; i < n; i += 1) {
        const { points } = cubeFrameAt(group, ((i + 0.5) * period) / n, { scale })
        for (const d of stillBeams(points)) {
            const key = `${Math.round(d.x / grid)},${Math.round(d.y / grid)}`
            if (!seen.has(key)) seen.set(key, { x: Math.round(d.x * 1e4) / 1e4, y: Math.round(d.y * 1e4) / 1e4, within })
        }
    }
    return [...seen.values()]
}

// ---- the player -------------------------------------------------------------------------------------------------------

/**
 * The player. `getEngine` gives the engine of the moment (a config reload rebuilds it); `loadDocument(projectId)`
 * resolves to the project's document, or null when there is no such project.
 * @param {{ getEngine: () => object, loadDocument?: (projectId: string) => Promise<object|null>, now?: () => number,
 *   setInterval?: Function, clearInterval?: Function, log?: object }} opts
 */
const createShowPlayer = ({ getEngine, loadDocument, now = Date.now, setInterval: every = setInterval, clearInterval: stopEvery = clearInterval, log = null }) => {
    let run = null // { project, out, map: [{ cube, group, lines, key, held, outside }], groups, timer, startedAt, reloadedAt, reloadMs, error, reloading }

    const groupsFor = async (project) => {
        if (typeof loadDocument !== 'function') return { ok: false, status: 501, error: 'this server cannot read projects for the lasers (no document loader)' }
        const document = await loadDocument(project)
        if (!document) return { ok: false, status: 404, error: `no project "${project}"` }
        const groups = lineGroupsOf(document)
        if (!groups.size) return { ok: false, status: 400, error: `no laser line with frames in "${project}" — the room has nothing to draw either` }
        return { ok: true, groups }
    }

    const mapFor = (groups, wanted) => {
        const cubeIds = getEngine().state().cubes.map((c) => c.id)
        const chosen = wanted && typeof wanted === 'object' ? wanted : defaultMap(cubeIds, groups.keys())
        const map = []
        const unknown = []
        for (const [cube, group] of Object.entries(chosen)) {
            if (!cubeIds.includes(cube)) { unknown.push(`no cube "${cube}"`); continue }
            if (!groups.has(String(group))) { unknown.push(`no laser lines "${group}" for ${cube}`); continue }
            map.push({ cube, group: String(group), lines: groups.get(String(group)), key: null, held: null, outside: 0 })
        }
        return { map, unknown }
    }

    /** The project's groups mapped to the cubes, without playing: for the still-beam approval. */
    const resolve = async ({ project, map: wanted, scale } = {}) => {
        const id = typeof project === 'string' ? project.trim() : ''
        if (!id) return { ok: false, status: 400, error: 'say which project: { project }' }
        const got = await groupsFor(id)
        if (!got.ok) return got
        const { map, unknown } = mapFor(got.groups, wanted)
        if (!map.length) return { ok: false, status: 400, error: `nothing to play: ${unknown.join('; ') || 'no cubes'}` }
        return { ok: true, project: id, groups: got.groups, map, unknown, scale: scale === 'fit' ? 'fit' : scaleOf(scale) }
    }

    const tick = () => {
        if (!run) return
        const engine = getEngine()
        const t = now() / 1000
        for (const m of run.map) {
            const key = frameKeyAt(m.lines, t)
            let res
            if (key !== m.key || m.held) {
                const frame = cubeFrameAt(m.lines, t, { scale: run.scale })
                m.outside = frame.outside
                res = engine.setFrame(m.cube, frame.points, run.out)
            } else res = engine.alive(m.cube, run.out)
            if (res.ok) { m.key = key; m.held = null } else { m.held = res.error; m.key = null }
        }
        if (now() - run.reloadedAt >= run.reloadMs && !run.reloading) {
            run.reloading = true
            const r = run
            groupsFor(r.project).then((got) => {
                if (run !== r) return
                r.reloadedAt = now()
                if (got.ok) {
                    r.groups = got.groups
                    for (const m of r.map) if (got.groups.has(m.group)) { m.lines = got.groups.get(m.group); m.key = null }
                    r.error = null
                } else r.error = got.error
            }, (e) => { if (run === r) { r.reloadedAt = now(); r.error = e?.message || String(e) } })
                .finally(() => { if (run === r) r.reloading = false })
        }
    }

    const stop = () => {
        if (!run) return { stopped: false }
        const r = run
        run = null
        stopEvery(r.timer)
        const engine = getEngine()
        for (const m of r.map) engine.setFrame(m.cube, [BLANK], r.out) // its cubes go dark; the frame times out as any other
        log?.info?.(`[laser] show "${r.project}" stopped on ${r.map.map((m) => m.cube).join(', ')}`)
        return { stopped: true, project: r.project }
    }

    /** Play `project` on the cubes: { project, map?: { cubeId: groupId }, reloadMs? }. Restarts a running show. */
    const start = async (opts = {}) => {
        const got = await resolve(opts)
        if (!got.ok) return got
        stop()
        const t0 = now()
        run = { project: got.project, out: `show:${got.project}`, map: got.map, groups: got.groups, scale: got.scale, timer: null, startedAt: t0, reloadedAt: t0, reloadMs: Math.max(1000, num(opts.reloadMs, RELOAD_MS)), error: null, reloading: false }
        tick()
        run.timer = every(tick, TICK_MS)
        run.timer?.unref?.()
        log?.info?.(`[laser] show "${got.project}" playing: ${got.map.map((m) => `${m.cube} ← ${m.group} (${m.lines.lines.length} lines)`).join(', ')}${got.unknown.length ? `; ignored: ${got.unknown.join('; ')}` : ''}`)
        return { ok: true, project: got.project, ignored: got.unknown }
    }

    const state = () => {
        if (!run) return { playing: false }
        const t = now() / 1000
        return {
            playing: true,
            project: run.project,
            out: run.out,
            scale: run.scale,
            startedAt: run.startedAt,
            reloadedAt: run.reloadedAt,
            error: run.error,
            cubes: run.map.map((m) => ({
                cube: m.cube,
                group: m.group,
                lines: m.lines.lines.length,
                period: m.lines.lines[0]?.frames.period ?? null,
                index: frameIndexAt(m.lines.lines[0]?.frames, t),
                aim: m.lines.cube.rotation.map((v) => Math.round(v * 1e4) / 1e4),
                outside: m.outside,
                held: m.held
            })),
            groups: [...run.groups.keys()]
        }
    }

    return { start, stop, state, tick, resolve }
}

module.exports = {
    createShowPlayer, lineGroupsOf, groupOfLine, framesOf, frameIndexAt, cubeFrameAt, frameKeyAt, defaultMap, stillBeamsOfGroup, scaleOf,
    eulerXYZ, fieldDirection, fieldPoint, aimAt, aimOfGroup, toCubeField, TICK_MS, RELOAD_MS, FIELD_HALF_DEG
}
