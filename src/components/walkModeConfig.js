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
// Pointer-lock is the reference; every other method below is defined
// relative to it, so bumping this one value re-scales the whole family
// instead of drifting out of sync one input method at a time.
export const POINTER_LOCK_SENSITIVITY = 0.018
// Drag-look is the fallback used exactly when pointer lock is silently
// denied (Wayland and some other Linux browsers) — user-tuned live down
// from matching pointer-lock (too sensitive) through 0.75x and 0.5x
// (still too sensitive each time) to 0.35x.
export const DRAG_LOOK_SENSITIVITY = POINTER_LOCK_SENSITIVITY * 0.35
export const TOUCH_LOOK_SENSITIVITY = 0.005
export const TRACKPAD_LOOK_SENSITIVITY = 0.004
// Some Wayland setups GRANT pointer lock but then deliver useless movement
// deltas (relative motion broken at the compositor/portal) — a lock that can
// never look. Two observed shapes: all-zero deltas, and a degenerate constant
// crawl (movementY pinned to 0, movementX stuck at ±1 — live-diagnosed via
// ?inputdebug=1, July 2026). mousemove only fires on physical motion and real
// looking always produces varied deltas with vertical jitter, so this many
// consecutive dead locked moves (|movementX| ≤ 1 AND movementY === 0) means
// the lock is broken: abandon it and stop re-requesting so drag-look takes
// over.
export const BROKEN_LOCK_DEAD_MOVES = 30

// -- Wheel / dolly --
// Metres of forward motion per scroll pixel: one classic wheel notch (~48px
// after line-mode normalisation) steps half a metre.
export const WHEEL_DOLLY_SPEED = 0.01

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
