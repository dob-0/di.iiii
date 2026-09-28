// Single source of truth for "walk mode" (the first-person desktop/mobile
// walker used by the WCC exhibition, the landing page background, and
// PublicProjectViewer's Walk/Fly toggle — all three render the same Walker
// inside LiveProjectScene.jsx, so this is the one place to tune it).

// -- Movement --
// Target: a person walking a venue (the MOXIR hall), with game traversal feel —
// responsive, with weight, no ice, no snap. NOT shooter mechanics (owner,
// 2026-09-28: "feelings from the game move and sense not the shooter").
// The model is Unreal Engine's CharacterMovementComponent (see walkPhysics.js).
// UE's own defaults, for reference (CharacterMovementComponent constructor,
// UE 4.26-5.x): MaxWalkSpeed 600 cm/s, MaxAcceleration 2048 cm/s²,
// BrakingDecelerationWalking 2048 cm/s², GroundFriction 8,
// BrakingFrictionFactor 2 — tuned for a snappy character (stop from 6 m/s in
// ~0.11 s). We keep UE's MODEL and its turn friction, and choose slower,
// heavier values for walking a hall; the values below marked TUNED are ours,
// set by eye in the hall, not taken from a publication.
//
// Physics tick. Fixed so movement is identical at any render frame rate; the
// Walker interpolates between ticks (Fiedler, "Fix Your Timestep!", 2004).
export const WALK_TICK_HZ = 128
// A render frame longer than this (tab switch, GC stall) is clamped, so a
// stall is not replayed as a burst of movement. 0.25 s, not the usual 0.1:
// the owner's own browser renders the MOXIR hall on the Intel iGPU at 4-18 fps
// (measured 2026-09-28: median frame 224 ms while a game shared the machine),
// and a 0.1 s clamp would slow walking to half speed there. Collision is
// resolved per tick, so a long frame cannot tunnel through a wall.
export const WALK_MAX_FRAME_DELTA = 0.25
// Top walking speed. Half-Life 2's normal move speed (hl2_normspeed 190
// units/s at Valve's 1 unit = 1.905 cm => 3.62 m/s) — a game-traversal pace
// through built spaces, brisker than a real 1.4 m/s stroll, which reads as
// crawling on a flat screen. Was 5.2 per axis (7.35 m/s on a diagonal).
export const WALK_MAX_SPEED = 190 * 0.01905 // 3.62 m/s
// Shift = a gentle sprint (TUNED). HL2's sprint is 320/190 = 1.68x; 1.5x keeps
// the old 5.2 m/s pace one key away without a run feeling like a dash.
export const WALK_SPRINT_FACTOR = 1.5 // 5.43 m/s
// TUNED: 8 m/s² => 0 to 3.62 m/s in 0.45 s, about one step: steady walking
// speed is reached within the first step of gait initiation (Brenière & Do,
// J. Biomech. 19(12), 1986).
export const WALK_MAX_ACCEL = 8
// UE default GroundFriction: how fast velocity swings to a new direction
// (time constant 1/8 s) — this is what takes the ice out of a turn.
export const WALK_TURN_FRICTION = 8
// TUNED braking: friction 6/s (soft tail) + 2 m/s² (ends it) => from 3.62 m/s
// a stop in 0.41 s over 0.46 m — about one step length, the way a person
// stops walking within a step (Jaeger & Vanitchatchavan, J. Biomech. 25(9),
// 1992, termination of gait).
export const WALK_BRAKING_FRICTION = 6
export const WALK_BRAKING_DECEL = 2
// UE BRAKE_TO_STOP_VELOCITY = 10 cm/s.
export const BRAKE_TO_STOP_VELOCITY = 0.1
// Fly (free camera): the same model in 3D, vertical as fast as horizontal
// (was 4.5 vertical vs 5.2 horizontal). Base = the old horizontal pace; the
// wheel scales it while flying (walkPhysics.nextFlySpeedScale).
export const FLY_MAX_SPEED = 5.2
export const FLY_MIN_ALT = -2
export const FLY_MAX_ALT = 60
// Leaving fly: settle back to eye height with a critically damped spring
// (Unity SmoothDamp / Lowe GPG4), capped so a 60 m drop is a glide, not a fall.
export const SETTLE_SMOOTH_TIME = 0.35
export const SETTLE_MAX_SPEED = 8
// XR thumbstick locomotion keeps constant, instant velocity on purpose: Meta's
// VR locomotion comfort guidance (Meta Developer docs, "Locomotion" best
// practices) names acceleration as the main vection/sickness trigger, so a
// headset does NOT inherit the desktop model. Values unchanged from before
// (XR used WALK_MAX_SPEED 5.2 and FLY_SPEED 4.5) so hardware-verified XR feel
// stays exactly as it was.
export const XR_MOVE_SPEED = 5.2
export const FLY_SPEED = 4.5
// Head bob: off unless the viewer's look settings ask for it (bobOffset in
// walkPhysics.js). Amplitude at full setting, metres (was an always-on 5 cm).
export const BOB_AMPLITUDE = 0.015
// Radians of bob phase per metre walked (the old stride).
export const BOB_PHASE_PER_M = 1.8
export const TURN_SPEED = 1.6
export const EYE_HEIGHT = 1.6

// -- Look sensitivity, one per input method --
// Pointer-lock is the reference; every other method below is defined
// relative to it, so bumping this one value re-scales the whole family
// instead of drifting out of sync one input method at a time.
// 0.018 until 2026-08-24; owner asked for 35% less after walking the Dilijan
// hub on a desktop — at 0.018 a small sweep spun the room. Drag-look and its
// broken-lock fallback scale from this on purpose, so they calm down with it.
export const POINTER_LOCK_SENSITIVITY = 0.0117
// Drag-look is the fallback used exactly when pointer lock is silently
// denied (Wayland and some other Linux browsers) — user-tuned live down
// from matching pointer-lock (too sensitive) through 0.75x and 0.5x
// (still too sensitive each time) to 0.35x.
export const DRAG_LOOK_SENSITIVITY = POINTER_LOCK_SENSITIVITY * 0.35
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
// Just shy of straight up/down (PI/2) to avoid the camera flipping at the pole.
export const WALK_PITCH_LIMIT = 1.45
// Flying has no horizon to stay oriented against, so allow (almost) the full
// vertical range — straight up/down — rather than walking's smaller cap.
export const FLY_PITCH_LIMIT = 1.55

// -- Mobile joystick / world bounds --
export const JOY_RADIUS = 45
export const BOUNDS_MARGIN = 22
export const BOUNDS_MIN_HALF = 18
