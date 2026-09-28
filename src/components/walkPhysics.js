// Walk/fly movement physics for the first-person Walker — pure, no three.js,
// no React, so it can be stepped at any frame rate in a unit test.
//
// WHAT IT IS FOR: a person walking a venue (the MOXIR hall), not a shooter.
// Responsive but with weight: starts over about one step, stops in about one
// step with a soft tail, turns without ice, never snaps.
//
// THE MODEL (established, not invented) — Unreal Engine's
// `UCharacterMovementComponent::CalcVelocity` + `ApplyVelocityBraking`
// (Engine/Source/Runtime/Engine/Private/Components/CharacterMovementComponent.cpp,
// UE 4.x/5.x), the movement model behind most current third/first-person
// traversal games:
//   * Velocity lives in WORLD space. Input only chooses a direction; a mouse
//     flick turns the view, not the momentum. (Before this module the walker
//     kept forward/strafe speed in the VIEW frame, so a flick swung the whole
//     velocity round instantly.)
//   * With input: "friction affects our ability to change direction" —
//     v -= (v - dir*|v|) * min(dt*GroundFriction, 1), then v += a*dt, then v is
//     clamped to the max speed. The input vector is clamped to length 1 before
//     that (UE `ConstrainInputAcceleration` / `ScaleInputAcceleration`), so a
//     diagonal is no faster than straight ahead.
//   * Without input (or over the max after a sprint ends): braking,
//     dv/dt = -BrakingFriction*v - BrakingDeceleration*v̂, never reversing,
//     snapped to 0 under BRAKE_TO_STOP_VELOCITY (UE: 10 cm/s). The friction
//     term gives the soft exponential tail, the constant term ends it.
//   * With input but over the max (sprint released): brake, but never below the
//     max — UE's "don't allow braking to lower us below max if we have input".
//   * Fly = the same CalcVelocity in 3D (UE runs PhysFlying through it), with
//     the di.iiii "drone, not jet" rule kept: forward/strafe stay horizontal
//     whatever the pitch; altitude changes only through the explicit up/down.
//   * Leaving fly mode above (or below) eye height: the walker settles back
//     with a critically damped spring, speed-capped — Unity's
//     `Mathf.SmoothDamp`, after Thomas Lowe, "Critically Damped Ease-In/Ease-Out
//     Smoothing", Game Programming Gems 4 (2004), §1.10. No gravity drop: there
//     is no jump in a venue walk (owner, 2026-09-28).
//
// FRAME-RATE INDEPENDENCE: the physics runs on a FIXED tick (`WALK_TICK_HZ`)
// behind an accumulator, and the rendered pose is interpolated between the last
// two ticks — Glenn Fiedler, "Fix Your Timestep!" (gafferongames.com, 2004).
// Same keys held for the same wall-clock time => same trajectory at 30, 60,
// 144 or 240 fps (walkPhysics.test.js steps all four). Cost: the rendered pose
// trails the newest tick by < 1 tick (< 7.8 ms at 128 Hz).
//
// All numbers live in walkModeConfig.js with their sources.

import {
    WALK_TICK_HZ, WALK_MAX_FRAME_DELTA, EYE_HEIGHT,
    WALK_MAX_SPEED, WALK_SPRINT_FACTOR, WALK_MAX_ACCEL, WALK_TURN_FRICTION,
    WALK_BRAKING_FRICTION, WALK_BRAKING_DECEL, BRAKE_TO_STOP_VELOCITY,
    FLY_MAX_SPEED, FLY_MIN_ALT, FLY_MAX_ALT,
    SETTLE_SMOOTH_TIME, SETTLE_MAX_SPEED, STEP_SMOOTH_TIME, WALK_STEP_HEIGHT,
} from './walkModeConfig.js'

const EPS = 1e-6
const clampNum = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

export function createWalkBody(x = 0, y = EYE_HEIGHT, z = 0) {
    return { x, y, z, vx: 0, vy: 0, vz: 0, settleV: 0 }
}

// Input -> world-space wish vector, length clamped to 1 (analog keeps its
// magnitude). yaw follows the Walker's convention:
// forward = (sin yaw, 0, cos yaw), right = (-cos yaw, 0, sin yaw).
export function wishFromInput(input) {
    const yaw = input.yaw || 0
    const f = input.forward || 0
    const s = input.strafe || 0
    const u = input.fly ? (input.vert || 0) : 0
    const x = Math.sin(yaw) * f - Math.cos(yaw) * s
    const z = Math.cos(yaw) * f + Math.sin(yaw) * s
    const len = Math.hypot(x, u, z)
    if (len < EPS) return { dir: { x: 0, y: 0, z: 0 }, amount: 0 }
    return { dir: { x: x / len, y: u / len, z: z / len }, amount: Math.min(1, len) }
}

// UE ApplyVelocityBraking: dv = (-friction*v - decel*v̂)*dt; stop, never reverse.
export function applyBraking(v, friction, decel, dt) {
    const speed = Math.hypot(v.x, v.y, v.z)
    if (speed < EPS) { v.x = 0; v.y = 0; v.z = 0; return }
    const ox = v.x, oy = v.y, oz = v.z
    const k = 1 - friction * dt
    const d = decel * dt / speed
    v.x = v.x * k - ox * d
    v.y = v.y * k - oy * d
    v.z = v.z * k - oz * d
    if (v.x * ox + v.y * oy + v.z * oz <= 0) { v.x = 0; v.y = 0; v.z = 0; return }
    if (Math.hypot(v.x, v.y, v.z) <= BRAKE_TO_STOP_VELOCITY) { v.x = 0; v.y = 0; v.z = 0 }
}

// UE CalcVelocity for one tick. `max` = top speed for this input, `accel` =
// its acceleration, `brakeScale` scales the braking deceleration (fly speed).
export function calcVelocity(v, wish, max, accel, dt, brakeScale = 1) {
    // UE: MaxInputSpeed = MaxSpeed * AnalogInputModifier; "over max" is
    // measured against it, so easing a stick brakes smoothly, never snaps.
    const maxInput = max * wish.amount
    const speed = Math.hypot(v.x, v.y, v.z)
    const overMax = wish.amount > 0 && speed > maxInput + EPS
    if (wish.amount === 0 || overMax) {
        applyBraking(v, WALK_BRAKING_FRICTION, WALK_BRAKING_DECEL * brakeScale, dt)
        // With input, braking may not take us below the input's max.
        const after = Math.hypot(v.x, v.y, v.z)
        if (overMax && after < maxInput && after > EPS) {
            const s = maxInput / after
            v.x *= s; v.y *= s; v.z *= s
        }
    }
    if (wish.amount > 0) {
        // Direction change against friction — no ice, no snap.
        const vs = Math.hypot(v.x, v.y, v.z)
        const t = Math.min(dt * WALK_TURN_FRICTION, 1)
        v.x -= (v.x - wish.dir.x * vs) * t
        v.y -= (v.y - wish.dir.y * vs) * t
        v.z -= (v.z - wish.dir.z * vs) * t
        // UE: NewMaxInputSpeed = exceeding ? |v| : MaxInputSpeed.
        const cap = overMax ? Math.hypot(v.x, v.y, v.z) : maxInput
        v.x += wish.dir.x * accel * dt
        v.y += wish.dir.y * accel * dt
        v.z += wish.dir.z * accel * dt
        const ns = Math.hypot(v.x, v.y, v.z)
        if (ns > cap && ns > EPS) { const s = cap / ns; v.x *= s; v.y *= s; v.z *= s }
    }
}

// Unity Mathf.SmoothDamp (Lowe, GPG4): critically damped approach to target,
// with a speed cap. Returns [position, velocity].
export function smoothDamp(current, target, velocity, smoothTime, maxSpeed, dt) {
    const st = Math.max(0.0001, smoothTime)
    const omega = 2 / st
    const x = omega * dt
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
    let change = current - target
    const maxChange = maxSpeed * st
    change = clampNum(change, -maxChange, maxChange)
    const tgt = current - change
    const temp = (velocity + omega * change) * dt
    let newVel = (velocity - omega * temp) * exp
    let out = tgt + (change + temp) * exp
    if ((target - current > 0) === (out > target)) { out = target; newVel = (out - target) / dt }
    return [out, newVel]
}

/**
 * Advance the body by ONE fixed tick.
 * input: { forward, strafe, vert, yaw, fly, sprint, flySpeedScale }
 * env:   { confine?(x0, z0, x1, z1) -> {x, z}, eyeHeight?, solid? }
 * solid: the room's matter (walkCollider.js), all optional —
 *   ground(x, z, feetY) -> y | null   highest walkable ground under the feet
 *   walk(x, feetY, z)   -> {x, z}     body pushed out of walls
 *   fly(x, y, z)        -> {x, y, z}  camera pushed out of everything
 */
export function stepWalk(body, input, dt, env = {}) {
    const standing = env.eyeHeight ?? EYE_HEIGHT
    const solid = env.solid
    let eye = standing
    if (solid?.ground && !input.fly) {
        const g = solid.ground(body.x, body.z, body.y - standing)
        eye = (g ?? 0) + standing
    }
    const v = { x: body.vx, y: input.fly ? body.vy : 0, z: body.vz }
    const wish = wishFromInput(input)

    if (input.fly) {
        const scale = clampNum(input.flySpeedScale ?? 1, 0.01, 100)
        const max = FLY_MAX_SPEED * scale * (input.sprint ? WALK_SPRINT_FACTOR : 1)
        // Acceleration and braking scale with the fly speed, so a faster
        // camera starts and stops in the same time, just covering more ground.
        const accel = (WALK_MAX_ACCEL / WALK_MAX_SPEED) * FLY_MAX_SPEED * scale
        calcVelocity(v, wish, max, accel, dt, (FLY_MAX_SPEED / WALK_MAX_SPEED) * scale)
        let ny = body.y + v.y * dt
        if (ny < FLY_MIN_ALT) { ny = FLY_MIN_ALT; if (v.y < 0) v.y = 0 }
        if (ny > FLY_MAX_ALT) { ny = FLY_MAX_ALT; if (v.y > 0) v.y = 0 }
        body.y = ny
        body.settleV = v.y
    } else {
        const max = WALK_MAX_SPEED * (input.sprint ? WALK_SPRINT_FACTOR : 1)
        const flat = { dir: { x: wish.dir.x, y: 0, z: wish.dir.z }, amount: wish.amount }
        calcVelocity(v, flat, max, WALK_MAX_ACCEL, dt)
        v.y = 0
        if (Math.abs(body.y - eye) > 1e-4 || Math.abs(body.settleV) > 1e-4) {
            const smooth = Math.abs(body.y - eye) <= WALK_STEP_HEIGHT + 0.05 ? STEP_SMOOTH_TIME : SETTLE_SMOOTH_TIME
            const [ny, nv] = smoothDamp(body.y, eye, body.settleV, smooth, SETTLE_MAX_SPEED, dt)
            body.y = ny
            body.settleV = nv
        } else {
            body.y = eye
            body.settleV = 0
        }
    }

    // Horizontal move against the walkable areas. The areas are axis-aligned
    // rectangles and confine() slides per axis, so zeroing the blocked axis is
    // velocity clipping against an axis-aligned wall (UE SlideAlongSurface):
    // no speed is stored up pushing into a wall; the parallel part survives.
    const tx = body.x + v.x * dt
    const tz = body.z + v.z * dt
    const moved = env.confine ? env.confine(body.x, body.z, tx, tz) : { x: tx, z: tz }
    if (Math.abs(moved.x - tx) > EPS) v.x = 0
    if (Math.abs(moved.z - tz) > EPS) v.z = 0
    body.x = moved.x
    body.z = moved.z

    // Solid matter: push the body out, then clip the velocity against the push
    // direction (UE SlideAlongSurface) so pressing into a wall stores no speed
    // and moving along it keeps the parallel part.
    if (solid) {
        let n = null
        if (input.fly && solid.fly) {
            const r = solid.fly(body.x, body.y, body.z)
            n = { x: r.x - body.x, y: r.y - body.y, z: r.z - body.z }
            body.x = r.x; body.y = r.y; body.z = r.z
        } else if (!input.fly && solid.walk) {
            const r = solid.walk(body.x, body.y - standing, body.z)
            n = { x: r.x - body.x, y: 0, z: r.z - body.z }
            body.x = r.x; body.z = r.z
        }
        const len = n ? Math.hypot(n.x, n.y, n.z) : 0
        if (len > EPS) {
            const nx = n.x / len, ny = n.y / len, nz = n.z / len
            const into = v.x * nx + v.y * ny + v.z * nz
            if (into < 0) { v.x -= nx * into; v.y -= ny * into; v.z -= nz * into }
        }
    }
    body.vx = v.x; body.vy = v.y; body.vz = v.z
    return body
}

export function horizontalSpeed(body) {
    return Math.hypot(body.vx, body.vz)
}

/**
 * Fixed-tick simulator with render interpolation (Fiedler, "Fix Your Timestep!").
 * sim.body is the newest tick; sim.prev the tick before it.
 */
export function createWalkSim(x, y, z, tickHz = WALK_TICK_HZ) {
    const body = createWalkBody(x, y, z)
    return { body, prev: { x, y, z }, acc: 0, dt: 1 / tickHz, ticks: 0 }
}

// Move the body without physics (spawn, portal arrival, XR exit, wheel dolly).
// Clears interpolation so the camera does not smear across the jump.
export function teleportWalkSim(sim, x, y, z, { keepVelocity = false } = {}) {
    sim.body.x = x; sim.body.y = y; sim.body.z = z
    if (!keepVelocity) { sim.body.vx = 0; sim.body.vy = 0; sim.body.vz = 0; sim.body.settleV = 0 }
    sim.prev = { x, y, z }
}

/**
 * Advance by one RENDER frame of `frameDelta` seconds. Returns the interpolated
 * pose to draw. A frame longer than WALK_MAX_FRAME_DELTA (tab switch, GC) is
 * clamped so a stall cannot fling the visitor through a wall or spiral into
 * hundreds of catch-up ticks.
 */
export function advanceWalkSim(sim, input, frameDelta, env) {
    const d = clampNum(Number.isFinite(frameDelta) ? frameDelta : 0, 0, WALK_MAX_FRAME_DELTA)
    sim.acc += d
    while (sim.acc >= sim.dt - 1e-9) {
        sim.prev = { x: sim.body.x, y: sim.body.y, z: sim.body.z }
        stepWalk(sim.body, input, sim.dt, env)
        sim.acc -= sim.dt
        sim.ticks += 1
    }
    if (sim.acc < 0) sim.acc = 0
    const a = sim.acc / sim.dt
    return {
        x: sim.prev.x + (sim.body.x - sim.prev.x) * a,
        y: sim.prev.y + (sim.body.y - sim.prev.y) * a,
        z: sim.prev.z + (sim.body.z - sim.prev.z) * a,
    }
}

// -- Fly speed on the wheel. Unreal Editor's viewport fly mode (RMB held) and
// Blender's Walk/Fly navigation both put camera speed on the wheel while
// flying. One notch = x1.25, clamped to a band so a runaway trackpad cannot
// make the camera unusable.
export const FLY_SPEED_SCALE_MIN = 0.25
export const FLY_SPEED_SCALE_MAX = 4
export const FLY_SPEED_NOTCH_FACTOR = 1.25
export function nextFlySpeedScale(scale, notches) {
    const s = (scale || 1) * FLY_SPEED_NOTCH_FACTOR ** notches
    return clampNum(s, FLY_SPEED_SCALE_MIN, FLY_SPEED_SCALE_MAX)
}

// Head bob, off by default (CS2 removed cl_bob; most PC games ship it as an
// accessibility toggle because bob is a known motion-sickness trigger).
// `bob` is the viewer's setting: 0/false = off, 1/true = full amplitude,
// anything between scales it.
export function bobOffset(bobSetting, phase, speedFraction, amplitude) {
    const k = bobSetting === true ? 1 : Number(bobSetting) || 0
    if (k <= 0) return 0
    return Math.sin(phase) * amplitude * Math.min(1, k) * clampNum(speedFraction, 0, 1)
}
