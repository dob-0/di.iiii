// How much two directions agree: 1 when parallel, 0 when perpendicular,
// -1 when opposed (after Direction). Angle answers in degrees, 0 for a
// zero-length side — Compare on Angle is the "is it facing me?" trigger.
export const computeOutput = (node, portId, { input, asVec3 }) => {
    const a = asVec3(input('a'), [0, 0, 0])
    const b = asVec3(input('b'), [0, 0, 0])
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    if (portId === 'dot') return dot
    if (portId !== 'angle') return undefined
    const la = Math.hypot(a[0], a[1], a[2])
    const lb = Math.hypot(b[0], b[1], b[2])
    if (la === 0 || lb === 0) return 0
    const cos = Math.min(1, Math.max(-1, dot / (la * lb)))
    return (Math.acos(cos) * 180) / Math.PI
}
