export const computeOutput = (node, portId, { input, asNumber }) => (
    portId === 'out' ? Math.pow(asNumber(input('a')), asNumber(input('b'), 1)) : undefined
)
