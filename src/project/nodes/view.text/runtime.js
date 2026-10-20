// What the note says, as a wire value. Read through the input, not off
// node.values, so a Text fed by another string passes on what it shows —
// the same rule the cube's descriptor follows (nodeGraphRuntime.js).
export const computeOutput = (node, portId, { input }) => {
    if (portId !== 'text') return undefined
    const value = input('content')
    return value == null ? '' : String(value)
}
