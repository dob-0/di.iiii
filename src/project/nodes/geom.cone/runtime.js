export const computeOutput = (node, portId, { input, asNumber, asVec3 }) => {
    if (portId !== 'geometry') return undefined
    return {
        kind: 'cone',
        radius: asNumber(input('radius'), 0.5),
        height: asNumber(input('height'), 1.5),
        color: input('color'),
        position: asVec3(input('position'), [0, 0.75, 0]),
        rotation: asVec3(input('rotation'), [0, 0, 0])
    }
}
