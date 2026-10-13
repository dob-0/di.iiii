// Single source of truth for "walk mode" (the first-person desktop/mobile
// walker used by the WCC exhibition, the landing page background, and
// PublicProjectViewer's Walk/Fly toggle — all three render the same Walker
// inside LiveProjectScene.jsx, so this is the one place to tune it).

// -- Movement --
export const WALK_MAX_SPEED = 5.2
export const FLY_SPEED = 4.5
export const WALK_ACCEL = 14
export const WALK_FRICTION = 10
export const TURN_SPEED = 1.6
export const EYE_HEIGHT = 1.6

// -- Look sensitivity, one per input method --
// Drag-look is the one mouse look (no pointer lock, so Esc never strands the
// pointer). 0.35 of the old locked sensitivity 0.0117, user-tuned live in
// 2026-08 (0.0117 itself was 35% below the original 0.018).
export const DRAG_LOOK_SENSITIVITY = 0.0117 * 0.35
export const TOUCH_LOOK_SENSITIVITY = 0.005
export const TRACKPAD_LOOK_SENSITIVITY = 0.004

// -- Wheel / dolly --
// Metres of forward motion per scroll pixel: one classic wheel notch (~48px
// after line-mode normalisation) steps half a metre.
export const WHEEL_DOLLY_SPEED = 0.01
// A touchpad pinch arrives as wheel events with ctrlKey and small deltaY (a few
// px per event, no inertia): scaled up so a full pinch crosses a few metres.
export const PINCH_DOLLY_SPEED = 0.05
// Safari gesturechange: metres per unit of ln(scale) -- doubling the scale = ~3 m.
export const GESTURE_DOLLY_PER_LOG_SCALE = 4

// -- Pitch limits --
// Just shy of straight up/down (PI/2) to avoid the camera flipping at the pole.
export const WALK_PITCH_LIMIT = 1.45
// Flying has no horizon to stay oriented against, so allow (almost) the full
// vertical range — straight up/down — rather than walking's smaller cap.
export const FLY_PITCH_LIMIT = 1.55

// -- Mobile joystick / world bounds --
export const JOY_RADIUS = 45
export const BOUNDS_MARGIN = 22
export const BOUNDS_MIN_HALF = 18
