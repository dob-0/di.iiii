// THE STANDARD MOVE (owner, 2026-10-13: "one standard model where it will be easy to navigate, not connected to the objects
// around ... the same speed and motion to every side ... you can go everywhere ... settable in settings"). Decided with him the
// same day: everywhere (both Studio tools and the public viewer); the view turns around a point a fixed distance ahead, and
// turning in place is a setting.
// Established practice it follows: the camera's speed is a setting, never read from the scene (Unreal Editor's viewport Camera
// Speed; Blender's own Walk and Fly navigation: one speed, Shift faster, Alt slower — the owner's Blender 5.2.2: Walk 2.5 m/s,
// speed factor 5, read from his preferences on 2026-10-12). Nothing under the pointer, near the camera or in view changes a move.
// OUR choices, written down as such and settable: the automatic speed is the space's largest side / 40 (MOXIR's 100 m hall:
// 2.5 m a wheel notch), read again at each move while the space still loads and fixed for the visit once it is in
// (useCameraNavigation autoSpeedFor); the turning point sits 10 steps ahead; 100 px of a zoom drag is one step; flying covers
// one step per second.
export const SPEED_FACTOR = 5
export const AUTO_SPEED_DIVISOR = 40
export const TURN_DISTANCE_STEPS = 10
export const ZOOM_DRAG_PIXELS_PER_STEP = 100
export const IN_PLACE_DISTANCE = 1e-3
export const FALLBACK_SPEED = 1
export const MIN_SPEED = 0.001
export const MAX_SPEED = 10000
export const TURN_MODES = Object.freeze(['point', 'place'])
// The turn a person meets before they choose: 'place' — a turn drag turns the view where you stand (owner, 2026-10-16:
// "make everywhere move … where you stand mode by default"). A choice someone already made stays theirs (preference.js).
export const DEFAULT_TURN = 'place'

// 'auto' or metres per notch. Junk is 'auto'. Pure.
export function normalizeSpeedSetting(value) {
    if (value === 'auto' || value == null || value === '') return 'auto'
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return 'auto'
    return Math.min(Math.max(n, MIN_SPEED), MAX_SPEED)
}

// 'point' (around a point ahead) or 'place' (where you stand). Junk is 'point'. Pure.
export function normalizeTurnSetting(value) {
    return TURN_MODES.includes(value) ? value : DEFAULT_TURN
}

// The automatic speed from the space's largest side, or null when the space has no size yet. Pure.
export function autoSpeed(largestSide) {
    return Number.isFinite(largestSide) && largestSide > 0 ? largestSide / AUTO_SPEED_DIVISOR : null
}

// The speed in effect: the setting, or the automatic one, or the fallback while the space has no size. Pure.
export function resolveSpeed(setting, auto) {
    const s = normalizeSpeedSetting(setting)
    if (s !== 'auto') return s
    return auto > 0 ? auto : FALLBACK_SPEED
}

// Shift: 5x faster; Alt: 5x slower; both, or neither: as set. Pure.
export function speedModifier({ shift = false, alt = false } = {}) {
    if (shift && !alt) return SPEED_FACTOR
    if (alt && !shift) return 1 / SPEED_FACTOR
    return 1
}

// How far ahead the view turns around. Pure.
export function turnDistance(speed, turn) {
    return normalizeTurnSetting(turn) === 'place' ? IN_PLACE_DISTANCE : speed * TURN_DISTANCE_STEPS
}

// Metres forward (+) or back (-) for a wheel event of `notches` (positive = in). The same everywhere. Pure.
export function wheelStep(notches, speed, modifier = 1) {
    return Number.isFinite(notches) ? notches * speed * modifier : 0
}

// Metres forward for a zoom drag of `dy` pixels (dragging up, dy < 0, goes forward, as Blender's Dolly zoom). Pure.
export function zoomDragStep(dy, speed, modifier = 1) {
    return Number.isFinite(dy) ? (-dy / ZOOM_DRAG_PIXELS_PER_STEP) * speed * modifier : 0
}

// Metres the view slides per pixel: the turning point follows the pointer, so the slide is the same in every direction and
// at every place (a point `distance` ahead, a vertical field of view `fovDeg`, a view `heightPx` tall). Pure.
export function slideMetresPerPixel(distance, fovDeg, heightPx) {
    if (!(distance > 0) || !(fovDeg > 0) || !(heightPx > 0)) return 0
    return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / heightPx
}

// Flying: which way the held keys point, one step per second each way (W/S forward/back, D/A right/left, E/Q up/down). Pure.
export function flyVelocity(keys, speed, modifier = 1) {
    const v = speed * modifier
    const axis = (plus, minus) => (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0)
    return { forward: axis('KeyW', 'KeyS') * v, right: axis('KeyD', 'KeyA') * v, up: axis('KeyE', 'KeyQ') * v }
}

// Move 1's camera-controls options that StudioViewport hands to <CameraControls> besides the mouse maps and the preset's
// easing (mappings.js 'studio': smoothTime 0.25, draggingSmoothTime 0.125). One frozen object; values as they have always been.
export const MOVE_1_CAMERA = Object.freeze({
    rotateSpeed: 1,
    infinityDolly: true,
    minDistance: IN_PLACE_DISTANCE / 2,
    maxDistance: Infinity,
})
