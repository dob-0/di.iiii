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
// `beyond` (metres): a surface closer than this is the one the camera is pressed against (camera-controls' minDistance
// clamp, 0.35 m); the pick looks PAST it to what is behind, so a wheel notch keeps going through instead of dollying
// 15.7 % of 0.35 m (owner, 2026-10-12: "you can unlimited scroll"; his trace: 25 notches at 0.35 m from the roof, 4 cm each).
export function pickPivot({ camera, ndc, objects, maxMeshes = DEFAULT_MAX_MESHES, beyond = 0 }) {
    if (!camera || !Array.isArray(ndc) || !objects?.length) return null
    const meshes = collectMeshes(objects, maxMeshes, [])
    if (!meshes.length) return null
    camera.updateMatrixWorld?.()
    sharedNdc.set(ndc[0], ndc[1])
    sharedRaycaster.setFromCamera(sharedNdc, camera)
    // recursive=false: collectMeshes already walked the tree and dropped helpers.
    const hits = sharedRaycaster.intersectObjects(meshes, false)
    const hit = hits.find((h) => h.distance > beyond)
    return hit ? hit.point.clone() : null
}

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

// A material the eye sees through: drawn without depth writes, faded, not drawn into colour, or hidden. Pure.
export function isSeeThrough(material) {
    const list = Array.isArray(material) ? material : [material]
    return list.every((m) => !m || m.visible === false || m.depthWrite === false || m.colorWrite === false || (m.transparent === true && Number(m.opacity) < 0.99))
}

// The largest side of what the space shows: visible meshes under `roots`, not helpers, not see-through (a light's 33 m beam cone
// is not the space). The standard move's automatic speed is taken from it once (freeMove.js). 0 while nothing has loaded.
export function contentLargestSide(roots, maxMeshes = DEFAULT_MAX_MESHES) {
    const box = new Box3(), one = new Box3()
    const stack = [...(roots || [])]
    let n = 0
    while (stack.length && n < maxMeshes) {
        const o = stack.pop()
        if (!o || !o.visible || isNavigationHelper(o)) continue
        if (o.isMesh && o.geometry && !isSeeThrough(o.material)) {
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
            o.updateWorldMatrix(true, false)
            one.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)
            box.union(one); n += 1
        }
        for (const c of o.children || []) stack.push(c)
    }
    if (box.isEmpty()) return 0
    const size = box.getSize(new Vector3())
    return Math.max(size.x, size.y, size.z)
}
