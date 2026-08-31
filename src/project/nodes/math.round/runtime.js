export const computeOutput = (node, portId, { input, asNumber }) => {
    const value = asNumber(input('in'))
    if (portId === 'round') return Math.round(value)
    if (portId === 'floor') return Math.floor(value)
    if (portId === 'ceiling') return Math.ceil(value)
    return undefined
}
