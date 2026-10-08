// FLY MOTION — the keyboard flythrough of the orbit viewer as plain arithmetic: no React, no three, arrays in and arrays out, so it can be
// tested to the number and wired later (StudioViewport / SmartView) without changing here.
//
// Established practice this follows (pages read 2026-10-08; none of them gives a numeric default, so every number below that is not
// marked "source" is di.iiii's own and UNVALIDATED until someone flies a real scene with it):
//  - Blender 5.2 manual, Fly/Walk Navigation (docs.blender.org/manual/en/latest/editors/3dview/navigate/walk_fly.html): W/A/S/D move,
//    E/Q go up/down globally, wheel raises/lowers the speed, Shift speeds up while held, Alt slows down.
//  - Unreal Engine, viewport controls (dev.epicgames.com/documentation/en-us/unreal-engine/viewport-controls-in-unreal-engine): RMB held
//    + W/A/S/D, E/Q up/down in global space, the mouse wheel changes camera speed.
//  - Unity, Scene view navigation (docs.unity3d.com/Manual/SceneViewNavigation.html): flythrough with W/A/S/D and Q/E, Shift is faster,
//    the wheel sets the speed.
// So: the look direction steers (you fly where you look), Q/E move along the world's up axis, the wheel scales speed by a factor and
// Shift multiplies it. The ramp (velocity eases toward the wanted velocity) is the usual first-order lag; it is integrated in closed
// form so the distance flown does not depend on the frame rate.

/** Every number, with where it comes from. */
export const FLY_DEFAULTS = Object.freeze({
    // Metres per second at wheel step 0. Overridden per scene by speedForScene(). ours, unvalidated (the repo's walk speed is 5.2 m/s).
    baseSpeed: 6,
    // Seconds for the velocity to close 63 % of the gap to the wanted velocity when a key is held. ours, unvalidated.
    accelTime: 0.15,
    // The same when no key is held (time to roll out). Exponential, so it never overshoots or reverses. ours, unvalidated.
    stopTime: 0.12,
    // Shift multiplier. Blender, Unreal and Unity all have a held faster modifier but publish no factor. ours, unvalidated.
    sprintFactor: 3,
    // One wheel notch multiplies the speed by this (wheel -1 divides by it). Sources give "increase/decrease" only. ours, unvalidated.
    wheelStep: 1.25,
    // Speed range as a fraction of baseSpeed, so the wheel can never reach 0 or run away. ours, unvalidated.
    minSpeedFactor: 0.01,
    maxSpeedFactor: 100,
    // Q/E speed relative to W/S. Unreal and Unity move up/down at the camera speed, so 1. ours, unvalidated.
    verticalFactor: 1,
    // A frame longer than this (tab was hidden, debugger) counts as this long: no teleport after a stall. ours.
    maxDt: 0.1,
    // Below this speed (m/s) with no key held the camera is at rest, so it settles to exactly 0. ours.
    restSpeed: 0.001,
    // speedForScene(): seconds to cross the scene end to end at base speed. ours, unvalidated; see speedForScene.
    crossSeconds: 8,
    // speedForScene() range in m/s. ours.
    minBaseSpeed: 0.5,
    maxBaseSpeed: 200
})

const finite = (n, fallback) => (Number.isFinite(n) ? n : fallback)
const axis = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Math.max(-1, Math.min(1, finite(Number(v), 0))))
const len = (v) => Math.hypot(v[0], v[1], v[2])

/**
 * Base speed so that crossing a scene of this radius (metres) takes about `crossSeconds` (default 8 s): 2 * radius / N.
 * Why 8 s (ours, unvalidated): long enough that a 100 m hall is not skipped past, short enough that nobody holds W for a minute to get
 * to the far wall; the wheel (x0.01 to x100) covers everything else. Clamped to 0.5..200 m/s; a bad radius gives the default.
 */
export const speedForScene = (sceneRadius, params = FLY_DEFAULTS) => {
    const p = { ...FLY_DEFAULTS, ...params }
    if (!(Number.isFinite(sceneRadius) && sceneRadius > 0)) return p.baseSpeed
    return Math.min(p.maxBaseSpeed, Math.max(p.minBaseSpeed, (2 * sceneRadius) / p.crossSeconds))
}

/** Forward unit vector from yaw/pitch (radians). Yaw 0 looks along -Z (the three camera default), positive yaw turns left; pitch up is +. */
export const forwardFromYawPitch = (yaw, pitch) => {
    const cp = Math.cos(pitch)
    return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]
}

const lookOf = (input) => {
    const v = input.look
    if (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) && len(v) > 1e-9) return v.map((c) => c / len(v))
    return forwardFromYawPitch(finite(input.yaw, 0), finite(input.pitch, 0))
}

/** The state a flight starts from. */
export const flyStart = (pos = [0, 0, 0], params = FLY_DEFAULTS) => ({ pos: [...pos], vel: [0, 0, 0], speed: { ...FLY_DEFAULTS, ...params }.baseSpeed })

/**
 * One frame. Pure: returns a new state, never touches the argument.
 * state  = { pos:[x,y,z], vel:[x,y,z], speed }   speed is the current cruise speed in m/s (what the wheel changes)
 * input  = { forward, back, left, right, up, down  (boolean or -1..1), sprint:boolean, wheel:number (notches, + faster),
 *            yaw, pitch (radians)  OR  look:[x,y,z] a look vector (any length) }
 * dt     = seconds since the last frame; <= 0 or not a number leaves the camera where it is, large values are clamped to params.maxDt.
 * Frame-rate independence: for held keys the velocity is solved exactly (v = w + (v0 - w) e^(-dt/tau)) and the position gets the exact
 * integral, so 1 s of flight covers the same distance at 30 and 144 fps.
 */
export const flyStep = (state, input = {}, dt, params = FLY_DEFAULTS) => {
    const p = { ...FLY_DEFAULTS, ...params }
    const min = p.baseSpeed * p.minSpeedFactor
    const max = p.baseSpeed * p.maxSpeedFactor
    let speed = finite(state.speed, p.baseSpeed)
    const wheel = finite(input.wheel, 0)
    if (wheel !== 0) speed *= Math.pow(p.wheelStep, wheel)
    speed = Math.min(max, Math.max(min, speed))

    const pos = state.pos.map((c) => finite(c, 0))
    const vel = state.vel.map((c) => finite(c, 0))
    const step = Math.min(p.maxDt, finite(dt, 0))
    if (!(step > 0)) return { pos, vel, speed }

    const f = lookOf(input)
    // Right = forward x worldUp, flattened; looking straight up or down falls back to the yaw's right so A/D never flip.
    let right = [-f[2], 0, f[0]]
    right = len(right) > 1e-6 ? right.map((c) => c / len(right)) : [Math.cos(finite(input.yaw, 0)), 0, -Math.sin(finite(input.yaw, 0))]

    const fw = axis(input.forward) - axis(input.back)
    const rt = axis(input.right) - axis(input.left)
    const up = (axis(input.up) - axis(input.down)) * p.verticalFactor
    let wish = [0, 1, 2].map((i) => f[i] * fw + right[i] * rt + (i === 1 ? up : 0))
    const wl = len(wish)
    if (wl > 1) wish = wish.map((c) => c / wl) // diagonals are not faster than straight; analogue magnitudes below 1 are kept
    const target = wish.map((c) => c * speed * (input.sprint ? p.sprintFactor : 1))

    const tau = Math.max(1e-4, wl > 1e-9 ? p.accelTime : p.stopTime)
    const k = Math.exp(-step / tau)
    const outPos = [0, 0, 0]
    const outVel = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
        const d = vel[i] - target[i]
        outPos[i] = pos[i] + target[i] * step + d * tau * (1 - k)
        outVel[i] = target[i] + d * k
    }
    if (wl <= 1e-9 && len(outVel) < p.restSpeed) return { pos: outPos, vel: [0, 0, 0], speed }
    return { pos: outPos, vel: outVel, speed }
}
