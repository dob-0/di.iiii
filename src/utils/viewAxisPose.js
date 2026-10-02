import * as THREE from 'three'

// Blender-style view commands (numpad), in this editor's Y-up world.
// Front = camera on +Z looking toward -Z; Right = camera on +X; Top = camera on +Y.
// `back` flips to the opposite side (Back, Left, Bottom). Top has screen-up = -Z and
// Bottom screen-up = +Z, so the horizon never collapses (Blender's convention).
const AXES = {
    front: { dir: [0, 0, 1], up: [0, 1, 0] },
    z: { dir: [0, 0, 1], up: [0, 1, 0] },
    right: { dir: [1, 0, 0], up: [0, 1, 0] },
    x: { dir: [1, 0, 0], up: [0, 1, 0] },
    top: { dir: [0, 1, 0], up: [0, 0, -1] },
    y: { dir: [0, 1, 0], up: [0, 0, -1] }
}

export const viewAxisPose = ({ axis = 'front', target = [0, 0, 0], distance = 6, back = false } = {}) => {
    const spec = AXES[axis] || AXES.front
    const sign = back ? -1 : 1
    const t = Array.isArray(target) ? target : [target?.x || 0, target?.y || 0, target?.z || 0]
    const d = Number.isFinite(Number(distance)) && Number(distance) > 0 ? Number(distance) : 6
    return {
        position: spec.dir.map((c, i) => t[i] + c * sign * d),
        target: [t[0], t[1], t[2]],
        up: spec.up.map((c) => c * sign)
    }
}

export const ORBIT_STEP_RAD = THREE.MathUtils.degToRad(15)

const NUMPAD_AXIS = { Numpad1: 'front', Numpad3: 'right', Numpad7: 'top' }
const DIGIT_AXIS = { Digit1: 'front', Digit3: 'right', Digit7: 'top' }
// azimuth / polar deltas for camera-controls rotate(); polar < 0 moves the camera up.
const NUMPAD_ORBIT = {
    Numpad4: { azimuth: -ORBIT_STEP_RAD, polar: 0 },
    Numpad6: { azimuth: ORBIT_STEP_RAD, polar: 0 },
    Numpad8: { azimuth: 0, polar: -ORBIT_STEP_RAD },
    Numpad2: { azimuth: 0, polar: ORBIT_STEP_RAD }
}
const ARROW_ORBIT = { ArrowLeft: 'Numpad4', ArrowRight: 'Numpad6', ArrowUp: 'Numpad8', ArrowDown: 'Numpad2' }

// event.code based (physical key), so the number row and existing shortcuts do not clash.
// Numpad: Blender's own. No numpad (laptops): Shift+1/3/7 = front/right/top (Ctrl+Shift = back/
// left/bottom), Shift+Arrows = orbit 15 deg, Home = view all. Alt+digit is NOT used: Chrome and
// Firefox on Linux take it for tab switching. Numpad5 (ortho) is deliberately absent.
export const resolveViewKey = (event = {}) => {
    const { code, ctrlKey = false, shiftKey = false, altKey = false, metaKey = false } = event
    if (altKey || metaKey) return null
    if (NUMPAD_AXIS[code] && !shiftKey) return { kind: 'axis', axis: NUMPAD_AXIS[code], back: ctrlKey }
    if (DIGIT_AXIS[code] && shiftKey) return { kind: 'axis', axis: DIGIT_AXIS[code], back: ctrlKey }
    if (!ctrlKey && NUMPAD_ORBIT[code] && !shiftKey) return { kind: 'orbit', ...NUMPAD_ORBIT[code] }
    if (!ctrlKey && shiftKey && ARROW_ORBIT[code]) return { kind: 'orbit', ...NUMPAD_ORBIT[ARROW_ORBIT[code]] }
    if (!ctrlKey && !shiftKey && code === 'Home') return { kind: 'frame-all' }
    if (!ctrlKey && !shiftKey && code === 'NumpadDecimal') return { kind: 'frame-selected' }
    return null
}
