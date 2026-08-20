export const computeOutput = (node, portId, { input, asNumber }) => {
    const a = asNumber(input('a'))
    const b = asNumber(input('b'))
    if (portId === 'least') return Math.min(a, b)
    if (portId === 'greatest') return Math.max(a, b)
    return undefined
}
