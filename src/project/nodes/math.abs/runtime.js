export const computeOutput = (node, portId, { input, asNumber }) => (
    portId === 'out' ? Math.abs(asNumber(input('in'))) : undefined
)
