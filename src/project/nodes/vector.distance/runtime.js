// How far apart two points stand, and how long A itself is — the proximity
// trigger's other half (Distance into Compare into anything).
export const computeOutput = (node, portId, { input, asVec3 }) => {
    const a = asVec3(input('a'), [0, 0, 0])
    if (portId === 'length') return Math.hypot(a[0], a[1], a[2])
    if (portId !== 'distance') return undefined
    const b = asVec3(input('b'), [0, 0, 0])
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}
