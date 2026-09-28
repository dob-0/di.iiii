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
// The mouse under pointer lock is the reference, and it is set in the units
// a player already knows: an in-game sensitivity for a named game, plus the
// mouse's DPI, which together fix the cm of travel per 360° turn (the model
// and its sources live in lookSensitivity.js; each viewer can change all
// three in the Look panel, stored by lookSettings.js).
//
// Until 2026-09-28 this was one bare number, 0.0117 rad per movementX unit
// (0.67°; about 2.5 cm/360 at 800 DPI on the owner's DPR 1.5 screen) — ten to
// twenty times faster than players set their games. The default below is for
// walking a hall, not flick aiming: ~42 cm/360 at 800 DPI (eDPI 1000). The
// published pro median for CS2 is ~830 eDPI ≈ 50 cm/360 (ProSettings.net's
// tracked-player table, 2026); 1000 eDPI is the top of the "600–1000 eDPI"
// range the same guides call sensible, a little quicker than the pros because
// looking around a room turns farther and more often than holding an angle.
export const DEFAULT_LOOK_GAME = 'cs2'
export const DEFAULT_LOOK_SENS = 1.25
export const DEFAULT_LOOK_DPI = 800
// Vertical field of view in degrees (THREE.PerspectiveCamera.fov). 60 is
// what the walker has always used (≈ 91.5° horizontal at 16:9).
export const DEFAULT_LOOK_FOV = 60
export const LOOK_FOV_MIN = 40
export const LOOK_FOV_MAX = 100
// Every other method below is tuned in its OWN unit at the default feel and
// multiplied by lookFeelScale() (lookSettings.js) at run time, so a viewer who
// slows the mouse down slows the whole family with it instead of drifting out
// of sync one input method at a time. The numbers are unchanged from before
// 2026-09-28, so touch, trackpad and drag feel exactly as they did.
// Drag-look is the fallback used exactly when pointer lock is silently
// denied (Wayland and some other Linux browsers) — user-tuned live down
// from matching the old pointer-lock number (too sensitive) through 0.75x and
// 0.5x (still too sensitive each time) to 0.35x of 0.0117. Radians per CSS
// pixel of cursor travel.
export const DRAG_LOOK_SENSITIVITY = 0.0117 * 0.35
export const TOUCH_LOOK_SENSITIVITY = 0.005
export const TRACKPAD_LOOK_SENSITIVITY = 0.004
// Some Wayland setups GRANT pointer lock but then deliver useless movement
// deltas (relative motion broken at the compositor/portal) — a lock that can
// never look. Observed shapes (live event capture on KDE Wayland + Firefox,
// July 2026): all-zero deltas, a constant ±1,0 crawl, and small random noise
// in BOTH axes (±1..±4) while the user is physically sweeping the mouse —
// the same sweep produces 50-120px deltas the instant the lock is released.
// A locked move is "dead" when both |movementX| and |movementY| are at or
// under this ceiling; this many consecutive dead moves means the lock is
// broken: abandon it and stop re-requesting so drag-look takes over. A real
// slow look can trip this too — acceptable: drag-look remains fully usable.
export const BROKEN_LOCK_DEAD_DELTA_MAX = 4
export const BROKEN_LOCK_DEAD_MOVES = 30
// A window of that many small moves is broken only if it goes nowhere
// (|Σv| / Σ|v| under this) or repeats one identical delta — so a slow, real
// pan (coherent, ≈ 0.8–1) keeps its lock. The captured Wayland noise stream
// scores ≈ 0.4. Why and how: brokenLockDetector.js (2026-09-28).
export const BROKEN_LOCK_MIN_COHERENCE = 0.7
// The first locked move(s) after an engage carry garbage: one wild spike
// (-19,-116 in the live capture, ~18ms after engage — railed the pitch) and,
// in some Chromium builds, a synthetic position-sized event at engage time.
// Locked deltas inside this window are not APPLIED to the view (dead-streak
// counting still runs); a count-based "skip the first event" is not enough
// because the number of engage-time garbage events varies per browser.
export const BROKEN_LOCK_SETTLE_MS = 200

// -- Wheel / dolly --
// Metres of forward motion per scroll pixel: one classic wheel notch (~48px
// after line-mode normalisation) steps half a metre.
export const WHEEL_DOLLY_SPEED = 0.01

// -- Pitch limits --
// 89°, the Source/CS2 limit (cl_pitchup / cl_pitchdown default 89): straight
// down at your feet and up at the ceiling, one degree shy of the pole where
// lookAt's up-vector degenerates and the view flips. Was 1.45 rad (83°).
export const WALK_PITCH_LIMIT = (89 * Math.PI) / 180
// Flying has no horizon to stay oriented against, so allow a little more of
// the vertical range than walking — 89.5°, still never the pole itself.
export const FLY_PITCH_LIMIT = (89.5 * Math.PI) / 180

// -- Mobile joystick / world bounds --
export const JOY_RADIUS = 45
export const BOUNDS_MARGIN = 22
export const BOUNDS_MIN_HALF = 18
