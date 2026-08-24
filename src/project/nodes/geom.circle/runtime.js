// The disc's shape as a VALUE — cube convention: read through input(),
// never off node.values, so a wired colour colours the descriptor.
export const computeOutput = (node, portId, { input, asNumber, asVec3 }) => {
    if (portId !== 'geometry') return undefined
    return {
        kind: 'circle',
        radius: asNumber(input('radius'), 0.5),
        color: input('color'),
        position: asVec3(input('position'), [0, 0.5, 0]),
        rotation: asVec3(input('rotation'), [0, 0, 0])
    }
}
