// Right-drag moves you in the world by a fixed step, whatever the zoom (owner, 2026-10-12: "it does not matter how
// much you zoom in or out, still the same size movement step … click the right click and move in the world"). Pure:
// no React, no DOM. camera-controls carries it out with truck(x, y): camera and orbit point move together in metres.
import { Box3, Vector3 } from 'three'

export const WORLD_MOVE = 'world-move'           // the gesture's action name (not a camera-controls action)
export const MOVE_STEP_PX = 100                   // the step is "metres per 100 px of drag"
export const MOVE_STEP_SCENE_FRACTION = 1 / 40    // auto step = the scene's largest side / 40 (100 m hall -> 2.5 m per 100 px)
export const MOVE_STEP_MIN = 0.01
export const MOVE_STEP_MAX = 1000

const sharedBox = new Box3()
const sharedSize = new Vector3()

// The scene's largest side in metres from its entity roots, or null when there is nothing to measure.
export function sceneLargestSide(roots) {
    if (!roots?.length) return null
    sharedBox.makeEmpty()
    for (const root of roots) sharedBox.expandByObject(root)
    if (sharedBox.isEmpty()) return null
    sharedBox.getSize(sharedSize)
    const side = Math.max(sharedSize.x, sharedSize.y, sharedSize.z)
    return Number.isFinite(side) && side > 0 ? side : null
}

// The step in metres per MOVE_STEP_PX: the owner's own value when set, else the auto value from the scene.
export function resolveMoveStep(preferred, roots) {
    if (Number.isFinite(preferred) && preferred > 0) return Math.min(MOVE_STEP_MAX, Math.max(MOVE_STEP_MIN, preferred))
    const side = sceneLargestSide(roots)
    if (side == null) return 1
    return Math.min(MOVE_STEP_MAX, Math.max(MOVE_STEP_MIN, side * MOVE_STEP_SCENE_FRACTION))
}

// Pixels of drag -> metres for camera-controls truck(x, y). Drag right: the world follows the pointer (camera goes left);
// drag down: the world comes down (camera goes up) — the same directions the pan had.
export function dragToTruck(dxPx, dyPx, step) {
    const k = step / MOVE_STEP_PX
    return { x: -dxPx * k, y: dyPx * k }
}
