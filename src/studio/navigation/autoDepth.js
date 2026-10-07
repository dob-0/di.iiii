// Auto Depth for the Studio viewport: find the surface under the pointer so a
// navigation gesture can pivot on it (Blender manual, Preferences > Navigation:
// "Auto – Depth: Use the depth under the mouse to improve view pan, rotate,
// zoom functionality"). camera-controls reads no depth buffer, so this raycasts
// the scene's meshes once at the start of a gesture. Pure: no React, no DOM.
import { Box3, Raycaster, Vector2, Vector3 } from 'three'

export const DEFAULT_MAX_MESHES = 5000

// Things in the scene that are tools, not content: the grid, gizmos, helpers.
// drei's TransformControls builds a TransformControlsGizmo/Plane; three's helpers
// are typed '*Helper'; anything can opt out with userData.noPick.
export function isNavigationHelper(object) {
    if (!object) return false
    if (object.userData?.noPick) return true
    const type = object.type || ''
    if (type.startsWith('TransformControls') || type.endsWith('Helper')) return true
    if (object.isTransformControls || object.isTransformControlsGizmo || object.isTransformControlsPlane) return true
    return false
}

function collectMeshes(roots, maxMeshes, out) {
    const stack = [...roots].reverse()
    while (stack.length && out.length < maxMeshes) {
        const object = stack.pop()
        if (!object || !object.visible || isNavigationHelper(object)) continue
        if (object.isMesh) out.push(object)
        const children = object.children || []
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i])
    }
    return out
}

const sharedRaycaster = new Raycaster()
const sharedNdc = new Vector2()

// Nearest visible, non-helper mesh hit under ndc ([-1..1, -1..1]), as a
// Vector3, or null. Only the first `maxMeshes` meshes (depth-first) are tested,
// so a huge scene costs a bounded amount per gesture.
export function pickPivot({ camera, ndc, objects, maxMeshes = DEFAULT_MAX_MESHES }) {
    if (!camera || !Array.isArray(ndc) || !objects?.length) return null
    const meshes = collectMeshes(objects, maxMeshes, [])
    if (!meshes.length) return null
    camera.updateMatrixWorld?.()
    sharedNdc.set(ndc[0], ndc[1])
    sharedRaycaster.setFromCamera(sharedNdc, camera)
    // recursive=false: collectMeshes already walked the tree and dropped helpers.
    const hits = sharedRaycaster.intersectObjects(meshes, false)
    return hits.length ? hits[0].point.clone() : null
}

// Like pickPivot, but also says WHICH content root was hit (the nearest ancestor
// tagged userData.svEntityId), for "focus on this".
export function pickHit({ camera, ndc, objects, maxMeshes = DEFAULT_MAX_MESHES }) {
    if (!camera || !Array.isArray(ndc) || !objects?.length) return null
    const meshes = collectMeshes(objects, maxMeshes, [])
    if (!meshes.length) return null
    camera.updateMatrixWorld?.()
    sharedNdc.set(ndc[0], ndc[1])
    sharedRaycaster.setFromCamera(sharedNdc, camera)
    const hits = sharedRaycaster.intersectObjects(meshes, false)
    if (!hits.length) return null
    let root = hits[0].object
    while (root && root.userData?.svEntityId == null && root.parent) root = root.parent
    return { point: hits[0].point.clone(), root: root?.userData?.svEntityId != null ? root : null }
}

// Pointer position on an element -> normalized device coordinates.
export function clientToNdc(clientX, clientY, rect) {
    if (!rect || !rect.width || !rect.height) return null
    return [
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
    ]
}

// Centre of the bounding box of the given objects (Orbit Around Selection), or null.
export function selectionCenter(objects) {
    if (!objects?.length) return null
    const box = new Box3()
    for (const object of objects) box.expandByObject(object)
    if (box.isEmpty()) return null
    return box.getCenter(new Vector3())
}

// The box the orbit point may wander in: the content's bounds plus a margin
// (half its largest side, at least 30 m). Zooming toward a pointer that hits
// nothing carries the orbit point along the pointer ray; unbounded, ten notches
// out put it 3 km from a 120 m hall (measured 2026-10-07). Null = no content,
// no limit. Pure: roots are Object3Ds.
export const BOUNDARY_MIN_MARGIN = 30
export function contentBoundary(roots, { minMargin = BOUNDARY_MIN_MARGIN } = {}) {
    const total = new Box3()
    const one = new Box3()
    for (const root of roots || []) {
        if (!root || root.visible === false) continue
        one.setFromObject(root, false)
        if (!one.isEmpty() && Number.isFinite(one.min.x) && Number.isFinite(one.max.x)) total.union(one)
    }
    if (total.isEmpty()) return null
    const size = total.getSize(new Vector3())
    const margin = Math.max(minMargin, Math.max(size.x, size.y, size.z) * 0.5)
    return total.expandByScalar(margin)
}
