// Two live numbers are never bit-identical — a Time-driven value crossing a
// threshold would flicker Equal forever at exact comparison. The tolerance
// makes Equal mean "as good as equal" at any stage-plausible magnitude.
const EQUAL_TOLERANCE = 1e-9

export const computeOutput = (node, portId, { input, asNumber }) => {
    const a = asNumber(input('a'), 0)
    const b = asNumber(input('b'), 0)
    if (portId === 'less') return a < b - EQUAL_TOLERANCE
    if (portId === 'equal') return Math.abs(a - b) <= EQUAL_TOLERANCE
    if (portId === 'greater') return a > b + EQUAL_TOLERANCE
    return undefined
}
