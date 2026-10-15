import * as THREE from 'three'

/**
 * Auto fly — an FPV-drone flight through a room, one button (pure: no scene, no DOM).
 *
 * Method (cited, nothing invented): the route is a closed centripetal Catmull-Rom spline through waypoints
 * (Barry & Goldman 1988; centripetal parametrisation, Yuksel et al. 2011, "Parameterization and applications
 * of Catmull-Rom curves" — no cusps, no self-intersection). It is C1 in position, not C2: the speed profile and
 * the roll are low-passed along the arc so the camera's velocity AND bank change without a jump. The bank is the
 * coordinated-turn relation of a quad (roll = atan(lateral acceleration / g)), capped at 25°. Speed is limited by
 * the curvature (v ≤ sqrt(aLat / κ)) and by an acceleration limit, forward and backward over the loop.
 *
 * The frame is smartViewGeometry.computeRoomFrame's: { bounds, floorY, roofCut, center }. Every sample of the
 * path lies inside it by `margin` (walls, roof cut) and above floor + `minHeight` — checked by checkFlight().
 */

const G = 9.81

export const FLIGHT_DEFAULTS = Object.freeze({
    margin: 0.8,          // m from walls and the roof cut
    minHeight: 1.2,       // m above the floor
    eyeHeight: 1.7,       // m, the entrance
    floorPass: 2.0,       // m, the low fast pass over the dance floor (1.5–2.5)
    maxSpeed: 6,          // m/s
    minSpeed: 1.6,        // m/s, at points of interest
    maxAccel: 5,          // m/s² along the path
    maxBankDeg: 25,       // °
    lookAhead: 0.9,       // s of travel the camera looks ahead
    poiRadius: 5,         // m over which the speed relaxes toward a point of interest
    spacing: 0.25         // m between samples
})

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const vec = (p) => new THREE.Vector3(p[0], p[1], p[2])

/** The envelope the eye may be in: the frame shrunk by the margin; never inverted on a tiny room. */
export const flightEnvelope = (frame, opts = {}) => {
    const { margin, minHeight } = { ...FLIGHT_DEFAULTS, ...opts }
    const { min, max } = frame.bounds
    const floorY = Number.isFinite(frame.floorY) ? frame.floorY : min[1]
    const top = Math.min(max[1], Number.isFinite(frame.roofCut) ? frame.roofCut : max[1])
    const span = (lo, hi, m) => {
        const a = lo + m
        const b = hi - m
        return a <= b ? [a, b] : [(lo + hi) / 2, (lo + hi) / 2]
    }
    const [x0, x1] = span(min[0], max[0], margin)
    const [z0, z1] = span(min[2], max[2], margin)
    const [y0, y1] = span(floorY + minHeight, top - margin, 0)
    return { min: [x0, y0, z0], max: [x1, y1, z1], floorY }
}

const fit = (env, p, inner = 0) => [0, 1, 2].map((i) => {
    const room = Math.max(0, (env.max[i] - env.min[i]) / 2)
    const k = Math.min(inner, room * 0.5)
    return clamp(p[i], env.min[i] + k, env.max[i] - k)
})

/**
 * Points of interest from what the scene has; any may be missing (the frame alone is enough).
 * @param {object} frame computeRoomFrame's result
 * @param {object} found { stageBox, rigBox, entrance } — boxes are {min,max}; entrance is [x,y,z]
 */
export const flightPois = (frame, { stageBox = null, rigBox = null, entrance = null, outline = null } = {}) => {
    const { min, max } = frame.bounds
    const c = frame.center
    const longX = (max[0] - min[0]) >= (max[2] - min[2])
    const mid = (box) => box.min.map((v, i) => (v + box.max[i]) / 2)
    const dj = stageBox ? [...mid(stageBox)] : [c[0] + (longX ? (max[0] - min[0]) * 0.3 : 0), frame.floorY + 1, c[2] + (longX ? 0 : (max[2] - min[2]) * 0.3)]
    if (stageBox) dj[1] = stageBox.max[1]
    const truss = rigBox ? mid(rigBox) : [c[0], Math.min(frame.roofCut ?? max[1], max[1]) - 1.5, c[2]]
    const trussLow = rigBox ? rigBox.min[1] : truss[1]
    // the dance floor: the middle of the room between the entrance end and the DJ
    const ent = entrance ? [...entrance] : [longX ? min[0] : c[0], frame.floorY + FLIGHT_DEFAULTS.eyeHeight, longX ? c[2] : min[2]]
    const floor = [(ent[0] + dj[0]) / 2, frame.floorY, (ent[2] + dj[2]) / 2]
    return { entrance: ent, dj, truss, trussLow, floor, outline }
}

/** The waypoints, in flying order, before the spline: entrance → rise → floor pass → DJ turn → climb → dive. */
const waypoints = (frame, pois, opts, env) => {
    const o = { ...FLIGHT_DEFAULTS, ...opts }
    // A small room (short side under 10 m) has no room for the full route: one slow oval round the middle, rising and falling.
    if (Math.min(env.max[0] - env.min[0], env.max[2] - env.min[2]) < 10) {
        const cx = (env.min[0] + env.max[0]) / 2; const cz = (env.min[2] + env.max[2]) / 2
        const rx = (env.max[0] - env.min[0]) / 2 * 0.8; const rz = (env.max[2] - env.min[2]) / 2 * 0.8
        const lo = env.min[1]; const hi = Math.min(env.max[1], lo + 2.5)
        return Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2
            return [cx + rx * Math.cos(a), lo + (hi - lo) * (0.5 + 0.5 * Math.sin(a * 2)), cz + rz * Math.sin(a)]
        })
    }
    const e = vec(pois.entrance)
    const dj = vec(pois.dj)
    const fl = vec(pois.floor)
    const tr = vec(pois.truss)
    const floorY = env.floorY
    const spanX = env.max[0] - env.min[0]
    const spanZ = env.max[2] - env.min[2]
    // the turn round the DJ must fit in the room: no more than the DJ's room to the nearest wall, else it would be squashed
    const wall = Math.min(dj.x - env.min[0], env.max[0] - dj.x, dj.z - env.min[2], env.max[2] - dj.z)
    const radius = clamp(Math.min(0.3 * Math.min(spanX, spanZ), wall - 0.5), Math.min(2.2, 0.25 * Math.min(spanX, spanZ)), 7)
    const lerp = (a, b, k) => a.clone().lerp(b, k)
    const along = lerp(e, dj, 1).sub(e)
    const dir = along.lengthSq() > 1e-6 ? along.clone().setY(0).normalize() : new THREE.Vector3(1, 0, 0)
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    e.addScaledVector(dir, radius * 1.1)   // the door is a wall: the U-turn back in needs room, so the lap starts a little inside
    const djY = Math.max(floorY + o.floorPass, Math.min(dj.y + 1.6, env.max[1]))
    // under the truss, never in it: the rig's lowest point less half a metre
    const trussY = clamp((pois.trussLow ?? tr.y) - 0.6, floorY + 3, env.max[1])
    const at = (v, y) => [v.x, y, v.z]
    const orbit = (deg) => {
        const a = (deg * Math.PI) / 180
        return [dj.x + (dir.x * Math.cos(a) + side.x * Math.sin(a)) * -radius, djY, dj.z + (dir.z * Math.cos(a) + side.z * Math.sin(a)) * -radius]
    }
    const pts = [
        [e.x + side.x * radius * 1.3 + dir.x * radius * 0.5, floorY + 3.2, e.z + side.z * radius * 1.3 + dir.z * radius * 0.5], // the U-turn back in:
        [e.x + side.x * radius * 0.5, Math.max(e.y, floorY + o.eyeHeight) + 0.6, e.z + side.z * radius * 0.5],   // a wide arc, not a corner
        [e.x - side.x * radius * 0.4 + dir.x * radius * 0.5, Math.max(e.y, floorY + o.eyeHeight), e.z - side.z * radius * 0.4 + dir.z * radius * 0.5], // entrance, eye height
        at(lerp(e, fl, 0.45), floorY + 3.2),                                       // the slow rise
        at(lerp(e, fl, 0.8).addScaledVector(side, -radius * 0.7), floorY + o.floorPass),   // down onto the floor
        at(lerp(fl, dj, 0.55).addScaledVector(side, radius * 0.6), floorY + o.floorPass),  // the low fast pass
        orbit(0), orbit(70), orbit(140), orbit(210),                              // the banked turn round the DJ
        at(lerp(dj, tr, 0.6).addScaledVector(side, -radius * 0.5), (djY + trussY) / 2), // up
        at(tr.clone().addScaledVector(dir, radius * 0.5), trussY),                // under the truss, through the beams
        at(tr.clone().addScaledVector(dir, -radius * 0.5).addScaledVector(side, radius * 0.4), trussY),
        at(lerp(tr, e, 0.6).addScaledVector(side, radius * 1.0), floorY + 4)     // the dive back
    ]
    return pts
}

const buildSamples = (curve, opts) => {
    const length = curve.getLength()
    const n = clamp(Math.ceil(length / opts.spacing), 240, 6000)
    const pts = curve.getSpacedPoints(n)   // n + 1 points, the last repeats the first (closed)
    pts.pop()
    return { pts, ds: length / n, length }
}

const smoothRing = (a, passes) => {
    const n = a.length
    let cur = a
    for (let k = 0; k < passes; k += 1) {
        const next = new Array(n)
        for (let i = 0; i < n; i += 1) next[i] = (cur[(i + n - 1) % n] + 2 * cur[i] + cur[(i + 1) % n]) / 4
        cur = next
    }
    return cur
}

/**
 * The closed flight. Returns { pts, speed, roll, time, duration, length, env, opts } — arrays per sample, `time[i]` the
 * seconds at sample i from the start; duration is the lap. Pure and deterministic.
 */
export const flightPath = (frame, pois = null, opts = {}) => {
    if (!frame?.bounds) return null
    const o = { ...FLIGHT_DEFAULTS, ...opts }
    const env = flightEnvelope(frame, o)
    const p = pois || flightPois(frame)
    // waypoints sit a little inside the envelope so the spline's overshoot stays inside it too
    const inner = Math.min(1.2, Math.min(env.max[0] - env.min[0], env.max[2] - env.min[2]) * 0.1)
    const ctl = waypoints(frame, p, o, env).map((q) => fit(env, q, inner))
    const curve = new THREE.CatmullRomCurve3(ctl.map(vec), true, 'centripetal')
    const { pts, ds, length } = buildSamples(curve, o)
    const n = pts.length
    // the guarantee: every sample inside the envelope (clamps only what the spline overshot)
    for (const q of pts) { q.x = clamp(q.x, env.min[0], env.max[0]); q.y = clamp(q.y, env.min[1], env.max[1]); q.z = clamp(q.z, env.min[2], env.max[2]) }

    // tangent, signed horizontal curvature and total curvature per sample (central differences on the closed ring)
    const kappa = new Array(n)
    const kSigned = new Array(n)
    for (let i = 0; i < n; i += 1) {
        const a = pts[(i + n - 2) % n]; const b = pts[i]; const c = pts[(i + 2) % n]
        const t1 = b.clone().sub(a).normalize(); const t2 = c.clone().sub(b).normalize()
        const dTheta = Math.acos(clamp(t1.dot(t2), -1, 1))
        kappa[i] = dTheta / (2 * ds)
        kSigned[i] = Math.sign(t1.x * t2.z - t1.z * t2.x) * kappa[i]
    }
    const kS = smoothRing(kappa, 6)
    const kSS = smoothRing(kSigned, 6)

    // speed profile: fast on straights, slow at points of interest, limited by curvature, then by acceleration
    const aLat = Math.tan((o.maxBankDeg * Math.PI) / 180) * G
    const poiPoints = [p.dj, p.truss, p.entrance].map(vec)
    let v = pts.map((q, i) => {
        const near = Math.min(...poiPoints.map((r) => Math.hypot(q.x - r.x, q.z - r.z)))
        const slow = o.minSpeed + (o.maxSpeed - o.minSpeed) * clamp((near - 1.5) / o.poiRadius, 0, 1)
        const turn = Math.sqrt(aLat / Math.max(kS[i], 1e-4))
        return clamp(Math.min(slow, turn), o.minSpeed, o.maxSpeed)
    })
    // the low pass over the floor is the fast part: no slowing there unless a turn asks for it
    for (let pass = 0; pass < 3; pass += 1) {    // accel limit, forward then backward, round the ring (3 laps converge)
        for (let i = 0; i < 2 * n; i += 1) { const a = i % n; const b = (i + 1) % n; v[b] = Math.min(v[b], Math.sqrt(v[a] * v[a] + 2 * o.maxAccel * ds)) }
        for (let i = 2 * n; i > 0; i -= 1) { const a = i % n; const b = (i + n - 1) % n; v[b] = Math.min(v[b], Math.sqrt(v[a] * v[a] + 2 * o.maxAccel * ds)) }
    }
    v = smoothRing(v, 4).map((s) => clamp(s, o.minSpeed * 0.95, o.maxSpeed))
    const time = new Array(n)
    let t = 0
    for (let i = 0; i < n; i += 1) { time[i] = t; t += ds / ((v[i] + v[(i + 1) % n]) / 2) }
    // bank from lateral acceleration, as a quad does; low-passed so it rolls in and out
    const roll = smoothRing(kSS.map((k, i) => Math.atan((v[i] * v[i] * k) / G)), 8)
        .map((r) => clamp(r, -(o.maxBankDeg * Math.PI) / 180, (o.maxBankDeg * Math.PI) / 180))
    return { pts, speed: v, roll, time, duration: t, length, ds, env, opts: o, kappa: kS, pois: p }
}

/** Where the camera is at `t` seconds (the loop repeats): { eye, at, roll, speed } — `at` is the look-ahead on the path. */
export const sampleFlight = (path, t) => {
    const { pts, time, duration, speed, roll } = path
    const n = pts.length
    const tt = ((t % duration) + duration) % duration
    const find = (x) => { let lo = 0; let hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (time[m] <= x) lo = m; else hi = m - 1 } return lo }
    const i = find(tt)
    const j = (i + 1) % n
    const t1 = j === 0 ? duration : time[j]
    const k = clamp((tt - time[i]) / Math.max(1e-9, t1 - time[i]), 0, 1)
    const eye = pts[i].clone().lerp(pts[j], k)
    const ahead = (tt + path.opts.lookAhead) % duration
    const ia = find(ahead)
    const ja = (ia + 1) % n
    const ta1 = ja === 0 ? duration : time[ja]
    const ka = clamp((ahead - time[ia]) / Math.max(1e-9, ta1 - time[ia]), 0, 1)
    const at = pts[ia].clone().lerp(pts[ja], ka)
    return { eye: eye.toArray(), at: at.toArray(), roll: roll[i] + (roll[j] - roll[i]) * k, speed: speed[i] + (speed[j] - speed[i]) * k }
}

/** The physics check: how many samples are outside the frame and the closest approach to floor, roof and walls. */
export const checkFlight = (path, frame) => {
    const { min, max } = frame.bounds
    const roof = Math.min(max[1], Number.isFinite(frame.roofCut) ? frame.roofCut : max[1])
    const floorY = Number.isFinite(frame.floorY) ? frame.floorY : min[1]
    let outside = 0
    let floorMin = Infinity; let roofMin = Infinity; let wallMin = Infinity
    for (const q of path.pts) {
        if (q.x < min[0] || q.x > max[0] || q.z < min[2] || q.z > max[2] || q.y < floorY || q.y > roof) outside += 1
        floorMin = Math.min(floorMin, q.y - floorY)
        roofMin = Math.min(roofMin, roof - q.y)
        wallMin = Math.min(wallMin, q.x - min[0], max[0] - q.x, q.z - min[2], max[2] - q.z)
    }
    const speedMax = Math.max(...path.speed)
    return {
        samples: path.pts.length, outside, floorMin, roofMin, wallMin,
        speedMin: Math.min(...path.speed), speedMax,
        rollMaxDeg: (Math.max(...path.roll.map(Math.abs)) * 180) / Math.PI,
        curvatureMax: Math.max(...path.kappa), length: path.length, duration: path.duration
    }
}

