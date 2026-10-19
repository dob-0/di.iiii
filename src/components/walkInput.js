// The walk's input maths, pure so each device is testable without a canvas.
// One look mode (drag), no pointer lock: the pointer is never captured away from
// the page, so Esc has nothing to release. Sketchfab Help "Navigation": drag to
// look, WASD/arrows to move, a stick on touch.
import {
    DRAG_LOOK_SENSITIVITY, TRACKPAD_LOOK_SENSITIVITY, WHEEL_DOLLY_SPEED, PINCH_DOLLY_SPEED,
    GESTURE_DOLLY_PER_LOG_SCALE, WALK_PITCH_LIMIT
} from './walkModeConfig.js'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export const clampPitch = (pitch, limit = WALK_PITCH_LIMIT) => clamp(pitch, -limit, limit)

// Drag with the primary button: yaw/pitch deltas from the visible cursor's client
// coordinates (movementX/Y can lie on some compositors), movement deltas only on
// the (0,0) glitch or a first sample.
export const dragLookDelta = (last, e) => {
    const glitched = e.clientX === 0 && e.clientY === 0
    let dx
    let dy
    if (glitched || !last) {
        dx = e.movementX || 0
        dy = e.movementY || 0
    } else {
        dx = e.clientX - last.x
        dy = e.clientY - last.y
        if (dx === 0 && dy === 0) { dx = e.movementX || 0; dy = e.movementY || 0 }
    }
    return {
        dYaw: -dx * DRAG_LOOK_SENSITIVITY,
        dPitch: -dy * DRAG_LOOK_SENSITIVITY,
        next: glitched ? last : { x: e.clientX, y: e.clientY }
    }
}

const modeScale = (e) => (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1)

// A wheel event, from any device:
//  - ctrlKey (pinch on a touchpad, or ctrl + wheel): zoom = dolly toward what you face
//  - otherwise two-finger scroll: deltaY dollies, deltaX turns (never dropped)
// `preventDefault` is true for both: the page must not scroll, zoom or swipe back.
export const wheelIntent = (e, { dolly = true } = {}) => {
    const s = modeScale(e)
    if (e.ctrlKey) {
        return { dYaw: 0, dolly: dolly ? -(e.deltaY || 0) * s * PINCH_DOLLY_SPEED : 0, preventDefault: true }
    }
    return {
        dYaw: -(e.deltaX || 0) * s * TRACKPAD_LOOK_SENSITIVITY,
        dolly: dolly ? -(e.deltaY || 0) * s * WHEEL_DOLLY_SPEED : 0,
        preventDefault: true
    }
}

// Safari's pinch is a gesture event with a cumulative `scale`; the step since the
// last event, as a dolly.
export const gestureDolly = (lastScale, scale) => {
    if (!(lastScale > 0) || !(scale > 0)) return 0
    return Math.log(scale / lastScale) * GESTURE_DOLLY_PER_LOG_SCALE
}

// Touch: a finger on the right half looks (same sensitivity either axis).
export const touchLookDelta = (last, t, sensitivity) => ({
    dYaw: -(t.clientX - last.lastX) * sensitivity,
    dPitch: -(t.clientY - last.lastY) * sensitivity
})
