// The rotation that turns a thing at From to face To — wire it straight
// into any shape's Rotation. "Face" means the flat +Z side, the way a
// monitor faces you. Same maths as three's lookAt (XYZ euler, radians),
// kept dependency-free here and proven against three in the tests.
export const computeOutput = (node, portId, { input, asVec3 }) => {
    if (portId !== 'out') return undefined
    const from = asVec3(input('from'), [0, 0, 0])
    const to = asVec3(input('to'), [0, 0, 0])
    let z = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    let len = Math.hypot(z[0], z[1], z[2])
    if (len === 0) return [0, 0, 0]
    z = [z[0] / len, z[1] / len, z[2] / len]
    // straight up or down: nudge like three does, so a basis still exists
    if (Math.abs(z[0]) < 1e-10 && Math.abs(z[2]) < 1e-10) {
        z[2] = 1e-4
        len = Math.hypot(z[0], z[1], z[2])
        z = [z[0] / len, z[1] / len, z[2] / len]
    }
    let x = [z[2], 0, -z[0]] // cross(up, z) with up = [0,1,0]
    const lx = Math.hypot(x[0], x[1], x[2])
    x = [x[0] / lx, x[1] / lx, x[2] / lx]
    const y = [
        z[1] * x[2] - z[2] * x[1],
        z[2] * x[0] - z[0] * x[2],
        z[0] * x[1] - z[1] * x[0],
    ]
    // euler XYZ from the column-basis matrix, as three's setFromRotationMatrix
    const m13 = Math.min(1, Math.max(-1, z[0]))
    const ry = Math.asin(m13)
    if (Math.abs(m13) < 0.9999999) {
        return [Math.atan2(-z[1], z[2]), ry, Math.atan2(-y[0], x[0])]
    }
    return [Math.atan2(y[2], y[1]), ry, 0]
}
