// Blender's modal transform mechanics, as pure maths (owner 2026-10-13: "in Edit I want to move but it
// gets stuck, not like Blender" — before, the mouse did nothing until an axis key, and then added raw
// pixels to one coordinate).
//
//   grab, free   — the object stays under the cursor: the pointer is unprojected onto the plane through
//                  the pivot that faces the camera; the move is the difference of two such points.
//   grab, axis   — the same world delta, projected on the axis (Blender slides along the axis line).
//   rotate       — the angle the pointer turns around the pivot's screen point; free = around the view
//                  axis, X/Y/Z = around that world axis, sign chosen so the object follows the cursor.
//   scale        — the ratio of the pointer's distance to the pivot's screen point, now over start.
// Every step is incremental, so Shift (precision ×0.1) can be pressed mid-drag.
import { Plane, Quaternion, Ray, Vector3, Euler } from 'three'

const _plane = new Plane()
const _ray = new Ray()

/** Pixel (clientX/Y) → NDC inside `rect` (the canvas's bounding rect). */
export const toNdc = (x, y, rect) => ({
    x: ((x - rect.left) / rect.width) * 2 - 1,
    y: -((y - rect.top) / rect.height) * 2 + 1,
})

/** The camera's view direction in world space (unit). */
export const viewDirection = (camera, out = new Vector3()) => camera.getWorldDirection(out)

/**
 * The world point where the pointer's ray meets the plane through `pivot` facing the camera.
 * Returns null when the ray misses (looking exactly along the plane).
 */
export function pointerOnPivotPlane(camera, rect, x, y, pivot, out = new Vector3()) {
    const ndc = toNdc(x, y, rect)
    const normal = viewDirection(camera, new Vector3())
    _plane.setFromNormalAndCoplanarPoint(normal, new Vector3(pivot[0], pivot[1], pivot[2]))
    const origin = camera.getWorldPosition(new Vector3())
    const through = new Vector3(ndc.x, ndc.y, 0.5).unproject(camera)
    _ray.set(origin, through.sub(origin).normalize())
    return _ray.intersectPlane(_plane, out)
}

/** The pivot's position on screen, in canvas pixels. */
export function pivotOnScreen(camera, rect, pivot) {
    const p = new Vector3(pivot[0], pivot[1], pivot[2]).project(camera)
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
}

/** Angle of the pointer around the pivot's screen point (radians, screen y down → sign flipped so CCW on screen is +). */
export const angleAround = (center, x, y) => Math.atan2(-(y - center.y), x - center.x)

/** Distance of the pointer to the pivot's screen point (never below 1 px so a ratio exists). */
export const distanceFrom = (center, x, y) => Math.max(1, Math.hypot(x - center.x, y - center.y))

const AXIS_VEC = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }

/**
 * One pointer step of a grab. `prev`/`next` are world points on the pivot plane; returns the world
 * delta to add (a Vector3): free or 'all' = the plane delta, an axis = its projection on that axis.
 */
export function grabStep(prev, next, axis, precision = 1) {
    const d = new Vector3().subVectors(next, prev).multiplyScalar(precision)
    if (!axis || axis === 'all') return d
    const u = AXIS_VEC[axis]
    return u.clone().multiplyScalar(d.dot(u))
}

/**
 * The world axis a rotate turns around: free = the view axis (toward the camera, so CCW on screen is
 * CCW in the world); X/Y/Z = that axis, flipped when it points away from the camera, so the object
 * follows the cursor either way.
 */
export function rotateAxis(camera, axis) {
    const view = viewDirection(camera, new Vector3()).negate() // toward the viewer
    if (!axis || axis === 'all') return view
    const u = AXIS_VEC[axis].clone()
    return u.dot(view) < 0 ? u.negate() : u
}

/** Rotate an XYZ Euler (array) by `angle` around a world axis; returns a new array. */
export function rotateEulerAroundWorldAxis(rot, axisVec, angle) {
    const q = new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2], 'XYZ'))
    const step = new Quaternion().setFromAxisAngle(axisVec, angle)
    const e = new Euler().setFromQuaternion(step.multiply(q), 'XYZ')
    return [e.x, e.y, e.z]
}

/** Orbit a position around the pivot by `angle` on `axisVec`; returns a new array. */
export function orbitAroundPivot(pos, pivot, axisVec, angle) {
    const v = new Vector3(pos[0] - pivot[0], pos[1] - pivot[1], pos[2] - pivot[2]).applyAxisAngle(axisVec, angle)
    return [pivot[0] + v.x, pivot[1] + v.y, pivot[2] + v.z]
}

/** Scale factor for the step: the ratio of distances, softened by precision (×0.1 pulls the ratio toward 1). */
export const scaleStep = (prevDist, nextDist, precision = 1) => 1 + (nextDist / prevDist - 1) * precision

/** Snap helpers (Ctrl): a vector to a world grid, an angle to 15°, a factor to 0.1. */
export const snapVector = (v, step) => new Vector3(Math.round(v.x / step) * step, Math.round(v.y / step) * step, Math.round(v.z / step) * step)
export const snapScalar = (value, step) => Math.round(value / step) * step
