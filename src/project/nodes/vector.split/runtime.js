// A vector opened into its three numbers — the wire every tool has and this
// desk was missing: drive just the height, read just the sideways.
export const computeOutput = (node, portId, { input, asVec3 }) => {
    const [x, y, z] = asVec3(input('vector'), [0, 0, 0])
    if (portId === 'x') return x
    if (portId === 'y') return y
    if (portId === 'z') return z
    return undefined
}
