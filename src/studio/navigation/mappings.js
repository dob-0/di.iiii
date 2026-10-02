// Viewport navigation presets for Studio, as data.
//
// 'studio' is the long-standing Studio mapping and the default: it must stay
// exactly what StudioViewport passed to camera-controls before presets existed
// (mappings.test.js pins it to that literal).
//
// 'blender' follows the documented BEHAVIOUR in the Blender 5.2 LTS manual
// (docs.blender.org/manual/en/latest — editors/3dview/navigate/navigation.html,
// editors/preferences/navigation.html, editors/preferences/input.html). No
// Blender code is used; Blender is GPL-3.0 and only its manual was read.
//   Orbit: MMB · Pan: Shift-MMB · Zoom: Ctrl-MMB, Wheel
//   Emulate 3 Button Mouse: "MMB drag becomes Alt-LMB drag"
//   Zoom to Mouse Position + Auto Depth: on in this preset (Blender ships both off).
//
// camera-controls 2.10.1 has no modifier-aware mouse bindings (MouseButtons is
// only left/middle/right/wheel), so modifier gestures are decided per gesture by
// actionFor() and applied by useCameraNavigation.js on pointerdown.

// ACTION values from camera-controls (binary flags).
export const CC_ACTION = Object.freeze({
    NONE: 0, ROTATE: 1, TRUCK: 2, SCREEN_PAN: 4, OFFSET: 8, DOLLY: 16, ZOOM: 32,
    TOUCH_DOLLY_TRUCK: 4096,
})

export const NAVIGATION_PRESET_IDS = Object.freeze(['studio', 'blender'])
export const DEFAULT_NAVIGATION_PRESET = 'studio'

// DOM MouseEvent.button numbers.
const BUTTON_NAME = { 0: 'left', 1: 'middle', 2: 'right' }

export const NAVIGATION_PRESETS = Object.freeze({
    studio: Object.freeze({
        id: 'studio',
        label: 'Studio',
        description: 'Drag to orbit, right-drag to pan, scroll to zoom. The default.',
        mouseButtons: Object.freeze({
            left: CC_ACTION.ROTATE,
            middle: CC_ACTION.DOLLY,
            right: CC_ACTION.TRUCK,
            wheel: CC_ACTION.DOLLY,
        }),
        // In an orthographic view (small FOV) left drag pans instead.
        orthoLeft: CC_ACTION.TRUCK,
        touches: Object.freeze({
            one: CC_ACTION.ROTATE,
            two: CC_ACTION.TOUCH_DOLLY_TRUCK,
        }),
        dollyToCursor: true,
        autoDepth: false,
        modifierGestures: false,
        rows: Object.freeze([
            ['Drag', 'Orbit'],
            ['Right drag', 'Pan'],
            ['Middle drag', 'Zoom'],
            ['Scroll', 'Zoom (toward the pointer)'],
        ]),
    }),
    blender: Object.freeze({
        id: 'blender',
        label: 'Blender',
        description: 'Middle mouse button moves the view, like Blender. The left button only selects. No middle button? Hold Alt with the left button.',
        mouseButtons: Object.freeze({
            left: CC_ACTION.NONE,
            middle: CC_ACTION.ROTATE,
            right: CC_ACTION.NONE,
            wheel: CC_ACTION.DOLLY,
        }),
        orthoLeft: CC_ACTION.NONE,
        // Blender's manual names no touch navigation for the viewport; touch
        // keeps the Studio gestures so a phone still works.
        touches: Object.freeze({
            one: CC_ACTION.ROTATE,
            two: CC_ACTION.TOUCH_DOLLY_TRUCK,
        }),
        dollyToCursor: true,
        autoDepth: true,
        modifierGestures: true,
        rows: Object.freeze([
            ['Middle drag', 'Orbit'],
            ['Shift+Middle drag', 'Pan'],
            ['Ctrl+Middle drag', 'Zoom'],
            ['Scroll', 'Zoom (toward the pointer)'],
            ['Alt+Drag', 'Orbit (no middle button)'],
            ['Shift+Alt+Drag', 'Pan (no middle button)'],
            ['Ctrl+Alt+Drag', 'Zoom (no middle button)'],
        ]),
    }),
})

export function normalizeNavigationPreset(value) {
    return NAVIGATION_PRESET_IDS.includes(value) ? value : DEFAULT_NAVIGATION_PRESET
}

export function getNavigationPreset(id) {
    return NAVIGATION_PRESETS[normalizeNavigationPreset(id)]
}

// The resting mouse bindings for a preset (no modifier held).
export function mouseButtonsFor(presetId, { ortho = false } = {}) {
    const preset = getNavigationPreset(presetId)
    return { ...preset.mouseButtons, left: ortho ? preset.orthoLeft : preset.mouseButtons.left }
}

// The bindings to HAND camera-controls: fresh, writable copies. The presets
// above are frozen, and camera-controls keeps the object it is given — then
// this app writes into it (the ortho swap in StudioViewport, the per-gesture
// action in useCameraNavigation). Handing it the frozen preset made the first
// such write throw "Cannot assign to read only property 'left'" and took the
// whole viewport down: every 3D room on dev rendered black (2026-10-01).
export function controlBindingsFor(presetId, { ortho = false } = {}) {
    const preset = getNavigationPreset(presetId)
    return {
        mouseButtons: { ...mouseButtonsFor(preset.id, { ortho }) },
        touches: { ...preset.touches },
    }
}

// The camera-controls action one mouse gesture should perform.
// button: DOM MouseEvent.button (0 left, 1 middle, 2 right).
// mods: { shift, ctrl, alt } as held at pointerdown — the gesture keeps it.
export function actionFor(presetId, button, mods = {}, { ortho = false } = {}) {
    const name = BUTTON_NAME[button]
    if (!name) return CC_ACTION.NONE
    const preset = getNavigationPreset(presetId)
    const resting = mouseButtonsFor(preset.id, { ortho })
    if (!preset.modifierGestures) return resting[name]

    const { shift = false, ctrl = false, alt = false } = mods
    const modified = () => (shift ? CC_ACTION.TRUCK : ctrl ? CC_ACTION.DOLLY : CC_ACTION.ROTATE)
    if (name === 'middle') return modified()
    if (name === 'left' && alt) return modified() // Emulate 3 Button Mouse
    return CC_ACTION.NONE
}
