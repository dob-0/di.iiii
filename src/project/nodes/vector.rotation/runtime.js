// Spin a vector around an axis by an angle in degrees (Rodrigues).
// Axis direction is what matters, not its length; a zero axis spins
// nothing. Feed Time into Angle and a point orbits.
export const computeOutput = (node, portId, { input, asVec3, asNumber }) => {
    if (portId !== 'out') return undefined
    const v = asVec3(input('vector'), [0, 0, 0])
    const axis = asVec3(input('axis'), [0, 1, 0])
    const len = Math.hypot(axis[0], axis[1], axis[2])
    if (len === 0) return v
    const [kx, ky, kz] = [axis[0] / len, axis[1] / len, axis[2] / len]
    const angle = (asNumber(input('angle'), 0) * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const cross = [
        ky * v[2] - kz * v[1],
        kz * v[0] - kx * v[2],
        kx * v[1] - ky * v[0],
    ]
    const dot = kx * v[0] + ky * v[1] + kz * v[2]
    return [
        v[0] * cos + cross[0] * sin + kx * dot * (1 - cos),
        v[1] * cos + cross[1] * sin + ky * dot * (1 - cos),
        v[2] * cos + cross[2] * sin + kz * dot * (1 - cos),
    ]
}
