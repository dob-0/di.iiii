// The Edit mouse: what the mouse does in the Studio's Edit (View | Edit). A person picks it in Scene -> Move, kept per browser
// like the other navigation settings (preference.js EDIT_MOUSE_STORAGE_KEY). View is never affected: it is always Move 1.
//   pull     Pull to move (default, owner 2026-10-28 "fine"): the camera is Move 1's ('studio' map) and a pull that starts on
//            the selected thing moves it (pullToMove.js).
//   blender  Like Blender (owner 2026-10-12 "edit like Blender", commit ed2c5290e): Edit uses the 'blender' map exactly as
//            origin/dev's Edit did before View | Edit; no pull. Kept as a mode (owner 2026-10-29: "what we have never lose").
import { pullPressAllowed } from './pullToMove.js'

export const EDIT_MOUSE_IDS = Object.freeze(['pull', 'blender'])
export const DEFAULT_EDIT_MOUSE = 'pull'
export const EDIT_MOUSE_LABEL = 'Mouse in Edit'
export const EDIT_MOUSES = Object.freeze([
    Object.freeze({ id: 'pull', label: 'Pull to move', about: 'Pull the selected thing to move it; pull anywhere else to turn the view.' }),
    Object.freeze({ id: 'blender', label: 'Like Blender', about: 'The left button picks; the middle button turns, Shift+middle slides, the wheel zooms.' }),
])

export function normalizeEditMouse(value) {
    return EDIT_MOUSE_IDS.includes(value) ? value : DEFAULT_EDIT_MOUSE
}

// The mouse-button map (mappings.js preset id) for a tool and an Edit mouse. Pure.
export function presetForTool(editMode, editMouse = DEFAULT_EDIT_MOUSE) {
    return editMode === 'edit' && normalizeEditMouse(editMouse) === 'blender' ? 'blender' : 'studio'
}

// Whether a press may start a pull (pullToMove.js) for a tool and an Edit mouse. Pure.
export function pullOnFor(editMode, editMouse = DEFAULT_EDIT_MOUSE) {
    return pullPressAllowed(editMode) && normalizeEditMouse(editMouse) === 'pull'
}
