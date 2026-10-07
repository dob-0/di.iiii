// Double-click to focus: fly to the thing under the pointer and make it the point
// the view turns around. Pure maths, no React, no DOM.
//
// A small thing (a lamp, a speaker) is framed whole; a big one (the hall the whole
// room is inside) is NOT framed whole — that would be "frame all" again — the view
// moves in on the spot that was clicked instead.
import { Vector3 } from 'three'
import { computeFitDistance } from '../../utils/cameraFraming.js'

export const FOCUS_WHOLE_MAX_SIZE = 8          // metres, largest side of a thing framed whole
export const FOCUS_SPOT_RATIO = 0.35           // spot focus: new distance = this x current
export const FOCUS_SPOT_RANGE = Object.freeze([2, 25])

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// camera: { position: Vector3, fov, aspect }; hit: Vector3 under the pointer;
// box: Box3 of the thing hit (or null).
export function focusPose({ camera, hit, box = null }) {
    const eye = camera.position
    const toEye = eye.clone().sub(hit)
    if (toEye.lengthSq() < 1e-10) toEye.set(0, 0.4, 1)
    const direction = toEye.normalize()

    const size = box && !box.isEmpty() ? box.getSize(new Vector3()) : null
    const largest = size ? Math.max(size.x, size.y, size.z) : Infinity
    if (size && largest <= FOCUS_WHOLE_MAX_SIZE) {
        const center = box.getCenter(new Vector3())
        const radius = Math.max(0.5, size.length() / 2)
        const distance = computeFitDistance(radius * 1.35, { fov: camera.fov || 50, aspect: camera.aspect || 1 })
        return { target: center, position: center.clone().add(direction.multiplyScalar(distance)), whole: true }
    }
    const current = eye.distanceTo(hit)
    const distance = clamp(current * FOCUS_SPOT_RATIO, FOCUS_SPOT_RANGE[0], FOCUS_SPOT_RANGE[1])
    return { target: hit.clone(), position: hit.clone().add(direction.multiplyScalar(Math.min(distance, current))), whole: false }
}
