// WHERE THE CAMERA IS POINTING — from the three numbers a browser gives.
//
// The coach needs two things the picture itself cannot tell it: which way round
// the room the camera is aimed (for the ring of directions) and whether it is
// aimed above the horizon (for "keep the floor in frame"). Both are the
// direction of ONE line — the rear camera's optical axis — and both are wrong if
// they are read off the raw event.
//
// Reading `alpha` as "which way the camera points" is the mistake this file
// exists to avoid. `alpha` is where the device's TOP EDGE points, which for a
// phone held upright is at the sky, and for a phone turned sideways is 90° away
// from where the lens is looking. A ring filled from raw alpha turns when the
// person rolls the phone in their hand and does not turn when they walk round a
// pillar — exactly backwards.
//
// So: build the rotation the spec describes, push the camera's own axis through
// it, and read the answer off that.
//
// THE FRAMES. DeviceOrientationEvent gives an intrinsic Z–X′–Y″ rotation
// (alpha about Z, then beta about the new X, then gamma about the new Y) taking
// DEVICE coordinates to EARTH coordinates, where earth is X east, Y north, Z up
// (https://w3c.github.io/deviceorientation/). Device coordinates are X right
// across the screen, Y up the screen, Z out of the screen towards the face — so
// the REAR camera looks along device −Z, and nothing else in this file matters.
//
// Only the third column of the matrix is needed, which is why there is no matrix.
//
// WHAT IT IS NOT. A phone indoors sits inside a steel building next to its own
// speaker magnets, and its compass can be tens of degrees out; iOS reports no
// absolute heading at all unless `webkitCompassHeading` is present, and Android
// only through `deviceorientationabsolute`. The elevation comes from gravity
// instead of the magnetometer and is the trustworthy one of the two. Neither is
// used for anything that gets baked into the room — they drive two sentences on a
// screen and a ring of 36 marks, and a heading wrong by 30° still MOVES when the
// person turns, which is the only thing being counted.

const toRadians = (degrees) => (degrees * Math.PI) / 180
const toDegrees = (radians) => (radians * 180) / Math.PI

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Which way the rear camera is looking.
 *
 * @param {{alpha?: number|null, beta?: number|null, gamma?: number|null, compassHeading?: number|null}} reading
 *        the event's own fields. `compassHeading` is Safari's
 *        `webkitCompassHeading`: pass it and it replaces `alpha`, because on iOS
 *        `alpha` is measured from wherever the phone happened to be when the
 *        page opened and points at nothing.
 * @returns {{heading: number|null, elevation: number|null}}
 *        heading: degrees clockwise from north, or null when nothing absolute is
 *        known. elevation: degrees above the horizon, −90 straight down, +90
 *        straight up — available from beta and gamma alone, so it survives a
 *        refused or absent compass.
 */
export const cameraAim = ({ alpha = null, beta = null, gamma = null, compassHeading = null } = {}) => {
    if (!isNumber(beta) || !isNumber(gamma)) return { heading: null, elevation: null }
    const b = toRadians(beta)
    const g = toRadians(gamma)
    const cB = Math.cos(b)
    const sB = Math.sin(b)
    const cG = Math.cos(g)
    const sG = Math.sin(g)

    // The up-component of device −Z. R33 = cos(beta)cos(gamma), so the camera's
    // own up-component is −cos(beta)cos(gamma) and alpha does not appear: a
    // rotation about the vertical cannot change how high something points.
    // Flat on its back, beta = gamma = 0, gives −1 — the lens at the floor,
    // which is right. Turned sideways, |gamma| = 90, gives 0 — the horizon,
    // whatever beta says, which is why a landscape phone reads correctly
    // without anybody asking the screen which way up it is.
    const up = Math.max(-1, Math.min(1, -cB * cG))
    const elevation = toDegrees(Math.asin(up))

    // A compass heading stands in for alpha. `webkitCompassHeading` counts
    // clockwise from north and alpha counts anticlockwise, hence 360 − h.
    const absoluteAlpha = isNumber(compassHeading) ? (360 - compassHeading) : (isNumber(alpha) ? alpha : null)
    if (absoluteAlpha === null) return { heading: null, elevation }

    const a = toRadians(absoluteAlpha)
    const cA = Math.cos(a)
    const sA = Math.sin(a)
    // The east and north components of device −Z: −R13 and −R23.
    const east = -(cA * sG + sA * sB * cG)
    const north = -(sA * sG - cA * sB * cG)
    // Straight up or straight down: every heading is equally true, so none is
    // reported. A phone lying on its back must not fill a sector of the ring.
    if (Math.abs(east) < 1e-9 && Math.abs(north) < 1e-9) return { heading: null, elevation }
    const heading = ((toDegrees(Math.atan2(east, north)) % 360) + 360) % 360
    return { heading, elevation }
}

// HOW HIGH IS TOO HIGH. A reconstruction is built on the floor: the fitter finds
// which way is up by where the clutter is (docs/architecture/PLACE.md), and a
// walk that only ever shows walls and ceiling gives it nothing to stand the room
// on. A little above the horizon is fine and unavoidable — a person walks with
// the phone at chest height and a hall has a roof worth having. Ten degrees is
// where "showing me the room" becomes "showing me the ceiling".
export const FLOOR_LOST_ELEVATION = 10

// …and for two whole seconds, not for the moment somebody stepped over a cable.
export const FLOOR_LOST_MS = 2000

/**
 * The floor hint, from how long the camera has been pointing up.
 *
 * Deliberately a function of one duration rather than a timer of its own: the
 * surface already samples on a clock, and a hint that owns a timer is a hint
 * that fires after the walk has stopped.
 */
export const floorHint = (elevation, msAboveHorizon) => {
    if (!isNumber(elevation)) return ''
    if (elevation <= FLOOR_LOST_ELEVATION) return ''
    return msAboveHorizon >= FLOOR_LOST_MS ? 'keep the floor in frame' : ''
}
