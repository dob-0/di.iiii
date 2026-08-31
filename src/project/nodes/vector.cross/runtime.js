// The direction perpendicular to both A and B — the surface normal when A
// and B are two edges of it. Right-handed, like everything in the scene.
export const computeOutput = (node, portId, { input, asVec3 }) => {
    if (portId !== 'out') return undefined
    const a = asVec3(input('a'), [0, 0, 0])
    const b = asVec3(input('b'), [0, 0, 0])
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
