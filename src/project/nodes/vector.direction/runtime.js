// The pure direction of a vector, length 1 — pair with Dot for facing
// tests, or scale it with Multiply to travel a fixed distance that way.
// A zero vector has no direction; it stays zero rather than inventing one.
export const computeOutput = (node, portId, { input, asVec3 }) => {
    if (portId !== 'out') return undefined
    const v = asVec3(input('vector'), [0, 0, 0])
    const len = Math.hypot(v[0], v[1], v[2])
    if (len === 0) return [0, 0, 0]
    return [v[0] / len, v[1] / len, v[2] / len]
}
