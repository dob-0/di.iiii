// Pick chooses which of two inputs speaks: off is A, on is B. Values pass
// through untouched (any type), so a Switch can choose between colours or
// vectors as readily as numbers.
export const computeOutput = (node, portId, { input }) => {
    if (portId !== 'out') return undefined
    return input('pick') ? input('b') : input('a')
}
