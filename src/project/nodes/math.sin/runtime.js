export const computeOutput = (node, portId, { input, asNumber }) => (
    portId === 'out' ? Math.sin(asNumber(input('in'))) : undefined
)
