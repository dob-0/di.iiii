import * as THREE from 'three'

// Two ways of looking at the installation.
//
// INSIDE is the work: you are standing at the standpoint, the piece surrounds
// you, and you turn your head (or drag, on a monitor). This is the only view an
// audience ever gets.
//
// OUTSIDE is authoring furniture. The camera lifts out and orbits the
// standpoint so the whole installation is visible at once, with a marker
// showing exactly where the viewer's head will be. Composing a scene from
// inside it means judging what is behind you by memory; from outside you can
// see it.
//
// The maths is here, separate from the components, because "did the camera end
// up where I asked" is the part that breaks silently and the part that is
// worth a test.

export const VIEW_INSIDE = 'inside'
export const VIEW_OUTSIDE = 'outside'

// Where the viewer stands. Matches the camera position in
// AlgoVrithmExperience — one number, one meaning: the standpoint marker, the
// orbit pivot and the actual eye are all the same point, or the outside view is
// lying about where you will be.
export const STANDPOINT = Object.freeze({ x: 0, y: 1.6, z: 0 })

// What the outside camera actually orbits and aims at: the FLOOR under the
// standpoint, not the head.
//
// Aiming at eye height would put the optical centre at the middle of the view
// and throw everything floor-anchored — the standpoint ring, and the drag
// handles of every written sequence, which sit at the world origin — into the
// bottom of the frame. Orbiting the floor keeps that content centred.
export const ORBIT_PIVOT = Object.freeze({ x: 0, y: 0, z: 0 })

// Pulled back far enough to see the standpoint and the feed panel together.
export const DEFAULT_ORBIT = Object.freeze({
    yaw: 0.6,
    // Slightly above the horizon, looking down. A dead-level outside view reads
    // as another first-person shot and defeats the point.
    pitch: 0.34,
    distance: 6
})

/**
 * How far BELOW the pivot the outside camera aims, as a fraction of the orbit
 * distance. Zero — the camera looks straight at the pivot.
 *
 * KEPT AT ZERO RATHER THAN DELETED, because the reasoning is worth not
 * repeating. This was 0.22 for as long as the director panel floated over the
 * bottom of a full-window canvas: whatever the camera looked at landed at the
 * optical centre of the WINDOW, which was behind the panel, so the standpoint
 * marker and the drag handles sat underneath the very controls you would use on
 * them — indistinguishable from the gizmo failing to appear. Dropping the aim
 * point lifted them into the clear half above.
 *
 * The split layout removed the cause: the canvas has its own row now and
 * nothing covers it, so the optical centre of the canvas is a place you can
 * actually see. A compensation for an overlap that no longer exists is just an
 * unexplained downward tilt, and it would fight every framing judgement made
 * from the outside view.
 *
 * If a floating panel ever comes back over the stage, this is the dial.
 */
export const ORBIT_AIM_DROP = 0

/** Where the outside camera points. */
export const orbitAim = (distance, pivot = ORBIT_PIVOT) => ({
    x: pivot.x,
    y: pivot.y - clampOrbitDistance(distance) * ORBIT_AIM_DROP,
    z: pivot.z
})

export const MIN_ORBIT_DISTANCE = 1.5
export const MAX_ORBIT_DISTANCE = 80

// Same reason as LookAround's PITCH_LIMIT: at exactly straight up or down the
// up-vector is ambiguous and lookAt() rolls the horizon.
export const ORBIT_PITCH_LIMIT = THREE.MathUtils.degToRad(88)

export const clampOrbitPitch = (pitch) =>
    Math.min(ORBIT_PITCH_LIMIT, Math.max(-ORBIT_PITCH_LIMIT, pitch))

export const clampOrbitDistance = (distance) =>
    Math.min(MAX_ORBIT_DISTANCE, Math.max(MIN_ORBIT_DISTANCE, distance))

/**
 * Spherical orbit position around a pivot.
 *
 * Positive pitch is ABOVE the pivot, which is the intuitive reading of "tilt
 * up" for someone dragging. Yaw 0 puts the camera on +Z looking toward -Z, so
 * the default outside view faces the same direction the viewer will face — a
 * view from behind their shoulder rather than in their face.
 */
export const orbitPosition = ({ yaw, pitch, distance }, pivot = ORBIT_PIVOT) => {
    const safePitch = clampOrbitPitch(pitch)
    const safeDistance = clampOrbitDistance(distance)
    const horizontal = Math.cos(safePitch) * safeDistance

    return {
        x: pivot.x + Math.sin(yaw) * horizontal,
        y: pivot.y + Math.sin(safePitch) * safeDistance,
        z: pivot.z + Math.cos(yaw) * horizontal
    }
}

/** Wheel/pinch zoom. Multiplicative so each notch feels the same at any range. */
export const zoomOrbitDistance = (distance, deltaY, sensitivity = 0.0016) =>
    clampOrbitDistance(distance * Math.exp(deltaY * sensitivity))

/**
 * How far to push the fog out while looking from outside.
 *
 * Every sequence's fog is tuned for a viewer standing INSIDE it, so its far
 * plane sits a few metres away. Orbit out to see the whole pixel field and that
 * same fog swallows the installation into flat colour — the author is left
 * looking at the thing they were trying to see. Scaling the far plane while
 * outside keeps the fog honest inside and out of the way outside.
 */
export const OUTSIDE_FOG_SCALE = 6

export const isOutside = (view) => view === VIEW_OUTSIDE

/** The two views, toggled. Anything not OUTSIDE is treated as INSIDE. */
export const toggleView = (view) => (isOutside(view) ? VIEW_INSIDE : VIEW_OUTSIDE)
