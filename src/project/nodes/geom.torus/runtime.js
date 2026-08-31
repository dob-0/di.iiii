export const computeOutput = (node, portId, { input, asNumber, asVec3 }) => {
    if (portId !== 'geometry') return undefined
    return {
        kind: 'torus',
        radius: asNumber(input('radius'), 0.5),
        tube: asNumber(input('tube'), 0.18),
        color: input('color'),
        position: asVec3(input('position'), [0, 0.5, 0]),
        rotation: asVec3(input('rotation'), [0, 0, 0])
    }
}
