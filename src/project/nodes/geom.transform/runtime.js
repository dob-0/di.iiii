import { isGeometryDescriptor } from '../../graph/geometryDescriptor.js'

// Re-frames what arrives: one transform group around the incoming shape,
// internal frames intact — Array's sibling for a single copy. Bare it
// carries nothing (PASS_THROUGH_PORTS): an empty transform is not a shape.
export const computeOutput = (node, portId, { input, asVec3 }) => {
    if (portId !== 'out') return undefined
    const source = input('geometry')
    if (!isGeometryDescriptor(source)) return undefined
    return {
        kind: 'group',
        position: asVec3(input('position'), [0, 0, 0]),
        rotation: asVec3(input('rotation'), [0, 0, 0]),
        scale: asVec3(input('scale'), [1, 1, 1]),
        children: [source]
    }
}
