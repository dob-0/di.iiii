export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'out') return undefined
    const value = asNumber(input('in'))
    const min = asNumber(input('min'))
    const max = asNumber(input('max'), 1)
    return Math.min(max, Math.max(min, value))
}
