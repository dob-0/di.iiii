// Modulo by zero answers 0 — same reasoning as Divide's zero guard.
export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'out') return undefined
    const value = asNumber(input('a'))
    const divisor = asNumber(input('b'), 1)
    return divisor === 0 ? 0 : value % divisor
}
