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
//   Moves at the standard speed (useCameraNavigation, freeMove.js): nothing under the pointer changes a move (2026-10-13).
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
        // The NAVIGATE tool and the public viewer: like Sketchfab (owner, 2026-10-12: "view like sketchfab, edit like blender").
        description: 'Drag to orbit, right-drag to pan, scroll to move forward and back at one steady speed, double-click a surface to look at it. Like Sketchfab.',
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
        // Moves keep the standard speed (useCameraNavigation, freeMove.js): nothing under the pointer changes them (owner, 2026-10-13).
        focusOnDoubleClick: true,
        // Easing (camera-controls SmoothDamp times, seconds): a glide on drags and wheel like Sketchfab's feel. Sketchfab
        // publishes no numbers; these are camera-controls' defaults (2.10.1), stated as such, not measured against Sketchfab.
        smoothTime: 0.25,
        draggingSmoothTime: 0.125,
        modifierGestures: false,
        rows: Object.freeze([
            ['Drag', 'Orbit'],
            ['Right drag', 'Pan'],
            ['Middle drag', 'Forward and back'],
            ['Scroll', 'Forward and back, the same step everywhere (Shift faster, Alt slower)'],
            ['Double-click', 'Look at the surface under the pointer'],
            ['Right button held + W A S D', 'Fly; Q E down and up'],
            ['Two fingers', 'Spread or pinch: forward and back; move together: pan'],
            ['Shift+`', 'Fly: mouse looks, W A S D move, Space up, Q down, Shift faster, Alt slower; E the inventory, left click places, right click removes; Esc leaves; Tab walks'],
        ]),
    }),
    blender: Object.freeze({
        id: 'blender',
        label: 'Blender',
        // The EDIT tool: Blender's own buttons and the owner's Blender preferences, read from ~/.config/blender/5.2 on 2026-10-12
        // (turntable, Orbit Around Selection off): nothing new to learn. Every move keeps the standard speed (2026-10-13) instead of
        // Blender's Auto Depth, which made moves crawl or fly with what was under the pointer.
        description: 'Middle mouse button moves the view, exactly like Blender. The left button only selects. No middle button? Hold Alt with the left button.',
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
        // Blender writes the view per mouse move and per wheel notch with no easing; Smooth View (his 200 ms) only for view
        // changes (numpad views, frame), which camera-controls does with smoothTime on setLookAt transitions.
        smoothTime: 0.2,
        draggingSmoothTime: 0,
        modifierGestures: true,
        rows: Object.freeze([
            ['Middle drag', 'Orbit'],
            ['Shift+Middle drag', 'Pan'],
            ['Ctrl+Middle drag', 'Zoom: forward and back'],
            ['Scroll', 'Zoom: forward and back, the same step everywhere (Shift faster, Alt slower)'],
            ['Right button held + W A S D', 'Fly; Q E down and up'],
            ['Alt+Drag', 'Orbit (no middle button)'],
            ['Shift+Alt+Drag', 'Pan (no middle button)'],
            ['Ctrl+Alt+Drag', 'Zoom (no middle button)'],
            ['Shift+`', 'Fly (Blender Walk, gravity off): mouse looks, W A S D move, Space up, Q down, Shift faster, Alt slower; E the inventory, left click places, right click removes; Esc leaves; Tab walks'],
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
    const buttons = { ...preset.mouseButtons, left: ortho ? preset.orthoLeft : preset.mouseButtons.left }
    // The wheel is the app's gesture (useCameraNavigation wheelZoom): camera-controls' own dolly-to-cursor moved the orbit point
    // toward the cursor in one frame while the radius eased (walked through 2026-10-12: a 6.9 m jump on the first notch).
    buttons.wheel = CC_ACTION.NONE
    return buttons
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
