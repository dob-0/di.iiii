// Two booleans, four verdicts, in plain words: Both (and), Either (or),
// One (exactly one — xor), Neither (nor). Wire the question you mean.
export const computeOutput = (node, portId, { input }) => {
    const a = Boolean(input('a'))
    const b = Boolean(input('b'))
    if (portId === 'both') return a && b
    if (portId === 'either') return a || b
    if (portId === 'one') return a !== b
    if (portId === 'neither') return !a && !b
    return undefined
}
