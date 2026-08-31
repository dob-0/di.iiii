// A stroke between two points — the shape as a VALUE, cube convention:
// read through input() so wired ends move the line. From/To place it;
// there is no position/rotation, the endpoints ARE the placement.
export const computeOutput = (node, portId, { input, asNumber, asVec3 }) => {
    if (portId !== 'geometry') return undefined
    return {
        kind: 'line',
        from: asVec3(input('from'), [0, 0, 0]),
        to: asVec3(input('to'), [0, 1.5, 0]),
        thickness: asNumber(input('thickness'), 0.02),
        color: input('color')
    }
}
