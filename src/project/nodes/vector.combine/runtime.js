export const computeOutput = (node, portId, { input, asNumber }) => (
    portId === 'out'
        ? [asNumber(input('x'), 0), asNumber(input('y'), 0), asNumber(input('z'), 0)]
        : undefined
)
