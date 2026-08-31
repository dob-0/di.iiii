// Division by zero answers 0, not Infinity — a live denominator crossing zero
// must not blast NaN/Infinity through every downstream node mid-show.
export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'out') return undefined
    const numerator = asNumber(input('a'))
    const denominator = asNumber(input('b'), 1)
    return denominator === 0 ? 0 : numerator / denominator
}
