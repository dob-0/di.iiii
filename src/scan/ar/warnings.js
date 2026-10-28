// LIVE WARNINGS — said BEFORE a blurry frame is taken, not counted after.
//
// The walk of 2026-10 kept 159 frames and 75 of them were too soft to match. The
// sharpness meter (sharpness.js) can only judge a frame once it exists. AR
// tracking knows how fast the phone moves NOW, so the blur can be predicted from
// the motion and a frame held back until it would be sharp.
//
// THE MODEL is the standard motion-blur approximation for a pinhole camera: the
// smear on the sensor during one exposure is
//
//     blur_px ≈ t_exp · f_px · (ω + v / d)
//
// ω the angular speed (rad/s), v the speed sideways (m/s), d the distance to
// what is looked at (m), f_px the focal length in pixels, t_exp the exposure.
// (Rotation dominates indoors; the v/d term is the parallax of moving past a
// surface at distance d.) A frame is held when the prediction passes
// BLUR_LIMIT_PX.
//
// WHAT IS ASSUMED: WebXR does not report the exposure. 1/60 s is assumed — the
// common auto-exposure ceiling indoors at 30 fps. f_px comes from the session's
// own projection when the page has it, else 900 px (a phone main camera at about
// 1080 px wide). Both are written into every warning so the sidecar shows what
// the decision rested on.
//
// TOO DARK and TOO CLOSE have no physics behind their numbers, only practice:
// below about 0.5 m a phone's depth and its overlap both fall apart (ARCore's Depth
// API guide gives 0.5–5 m as its best range), and a mean luma under 0.18 of full scale is where a
// phone's noise reduction starts smearing texture. They are settings, named as
// such, and the first real walks move them.

import { dot, forwardOf, length, quatAngle, scale, sub } from './arMath.js'

export const DEFAULT_CAMERA = { exposureSeconds: 1 / 60, focalPx: 900 }
// A setting: about two pixels of smear is where feature matching starts losing
// most of a frame's keypoints. To be checked against the first real walks.
export const BLUR_LIMIT_PX = 2
export const TOO_CLOSE_METRES = 0.5
export const TOO_DARK_LUMA = 0.18
// Calm, not flickering: a warning once raised stays this long.
export const HOLD_MS = 700

export const WARNING_WORDS = {
    fast: 'Slower — this frame would smear',
    dark: 'Too dark here — more light, or skip this part',
    close: 'Too close — step back'
}

/** Speed between two timed poses: { angular: rad/s, linear: m/s }. */
export const poseMotion = (previous, next) => {
    if (!previous || !next) return { angular: 0, linear: 0 }
    const seconds = (next.time - previous.time) / 1000
    if (!(seconds > 0)) return { angular: 0, linear: 0 }
    const velocity = scale(sub(next.pose.position, previous.pose.position), 1 / seconds)
    // Only the part of the motion ACROSS the view smears it; walking straight at a
    // wall mostly grows it in the frame.
    const forward = forwardOf(next.pose.orientation)
    const lateral = length(sub(velocity, scale(forward, dot(velocity, forward))))
    return {
        angular: quatAngle(previous.pose.orientation, next.pose.orientation) / seconds,
        linear: length(velocity),
        lateral
    }
}

export const motionBlurPx = ({ angular = 0, linear = 0, lateral = null }, distanceMetres, camera = DEFAULT_CAMERA) => {
    const d = Number.isFinite(distanceMetres) && distanceMetres > 0.1 ? distanceMetres : 3
    return camera.exposureSeconds * camera.focalPx * (angular + (lateral ?? linear) / d)
}

/**
 * The warnings this instant. `luma` 0..1 or null when unknown; `distance` metres
 * to what the centre of the view looks at, or null.
 */
export const readWarnings = ({ motion, distance = null, luma = null, camera = DEFAULT_CAMERA }) => {
    const blurPx = motionBlurPx(motion || {}, distance, camera)
    const active = []
    if (blurPx > BLUR_LIMIT_PX) active.push('fast')
    if (Number.isFinite(luma) && luma < TOO_DARK_LUMA) active.push('dark')
    if (Number.isFinite(distance) && distance < TOO_CLOSE_METRES) active.push('close')
    return { active, clear: active.length === 0, blurPx, assumed: { ...camera } }
}

/**
 * A warning shows the moment it is raised and stays at least HOLD_MS after it
 * clears, so the screen does not flash between two states at walking pace.
 * The gate (may a frame be kept now?) uses the RAW reading, not the held one:
 * holding is for the eye, not for the decision.
 */
export const createWarningFilter = ({ holdMs = HOLD_MS } = {}) => {
    const lastRaised = new Map()
    return (reading, now) => {
        for (const id of reading.active) lastRaised.set(id, now)
        const shown = []
        for (const [id, at] of lastRaised) {
            if (now - at <= holdMs) shown.push(id)
            else lastRaised.delete(id)
        }
        shown.sort((a, b) => Object.keys(WARNING_WORDS).indexOf(a) - Object.keys(WARNING_WORDS).indexOf(b))
        return shown
    }
}

/** Focal length in pixels of the image a projection matrix makes `width` wide. */
export const focalPxFromProjection = (projection, width) =>
    Array.isArray(projection) || ArrayBuffer.isView(projection) ? (projection[0] * width) / 2 : DEFAULT_CAMERA.focalPx
