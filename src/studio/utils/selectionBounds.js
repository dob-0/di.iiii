// The box drawn round a selected entity in the Studio: the thing itself, never its light.
//
// Owner 2026-10-13 01:33 (screenshot): a selected B380F wore a yellow box from the floor to the roof.
// Cause: THREE.BoxHelper.setFromObject takes the whole subtree, and a spot light's subtree holds its
// beam cone, as long as the throw. Here the beam meshes opt out with `userData.noBounds` (the same
// idea as `userData.noPick` for picking, autoDepth.js), helpers are skipped as they are there, and
// the box is the union of what is left: the lamp head, a cube, a mesh.
import { Box3 } from 'three'

const scratch = new Box3()

const isHelper = (object) => {
    const type = object.type || ''
    return type.endsWith('Helper') || type.startsWith('TransformControls')
}

/**
 * The world-space bounds of `object` without its beams and helpers. Pure apart from
 * `object.updateWorldMatrix`. Returns `target` (empty when nothing has a geometry).
 * @param {import('three').Object3D} object
 * @param {Box3} [target]
 */
export function bodyBounds(object, target = new Box3()) {
    target.makeEmpty()
    if (!object) return target
    object.updateWorldMatrix(true, true)
    const visit = (node) => {
        if (node.userData?.noBounds || isHelper(node)) return
        const geometry = node.geometry
        if (geometry) {
            if (!geometry.boundingBox) geometry.computeBoundingBox()
            if (geometry.boundingBox && !geometry.boundingBox.isEmpty()) {
                scratch.copy(geometry.boundingBox).applyMatrix4(node.matrixWorld)
                target.union(scratch)
            }
        }
        for (const child of node.children) visit(child)
    }
    visit(object)
    return target
}
