// Navigation, as plain functions (docs/architecture/MOVEMENT.md). No three.js, no DOM: every
// decision of how the camera moves is here and is tested in navigationMath.test.js;
// Navigation.jsx only measures the scene and applies these.
//
// The behaviours are Blender's, from its manual (Preferences ‣ Navigation):
//   Auto Depth            "Use the depth under the mouse to improve view pan, rotate, zoom
//                          functionality. Useful in combination with Zoom To Mouse Position."
//   Zoom to Mouse Position "When enabled, the mouse pointer position becomes the focus point of
//                          zooming instead of the 2D window center."
//   Rotation Angle        the step of Numpad 4/6/8/2 (default 15°)
// and the viewport's own: Home frames all, Numpad . frames the selected, Numpad 1/3/7 (Ctrl
// for the opposite side) the front, right and top views, Ctrl+Numpad 4/6/8/2 pans by a step.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** How close the camera may come to a surface under the pointer: metres. The camera's near
 *  plane is 0.05 m; this keeps the surface drawn instead of clipped. */
export const NEAR_LIMIT = 0.15
/** Zoom per wheel unit: one 100-unit notch = ×1.136 (what camera-controls' default dolly
 *  measured, 2026-09-30, so a hand used to the old wheel feels the same in the open). */
export const ZOOM_PER_UNIT = Math.log(1.136) / 100
/** Blender's Rotation Angle preference, default. */
export const STEP_ANGLE = (15 * Math.PI) / 180

/**
 * The factor a wheel event asks: >1 zooms out, <1 in. `deltaMode` 1 is lines, 2 pages;
 * a trackpad pinch arrives as a wheel with ctrlKey and small deltas, so it is scaled up.
 */
export const wheelFactor = (deltaY, { deltaMode = 0, ctrlKey = false } = {}) => {
    let d = Number(deltaY) || 0
    if (deltaMode === 1) d *= 33
    else if (deltaMode === 2) d *= 400
    if (ctrlKey) d *= 6
    d = clamp(d, -400, 400)
    return Math.exp(d * ZOOM_PER_UNIT)
}

/** Pinch: fingers `prev` px apart become `now` px apart -> the distance follows 1:1. */
export const pinchFactor = (prevSpread, spread) => (prevSpread > 0 && spread > 0 ? clamp(prevSpread / spread, 0.5, 2) : 1)

/**
 * Dolly the camera along the ray through the pointer, toward (f<1) or away from (f>1) the
 * surface point `point` — Auto Depth + Zoom to Mouse Position. The view direction does not
 * change, so the point stays under the pointer; the orbit target is put on the view axis at
 * that point's depth, so the next orbit turns about what you zoomed to.
 *
 * @returns {{position:number[], target:number[], gap:number, clamped:boolean}}
 */
export const dollyToPoint = (position, target, point, f, { nearLimit = NEAR_LIMIT } = {}) => {
    const forward = norm(sub(target, position))
    const toPoint = sub(point, position)
    const gap0 = len(toPoint)
    if (gap0 < 1e-6) return { position, target, gap: 0, clamped: true }
    let gap = gap0 * f
    let clamped = false
    if (gap < nearLimit) { gap = Math.min(gap0, nearLimit); clamped = true }
    const position2 = add(point, scale(toPoint, -gap / gap0))
    const depth = Math.max(dot(sub(point, position2), forward), nearLimit)
    return { position: position2, target: add(position2, scale(forward, depth)), gap, clamped }
}

/** Put the orbit target on the view axis at the depth of `point` without moving the view. */
export const retargetAtDepth = (position, target, point, { nearLimit = NEAR_LIMIT } = {}) => {
    const forward = norm(sub(target, position))
    const depth = Math.max(dot(sub(point, position), forward), nearLimit)
    return add(position, scale(forward, depth))
}

/** The ray through a normalised pointer position (-1…1, y up) for a perspective camera. */
export const pointerRay = (position, target, up, vfovDeg, aspect, ndcX, ndcY) => {
    const forward = norm(sub(target, position))
    const right = norm(cross(forward, up))
    const trueUp = cross(right, forward)
    const tanV = Math.tan((vfovDeg * Math.PI) / 360)
    const dir = norm(add(add(forward, scale(right, ndcX * tanV * aspect)), scale(trueUp, ndcY * tanV)))
    return { origin: position, direction: dir }
}

/** The point on a ray at `distance` (the fallback when nothing is under the pointer). */
export const pointAlong = (ray, distance) => add(ray.origin, scale(ray.direction, distance))

/**
 * Can this hit be zoomed to? Not a hidden thing, not a beam or haze (additive, transparent,
 * no depth write), not a part the cutaway has removed (a clipping plane says its point is out).
 */
export const isSolidSurface = ({ visible = true, additive = false, opacity = 1, depthWrite = true, clippedPoint = false, isLineOrPoints = false } = {}) => (
    visible && !additive && opacity >= 0.5 && depthWrite && !clippedPoint && !isLineOrPoints
)

/** How far back to stand to fit a sphere of `radius` in a view `vfovDeg` tall at `aspect`. */
export const fitDistance = (radius, vfovDeg, aspect, pad = 1.25) => {
    const v = (vfovDeg * Math.PI) / 360
    const h = Math.atan(Math.tan(v) * Math.max(0.2, aspect))
    return (Math.max(radius, 0.05) * pad) / Math.sin(Math.min(v, h))
}

/** View Selected (Numpad .): keep the way you are looking, stand back to fit the sphere. */
export const frameSphere = (position, target, center, radius, vfovDeg, aspect, { pad = 1.25, nearLimit = NEAR_LIMIT } = {}) => {
    const forward = norm(sub(target, position))
    const distance = Math.max(fitDistance(radius, vfovDeg, aspect, pad), radius + nearLimit)
    return { position: sub(center, scale(forward, distance)), target: center }
}

/**
 * The axis views (Numpad 1 front, 3 right, 7 top; Ctrl the opposite side): stand `distance`
 * from `target` looking along the axis. Front looks toward −Z (Blender: from −Y, ours: +Z is
 * toward the audience, so Front is from +Z), Right from +X, Top from above.
 */
export const axisView = (target, distance, name, opposite = false) => {
    const dirs = { front: [0, 0, 1], right: [1, 0, 0], top: [0, 1, 0] }
    const d = dirs[name]
    if (!d) return null
    const s = opposite ? -1 : 1
    const position = add(target, scale(d, distance * s))
    // Straight down would have no azimuth to orbit from: tilt a hair toward the audience.
    if (name === 'top') position[2] += (opposite ? -1 : 1) * distance * 1e-3
    return { position, target: [...target] }
}

/** Numpad 4/6/8/2 -> [azimuth, polar] step in radians: the CAMERA moves left / right / up / down
 *  (camera-controls: azimuth grows toward +X, polar 0 is straight up). */
export const stepOrbit = (code, angle = STEP_ANGLE) => ({
    Numpad4: [-angle, 0], Numpad6: [angle, 0], Numpad8: [0, -angle], Numpad2: [0, angle]
})[code] || null

/** Ctrl+Numpad 4/6/8/2 -> [right, up] pan in screen units, a step being a fifth of the view. */
export const stepPan = (code) => ({
    Numpad4: [-1, 0], Numpad6: [1, 0], Numpad8: [0, 1], Numpad2: [0, -1]
})[code] || null

/** Numpad +/- -> a wheel-equivalent zoom factor of two notches. */
export const stepZoom = (code) => (code === 'NumpadAdd' ? wheelFactor(-200) : code === 'NumpadSubtract' ? wheelFactor(200) : null)

/**
 * A camera in or against something. `probes` are short rays cast from the camera along ±X ±Y
 * ±Z: `{direction, distance, normal, frontFacing}` for the nearest surface each found. A
 * front-facing surface nearer than `clearance` pushes the camera out along its normal; a
 * back face that near means the camera is inside the solid — leave through it.
 * @returns {number[]|null} the push, or null when clear
 */
export const nudgeOut = (probes = [], clearance = NEAR_LIMIT) => {
    let push = [0, 0, 0]
    let any = false
    for (const p of probes) {
        if (!p || !(p.distance < clearance + 1e-9)) continue
        if (p.frontFacing) {
            push = add(push, scale(norm(p.normal), clearance - p.distance))
        } else {
            // Inside: the surface is behind the face we see from behind; step through it.
            push = add(push, scale(norm(p.direction), p.distance + clearance))
        }
        any = true
    }
    return any ? push : null
}

/** Keep a point above the floor. */
export const liftAboveFloor = (y, floorY = 0, clearance = 0.3) => Math.max(y, floorY + clearance)

/** The time constant of the glide home: further away, a little slower, never a jump. */
export const glideSmoothTime = (distance) => clamp(0.28 + distance * 0.0012, 0.28, 0.5)

/** A tap is a press and a release close in place and time. */
export const isTap = (down, up, { maxMs = 260, maxPx = 8 } = {}) => (
    Boolean(down && up) && up.t - down.t <= maxMs && Math.hypot(up.x - down.x, up.y - down.y) <= maxPx
)
/** A double tap: two taps close in time and place. */
export const isDoubleTap = (prev, tap, { maxMs = 340, maxPx = 32 } = {}) => (
    Boolean(prev && tap) && tap.t - prev.t <= maxMs && Math.hypot(tap.x - prev.x, tap.y - prev.y) <= maxPx
)

/**
 * The action a mouse press gets, from the button and the modifiers — Blender's set added to
 * the buttons the viewers already had (left orbits, right pans, middle dollies stay; middle
 * with Shift pans and with Ctrl dollies; Alt turns the left button into a middle one, which
 * is Blender's "Emulate 3 Button Mouse", so a trackpad has all three).
 * @returns {'rotate'|'truck'|'dolly'|null} null = leave the viewer's own binding
 */
export const mouseAction = (button, { shift = false, ctrl = false, alt = false } = {}) => {
    const middleLike = button === 1 || (button === 0 && alt)
    if (!middleLike) return null
    if (ctrl) return 'dolly'
    if (shift) return 'truck'
    return 'rotate'
}

/** The navigation keys, for the in-app card and the docs. */
export const NAVIGATION_KEYS = [
    ['Home', 'Back to the opening view'],
    ['F / Numpad .', 'Frame the thing under the pointer'],
    ['Double-click / double-tap', 'Empty space: home. An object: frame it'],
    ['Wheel / pinch', 'Zoom to the point under the pointer'],
    ['Left drag / one finger', 'Orbit around what you pointed at'],
    ['Middle drag', 'Orbit (Blender)'],
    ['Shift + middle drag / right drag / two fingers', 'Pan'],
    ['Ctrl + middle drag', 'Zoom'],
    ['Alt + left drag', 'Orbit on a trackpad (with Shift: pan, Ctrl: zoom)'],
    ['Numpad 4 6 8 2', 'Orbit in 15° steps'],
    ['Ctrl + Numpad 4 6 8 2', 'Pan in steps'],
    ['Numpad + / −', 'Zoom in steps'],
    ['Numpad 1 / 3 / 7', 'Front, right, top (Ctrl: the opposite side)'],
    ['1 – 6', 'The view row: Floor, DJ, Top, Side, Rig, Crane'],
    ['Alt + Z', 'X-ray'],
    ['Esc', 'Close this card, leave x-ray, leave walk'],
    ['?', 'This card']
]
