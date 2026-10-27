// A RECORDED SESSION — the AR scan without a phone.
//
// The agent screen has no WebXR and no ARCore, so the AR screen is driven by
// TICKS: one per frame, the same shape whether they come from a live
// XRSession (xrSource.js) or from a JSON file played back here. A phone walk can
// be recorded in this shape (the AR screen keeps every tick at 2 Hz) and played
// again at the desk; the tests and the demo use a synthetic walk round a plain
// box room, made below, so every number in the tests can be worked out by hand.
//
// tick = {
//   time,                         ms since the session started
//   pose: { position, orientation },  camera → world (arMath.js conventions)
//   projection,                   16 numbers, column-major (XRView.projectionMatrix)
//   viewport: { width, height },  the camera image size
//   samples: [[x, y, z], …],      surface points in world metres (depth or hit-test)
//   centreDistance,               metres to what the middle of the view sees, or null
//   luma,                         0..1 mean brightness, or null
//   sharpness                     Laplacian variance (sharpness.js), or null
// }

import { DEG, headingQuat, mulQuat, perspective, toWorld, unprojectView, normalize, rotate } from './arMath.js'

export const SESSION_KIND = 'di.scan.session'

/** A box room, x in [-w/2, w/2], z in [-d/2, d/2], y in [0, h]. Distance along a ray to its first wall. */
export const boxRayDistance = (room, origin, direction) => {
    const lo = [-room.width / 2, 0, -room.depth / 2]
    const hi = [room.width / 2, room.height, room.depth / 2]
    let best = Infinity
    for (let axis = 0; axis < 3; axis += 1) {
        const d = direction[axis]
        if (Math.abs(d) < 1e-9) continue
        const t = ((d > 0 ? hi[axis] : lo[axis]) - origin[axis]) / d
        if (t > 0 && t < best) best = t
    }
    return best
}

const GRID_U = 16
const GRID_V = 12

/** Depth samples of the box room as an AR session's depth-sensing would give them. */
export const sampleRoom = (room, pose, projection) => {
    const samples = []
    for (let i = 0; i < GRID_U; i += 1) {
        for (let j = 0; j < GRID_V; j += 1) {
            const u = (i + 0.5) / GRID_U
            const v = (j + 0.5) / GRID_V
            const dirCam = normalize(unprojectView(projection, u, v, 1))
            const dirWorld = rotate(pose.orientation, dirCam)
            const t = boxRayDistance(room, pose.position, dirWorld)
            if (!Number.isFinite(t) || t > 8) continue
            // depth along -z, as getDepthInMeters reports it
            const depth = t * -dirCam[2]
            samples.push(toWorld(pose, unprojectView(projection, u, v, depth)))
        }
    }
    return samples
}

const pitchQuat = (pitch) => [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)]

/**
 * The synthetic walk: an 8 × 6 × 3.2 m room, one slow lap at 1.2 m from the walls
 * looking outwards, with three planted faults so the warnings have something to
 * say — a fast turn at 18–20 s, a step to 0.35 m from a wall at 34–37 s, a dark
 * stretch at 46–49 s. 10 ticks a second, 120 s (a lap at ~0.15 m/s — the pace the page asks for).
 */
export const syntheticWalk = ({ seconds = 120, hz = 10, room = { width: 8, depth: 6, height: 3.2 } } = {}) => {
    const projection = perspective(60 * DEG, 1920 / 1080)
    const ticks = []
    const inset = 1.2
    const hx = room.width / 2 - inset
    const hz2 = room.depth / 2 - inset
    const perimeter = 4 * hx + 4 * hz2
    const along = (s) => {
        // s in [0, perimeter): walk the inner rectangle, start middle of the south side
        let d = ((s % perimeter) + perimeter) % perimeter
        const legs = [
            [[0, hz2], [hx, hz2]], [[hx, hz2], [hx, -hz2]], [[hx, -hz2], [-hx, -hz2]],
            [[-hx, -hz2], [-hx, hz2]], [[-hx, hz2], [0, hz2]]
        ]
        for (const [a, b] of legs) {
            const len = Math.hypot(b[0] - a[0], b[1] - a[1])
            if (d <= len) return [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len]
            d -= len
        }
        return [0, hz2]
    }
    for (let k = 0; k <= seconds * hz; k += 1) {
        const t = k / hz
        const s = (t / seconds) * perimeter
        let [x, z] = along(s)
        // Looking outwards: from the room's middle to here, plus a slow sweep.
        let heading = Math.atan2(x, -z) + 0.2 * Math.sin(t * 0.3)
        if (t >= 18 && t < 20) heading += (t - 18) * (Math.PI / 2) // 90 °/s — too fast
        if (t >= 20) heading += Math.PI
        if (t >= 34 && t < 37) {
            // step out to 0.35 m from the nearest wall
            const f = Math.min(1, (t - 34) / 0.8)
            const wallX = Math.sign(x || 1) * (room.width / 2 - 0.35)
            x = x + (wallX - x) * f
            heading = Math.atan2(Math.sign(x || 1), 0)
        }
        const orientation = mulQuat(headingQuat(heading), pitchQuat(-8 * DEG + 6 * DEG * Math.sin(t * 0.4)))
        const pose = { position: [x, 1.5, z], orientation }
        const samples = sampleRoom(room, pose, projection)
        const centreDir = rotate(orientation, [0, 0, -1])
        ticks.push({
            time: Math.round(t * 1000),
            pose,
            projection,
            viewport: { width: 1920, height: 1080 },
            samples,
            centreDistance: boxRayDistance(room, pose.position, centreDir),
            luma: t >= 46 && t < 49 ? 0.1 : 0.45,
            sharpness: null
        })
    }
    return { kind: SESSION_KIND, version: 1, source: 'synthetic box room 8 × 6 × 3.2 m', room, ticks }
}

/**
 * Play ticks in real time (or `speed` × real time). `onTick(tick)` per tick;
 * returns { stop }. The clock is injectable for tests.
 */
export const playSession = (session, onTick, { speed = 1, schedule = (fn, ms) => setTimeout(fn, ms), cancel = clearTimeout, onEnd = null } = {}) => {
    const ticks = session?.ticks || []
    let index = 0
    let handle = null
    let stopped = false
    const step = () => {
        if (stopped) return
        if (index >= ticks.length) { onEnd?.(); return }
        const tick = ticks[index]
        onTick(tick)
        index += 1
        const next = ticks[index]
        if (next) handle = schedule(step, Math.max(0, (next.time - tick.time) / speed))
        else onEnd?.()
    }
    handle = schedule(step, 0)
    return { stop: () => { stopped = true; cancel(handle) } }
}

/** Keep ticks for a recording: every `everyMs`, samples rounded to a centimetre. */
export const createSessionRecorder = ({ everyMs = 500 } = {}) => {
    const ticks = []
    let last = -Infinity
    return {
        add(tick) {
            if (tick.time - last < everyMs) return
            last = tick.time
            const r = (v) => Math.round(v * 100) / 100
            ticks.push({ ...tick, samples: (tick.samples || []).map((p) => p.map(r)) })
        },
        session: (meta = {}) => ({ kind: SESSION_KIND, version: 1, ...meta, ticks })
    }
}
