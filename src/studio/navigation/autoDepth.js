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

// When nothing is under the pointer (fog, the open length of a hall, sky), Blender keeps the
// previous depth. Here the previous depth can be camera-controls' 0.35 m clamp — after a
// wheel zoom into open air `infinityDolly` has dragged the orbit point along at that clamp,
// and every pan and wheel step is then scaled by 0.35 m (measured 2026-10-12, MOXIR v1.1:
// 240 px drag = 0.128 m, the owner's "stuck"). This fallback is OUR rule, not Blender's:
// the depth is the nearest surface around the camera along six world axes (the floor you
// stand over, the roof, the wall behind you), and the pivot is placed that far along the
// view ray. In the same measurement the floor was 4.46 m down and a wall 3.68 m back.
// Returns null when no axis hits (the camera is outside every surface).
export const FALLBACK_DIRECTIONS = Object.freeze([
    new Vector3(0, -1, 0), new Vector3(0, 1, 0),
    new Vector3(-1, 0, 0), new Vector3(1, 0, 0),
    new Vector3(0, 0, -1), new Vector3(0, 0, 1),
])
const sharedOrigin = new Vector3()
const sharedDir = new Vector3()
export function fallbackPivot({ camera, objects, maxMeshes = DEFAULT_MAX_MESHES }) {
    if (!camera || !objects?.length) return null
    const meshes = collectMeshes(objects, maxMeshes, [])
    if (!meshes.length) return null
    camera.updateMatrixWorld?.()
    camera.getWorldPosition(sharedOrigin)
    let depth = Infinity
    for (const dir of FALLBACK_DIRECTIONS) {
        sharedRaycaster.set(sharedOrigin, dir)
        const hits = sharedRaycaster.intersectObjects(meshes, false)
        if (hits.length && hits[0].distance < depth) depth = hits[0].distance
    }
    if (!Number.isFinite(depth)) return null
    camera.getWorldDirection(sharedDir)
    return sharedOrigin.clone().addScaledVector(sharedDir, depth)
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
