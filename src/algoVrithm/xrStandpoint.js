import { STANDPOINT } from '../timeline/stageView.js'

// Making the headset agree with the browser about where the floor is.
//
// On a flat screen the camera is placed at the standpoint — eyes at 1.6m above
// a floor at y=0 — and the whole piece is composed around that: the tunnel's
// axis, the feed's centre and the chamber's panels are all set at eye height.
//
// In a headset NOBODY places the camera. The session is asked for a
// `local-floor` reference space and the headset answers with a head pose
// measured from the physical floor, so a viewer of any height stands correctly
// in a room whose floor is y=0. That is the right behaviour and this module
// leaves it alone.
//
// It exists for when the headset does NOT answer that way. A session that falls
// back to a `local` space reports the head at the origin instead of above the
// floor, and a headset whose floor was calibrated wrong reports it near enough
// to zero to be the same thing. Either way the eyes land on the floor, the
// installation towers overhead, and nothing in the app can tell from the API
// alone that anything went wrong — `local-floor` was requested and granted.
//
// So the check is empirical: measure where the head actually ended up. A
// standing person's eyes are never half a metre off the ground, and a piece
// that puts a viewer there is broken however the number was arrived at.

/** Eye height the piece is composed for. One number, shared with the flat camera. */
export const STANDPOINT_EYE = STANDPOINT.y

/**
 * Below this, a reported eye height cannot be a real one measured from a real
 * floor.
 *
 * Sitting in a chair puts the eyes around 1.2m, so the threshold has to clear
 * that: a seated viewer in a correctly calibrated room is not broken and must
 * not be lifted. Crouching is under it, and would be lifted — an acceptable
 * trade, because someone crouching for a second is far rarer than a session
 * that never had a floor to begin with.
 */
export const PLAUSIBLE_EYE_MIN = 0.9

/**
 * How many frames to wait before believing the measurement.
 *
 * The first frames of a session have no pose yet, and the camera still holds
 * the flat-screen position it was given before Enter VR — which reads as a
 * perfectly plausible 1.6m and would latch "nothing to fix" over the top of a
 * real problem. About a quarter of a second at headset frame rates.
 */
export const SETTLE_FRAMES = 20

/** True when the reported head height was measured from a floor. */
export const isFloorRelative = (eyeHeight) =>
    Number.isFinite(eyeHeight) && eyeHeight >= PLAUSIBLE_EYE_MIN

/**
 * How far to raise the play space so the viewer's eyes reach the standpoint.
 *
 * Zero whenever the headset is doing its job — a 1.9m viewer stays 1.9m tall
 * and looks down at a 1.6m feed, which is the whole point of world scale and
 * not something to "correct". The lift is only for the case where the reported
 * height is not a height at all.
 */
export const standpointLift = (eyeHeight) => {
    if (isFloorRelative(eyeHeight)) return 0
    return STANDPOINT_EYE - (Number.isFinite(eyeHeight) ? eyeHeight : 0)
}

/**
 * The measurement, in one line, for the author-only chrome.
 *
 * Worth rendering rather than logging: this is measured inside a headset, and
 * the person who needs to read it has just taken the headset off. A console in
 * a standalone browser is not somewhere they can go.
 */
export const describeEyeHeight = ({ eyeHeight, lift } = {}) => {
    if (!Number.isFinite(eyeHeight)) return 'eye height not measured'
    const measured = `eye ${eyeHeight.toFixed(2)}m`
    return lift
        ? `${measured} — no floor, lifted ${lift.toFixed(2)}m`
        : `${measured} — floor ok`
}
