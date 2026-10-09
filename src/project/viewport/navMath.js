// Small pure helpers shared by the navigation surfaces (walk, fly, Studio). Source of each rule is in docs/ai/navigation-spec.md.

/** Longest frame a navigation loop counts, seconds. A hidden tab or a GC stall must not become a jump (flyMotion maxDt is the same). */
export const NAV_MAX_DT = 0.1
export const clampDt = (dt, max = NAV_MAX_DT) => {
    const n = Number(dt)
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0
}

/** Frame-rate independent exponential approach of `value` to `target` with time constant `tau` s (1 - e^(-dt/tau)). */
export const damp = (value, target, tau, dt) => {
    if (!(tau > 0)) return target
    return value + (target - value) * (1 - Math.exp(-Math.max(0, dt) / tau))
}
/** Same as damp but from a rate lambda (1/s): the share of the gap left after dt is e^(-lambda dt). */
export const dampLambda = (value, target, lambda, dt) => damp(value, target, 1 / lambda, dt)

/**
 * Wheel event -> pixels. deltaMode 0 = pixels, 1 = lines (16 px), 2 = pages (100 px). Pure.
 * One mouse notch is 100 px; a surface applies its own gain on top.
 */
export const WHEEL_NOTCH_PX = 100
export const normalizeWheel = (e) => {
    const dy = Number(e?.deltaY)
    if (!Number.isFinite(dy)) return 0
    const mode = e?.deltaMode
    return mode === 1 ? dy * 16 : mode === 2 ? dy * 100 : dy
}
/** Notches (+ = wheel up = faster) from a wheel event: 100 px is one. */
export const wheelNotches = (e) => -normalizeWheel(e) / WHEEL_NOTCH_PX

/**
 * One walk step of the two velocity ramps (forward and strafe), each toward axis * maxSpeed (accel while its key is held, friction
 * otherwise), then the combined magnitude is clamped to maxSpeed so W+D is not 1.41x faster (the pure fly does the same,
 * flyMotion.js). Pure; dt is clamped to NAV_MAX_DT.
 */
export const stepWalkVelocity = ({ speed = 0, strafe = 0 }, { forward = 0, strafe: strafeIn = 0 }, dt, { maxSpeed, accel, friction }) => {
    const step = clampDt(dt)
    const ramp = (v, axis) => {
        const a = (axis !== 0 ? accel : friction) * step
        const next = v + Math.min(a, Math.max(-a, axis * maxSpeed - v))
        return Math.abs(next) < 0.001 ? 0 : next
    }
    let s = ramp(speed, forward)
    let t = ramp(strafe, strafeIn)
    const mag = Math.hypot(s, t)
    if (mag > maxSpeed) { s = (s / mag) * maxSpeed; t = (t / mag) * maxSpeed }
    return { speed: s, strafe: t }
}
