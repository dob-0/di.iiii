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
// Eye 0.3 m above the floor plane (y = 0): low enough to film the ground, never
// under it. Was -2: the movement rig flew to -1.14 m, under the floor (2026-09-28).
export const FLY_MIN_ALT = 0.3
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

// -- Solid rooms (walkCollider.js) --
// The walking body is a capsule, the flying camera a sphere. Reference: Unreal
// ACharacter's default capsule (radius 34 cm, half-height 88 cm) and
// UCharacterMovementComponent::MaxStepHeight = 45 cm. TUNED: radius 30 cm so a
// 70 cm gap between two pillars stays passable; body 1.75 m (eye 1.6 + head).
export const WALK_BODY_RADIUS = 0.3
export const WALK_BODY_HEIGHT = 1.75
export const WALK_STEP_HEIGHT = 0.45
export const FLY_BODY_RADIUS = 0.3
// Stepping up/down a stair or riser edge: the eye follows the new ground over
// ~0.08 s instead of snapping (a step-smoothed camera, as games do), while a
// bigger change (leaving fly, dropping off a riser) keeps SETTLE_SMOOTH_TIME.
export const STEP_SMOOTH_TIME = 0.08
// The same in VR, as THREE.MathUtils.damp's lambda (1/s): ~1/0.08. A headset
// eye that snaps up a stair is the classic comfort failure; eased, it reads
// as a step (Half-Life: Alyx style smoothing).
export const XR_STEP_DAMPING = 12

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
// Inside this window only SPIKES are dropped (either axis above
// BROKEN_LOCK_SETTLE_SPIKE); ordinary moves apply at once. Dropping every
// move threw away ~320 ms of real look after each click (movement rig,
// 2026-09-28). Dead-streak counting runs regardless; a count-based "skip the
// first event" is not enough because the garbage count varies per browser.
export const BROKEN_LOCK_SETTLE_MS = 200
export const BROKEN_LOCK_SETTLE_SPIKE = 60

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
