// The little geometry the AR scan needs, in ONE place so the page, the tests and
// scripts/place/ read the same conventions.
//
// THE CONVENTION is WebXR's (W3C WebXR Device API §"Spaces"): right-handed,
// metres, +y up, and a camera looks down its own -z. A pose is
// { position: [x, y, z], orientation: [x, y, z, w] } — camera to world, the way
// XRRigidTransform reports it. Matrices are column-major Float32 order (the
// order XRView.projectionMatrix and XRRigidTransform.matrix use).

export const DEG = Math.PI / 180

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const length = (a) => Math.hypot(a[0], a[1], a[2])
export const normalize = (a) => {
    const n = length(a)
    return n > 1e-9 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]
}

/** Rotate v by the unit quaternion q = [x, y, z, w]. */
export const rotate = (q, v) => {
    const [qx, qy, qz, qw] = q
    // t = 2 * cross(q.xyz, v); v' = v + w t + cross(q.xyz, t)
    const tx = 2 * (qy * v[2] - qz * v[1])
    const ty = 2 * (qz * v[0] - qx * v[2])
    const tz = 2 * (qx * v[1] - qy * v[0])
    return [
        v[0] + qw * tx + (qy * tz - qz * ty),
        v[1] + qw * ty + (qz * tx - qx * tz),
        v[2] + qw * tz + (qx * ty - qy * tx)
    ]
}

/** Quaternion [x, y, z, w] to a row-major 3x3 rotation, as rows. */
export const quatToRows = (q) => {
    const [x, y, z, w] = q
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
    ]
}

/** Row-major 3x3 rotation to a unit quaternion [x, y, z, w] (Shepperd's method). */
export const rowsToQuat = (m) => {
    const trace = m[0][0] + m[1][1] + m[2][2]
    let x, y, z, w
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2
        w = 0.25 * s
        x = (m[2][1] - m[1][2]) / s
        y = (m[0][2] - m[2][0]) / s
        z = (m[1][0] - m[0][1]) / s
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
        const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2
        w = (m[2][1] - m[1][2]) / s
        x = 0.25 * s
        y = (m[0][1] + m[1][0]) / s
        z = (m[0][2] + m[2][0]) / s
    } else if (m[1][1] > m[2][2]) {
        const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2
        w = (m[0][2] - m[2][0]) / s
        x = (m[0][1] + m[1][0]) / s
        y = 0.25 * s
        z = (m[1][2] + m[2][1]) / s
    } else {
        const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2
        w = (m[1][0] - m[0][1]) / s
        x = (m[0][2] + m[2][0]) / s
        y = (m[1][2] + m[2][1]) / s
        z = 0.25 * s
    }
    const n = Math.hypot(x, y, z, w) || 1
    return [x / n, y / n, z / n, w / n]
}

/** A yaw (about +y, radians, counter-clockwise seen from above) as a quaternion. */
export const yawQuat = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]

/** Quaternion product a * b. */
export const mulQuat = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
]

/** The direction a camera looks, in the world. */
export const forwardOf = (orientation) => rotate(orientation, [0, 0, -1])

/**
 * Heading on the floor, radians: 0 = towards -z, positive = turning right
 * (clockwise seen from above). Undefined (0) for a vector straight up/down.
 */
export const headingOf = (v) => Math.atan2(v[0], -v[2])

/** The orientation of a level camera turned to a heading (headingOf's inverse). */
export const headingQuat = (heading) => yawQuat(-heading)

/** Wrap an angle to (-PI, PI]. */
export const wrap = (a) => {
    let x = a % (2 * Math.PI)
    if (x <= -Math.PI) x += 2 * Math.PI
    if (x > Math.PI) x -= 2 * Math.PI
    return x
}

/** Angle in radians between two unit quaternions. */
export const quatAngle = (a, b) => {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
    return 2 * Math.acos(Math.min(1, d))
}

/** A symmetric perspective projection, column-major, like XRView.projectionMatrix. */
export const perspective = (fovYRadians, aspect, near = 0.05, far = 100, skewX = 0, skewY = 0) => {
    const f = 1 / Math.tan(fovYRadians / 2)
    const m = new Array(16).fill(0)
    m[0] = f / aspect
    m[5] = f
    m[8] = skewX
    m[9] = skewY
    m[10] = (far + near) / (near - far)
    m[11] = -1
    m[14] = (2 * far * near) / (near - far)
    return m
}

/**
 * A point in normalised view coordinates (u right, v DOWN, both 0..1, the
 * coordinates XRCPUDepthInformation.getDepthInMeters takes) at a depth in metres
 * along the view's -z, unprojected into the camera's own space.
 */
export const unprojectView = (projection, u, v, depthMetres) => {
    const xNdc = 2 * u - 1
    const yNdc = 1 - 2 * v
    // For a point at z = -d: xNdc = (P0 x + P8 z) / d  →  x = (xNdc d + P8 d) / P0
    const d = depthMetres
    const x = (xNdc * d + projection[8] * d) / projection[0]
    const y = (yNdc * d + projection[9] * d) / projection[5]
    return [x, y, -d]
}

/** Camera space to world space by a pose. */
export const toWorld = (pose, p) => add(rotate(pose.orientation, p), pose.position)

/** Round to a number of decimals, for files people and diffs read. */
export const round = (x, places = 4) => {
    const k = 10 ** places
    return Math.round(x * k) / k
}
