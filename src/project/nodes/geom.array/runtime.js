import { isGeometryDescriptor, MAX_GEOMETRY_PIECES } from '../../graph/geometryDescriptor.js'

// Repeats what arrives: N copies, each wrapped in a transform group offset by
// i × Offset, so the copy keeps its own internal frames intact. Copies SHARE
// the source descriptor — the tree is walked pure, never mutated, so aliasing
// is free. Count clamps to the renderer's piece cap; the prune downstream
// still holds the real budget across the whole tree. Bare, it carries
// nothing (PASS_THROUGH_PORTS) — an empty array is not an invisible shape.
export const computeOutput = (node, portId, { input, asNumber, asVec3 }) => {
    if (portId !== 'out') return undefined
    const source = input('geometry')
    if (!isGeometryDescriptor(source)) return undefined
    const count = Math.max(1, Math.min(MAX_GEOMETRY_PIECES, Math.floor(asNumber(input('count'), 3))))
    const offset = asVec3(input('offset'), [1.5, 0, 0])
    const children = []
    for (let i = 0; i < count; i++) {
        children.push({
            kind: 'group',
            position: [offset[0] * i, offset[1] * i, offset[2] * i],
            children: [source]
        })
    }
    return { kind: 'group', children }
}
