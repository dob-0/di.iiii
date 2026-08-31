export const computeOutput = (node, portId, { input, asNumber }) => (
    portId === 'out' ? asNumber(input('a')) - asNumber(input('b')) : undefined
)
