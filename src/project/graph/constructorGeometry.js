// What a Constructor wears: the geometry its own Out doors carry.
//
// The doorway mechanism already answers a container's promoted sockets from
// the wires inside it (computeNodeOutput's pre-switch door lookup) — this
// only asks every door and keeps the answers that are really shapes. No
// portType requirement: a door typed `any` carrying a box IS carrying
// geometry, and demanding the person also label it correctly would punish
// them for something the value already proves.
import { DOORWAY_OUT_TYPE_ID, getNodeType } from '../nodeRegistry.js'
import { evaluateNodeOutput } from './nodeGraphRuntime.js'
import { isGeometryDescriptor, mergeGeometry } from './geometryDescriptor.js'

/**
 * @param {object} node       the constructor node
 * @param {object[]} allNodes EVERY node in the document — the doors live in a
 *                            different scope from the constructor's own card,
 *                            the same trap getNodeInputs documents.
 * @param {object} context    the running graph context, reused not rebuilt
 * @returns a descriptor, or null when no door carries a shape
 */
export function wearConstructorGeometry(node, allNodes, context) {
    if (!node?.id || !Array.isArray(allNodes)) return null
    const doors = allNodes.filter(
        (other) => other?.typeId === DOORWAY_OUT_TYPE_ID && other.parentId === node.id
    )
    if (doors.length) {
        const worn = mergeGeometry(doors.map((door) => {
            const value = evaluateNodeOutput(node, door.id, context)
            return isGeometryDescriptor(value) ? value : undefined
        }))
        return worn || null
    }
    // NO doors: wear the spatial children directly — TouchDesigner's flag
    // model, where everything inside contributes unless switched off, and
    // wires only carry data. Demanding Merge-and-door plumbing before a
    // single shape showed was the audit's most-measured wall: sixteen blind
    // actions for a two-part build. Doors still win when present, because a
    // door is the person saying "exactly this, nothing else".
    const worn = mergeGeometry(allNodes
        .filter((other) => other?.parentId === node.id
            && getNodeType(other.typeId)?.render === 'spatial-3d')
        .map((child) => {
            const value = evaluateNodeOutput(child, 'geometry', context)
            return isGeometryDescriptor(value) ? value : undefined
        }))
    return worn || null
}
