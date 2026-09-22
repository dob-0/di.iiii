// Where a spot light entity's beam goes.
//
// three.js aims a SpotLight from its own position at `light.target`, and a
// fresh SpotLight's target is a bare Object3D sitting at the origin of the
// light's parent space. Both renderers used to mount `<spotLight/>` with no
// target at all, so EVERY spot light in a room aimed at (0,0,0) and its own
// rotation did nothing whatsoever. This module is the pure half of the fix:
// it says which local direction a spot light points in when it is unrotated,
// and works out where the aim lands once a rotation is applied.
//
// THE FORWARD AXIS, and why it is not the one shapes use.
//
// An *entity* in di.iiii faces +Z when unrotated -- `vector.aim` says so in as
// many words ("'Face' means the flat +Z side, the way a monitor faces you",
// src/project/nodes/vector.aim/runtime.js) and `facingViewerYaw` repeats it
// ("Objects face +Z when unrotated", src/project/jam/jamPlacement.js). That is
// the convention for things with a front: text, a photo, a video.
//
// A spot light has no front. It has an aperture, and in this codebase that
// aperture is already drawn pointing DOWN: the marker mesh beside the light in
// EntityContent is a `coneGeometry`, whose tip is at +Y and whose open mouth is
// at -Y. More decisively, -Y is what every already-published room is lit by.
// Today's spot is a fixture hung at some height with no rotation, aiming at the
// world origin -- which, for a light hung above the origin, IS straight down.
// Adopting +Z here would swing every one of those beams from the floor to the
// horizon and darken rooms nobody asked us to touch; -Y leaves the canonical
// case pixel-identical and only moves the lights that were already aiming at
// the wrong place (the ones hung off-centre, and the ones someone rotated).
//
// So: **local forward is -Y for a spot light.** One constant, one flip, if the
// owner would rather have the shape convention and take the re-lighting cost.
export const SPOT_LOCAL_FORWARD = Object.freeze([0, -1, 0])

/**
 * The target's position in the light entity's own local space.
 *
 * Only the DIRECTION matters to three.js -- it normalises
 * (light.position - target.position) -- so the length is arbitrary. One metre
 * keeps the object near the light it belongs to, which matters because the
 * target rides in the scene graph as a sibling of the light and would otherwise
 * be a stray Object3D sitting metres away in every bounding-box computation.
 *
 * @param {number} [reach] distance along local forward, in metres
 * @returns {[number, number, number]}
 */
export const spotTargetOffset = (reach = 1) => {
    const d = Number.isFinite(reach) && reach > 0 ? reach : 1
    return [SPOT_LOCAL_FORWARD[0] * d, SPOT_LOCAL_FORWARD[1] * d, SPOT_LOCAL_FORWARD[2] * d]
}

/**
 * The unit direction a spot light points in, given the entity's rotation.
 *
 * Euler angles in radians, XYZ order -- the same order three.js applies by
 * default and the same order `components.transform.rotation` is fed to a
 * <group>, so R = Rx * Ry * Rz. Pure arithmetic on purpose: no three import,
 * so it can be reasoned about and tested without a WebGL context.
 *
 * This is NOT what positions the target at runtime -- the target is a child of
 * the entity's transform group, so the scene graph rotates it for free, which
 * is also the only thing that stays correct when an entity is nested inside a
 * parent group (its `transform` is local, not world). This function is the
 * statement of what that arrangement is supposed to produce, and the tests hold
 * the renderer to it.
 *
 * @param {[number, number, number]} [rotation] euler XYZ, radians
 * @returns {[number, number, number]} unit vector in the entity's parent space
 */
export const spotAimDirection = (rotation) => {
    const rx = Number.isFinite(rotation?.[0]) ? rotation[0] : 0
    const ry = Number.isFinite(rotation?.[1]) ? rotation[1] : 0
    const rz = Number.isFinite(rotation?.[2]) ? rotation[2] : 0
    let [x, y, z] = SPOT_LOCAL_FORWARD

    // Rz
    const cz = Math.cos(rz), sz = Math.sin(rz)
    ;[x, y] = [x * cz - y * sz, x * sz + y * cz]
    // Ry
    const cy = Math.cos(ry), sy = Math.sin(ry)
    ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
    // Rx
    const cx = Math.cos(rx), sx = Math.sin(rx)
    ;[y, z] = [y * cx - z * sx, y * sx + z * cx]

    const len = Math.hypot(x, y, z) || 1
    return [x / len, y / len, z / len]
}

// ---------------------------------------------------------------------------
// PAN AND TILT — the two numbers a lighting person actually aims with.
//
// A rig is aimed in the language of the fixture: TILT is how far the lamp has
// been swung off straight-down (0 = dead down on the deck, 90 = flat along the
// floor, past 90 = an uplight pointing back up), and PAN is which way round the
// vertical that swing is pointed (0 = toward -Z, the way the room's default
// camera looks; positive turns anticlockwise seen from above). Degrees, because
// nobody on a ladder thinks in radians.
//
// Underneath there is only `components.transform.rotation` -- no new field, no
// new op, nothing for an old document to be missing. This module converts, and
// it is the ONLY place the conversion is written down.
//
// Why pan is not simply rotation.y: under three.js's XYZ euler order the spot's
// forward vector IS the Y axis, so yaw cannot move the beam at all (pinned in
// spotLightAim.test.js). Pan therefore has to be spent on rotation.z and tilt
// shared between rotation.x and rotation.z. Solving
//   d(pan, tilt) = (-sin t sin p, -cos t, -sin t cos p)
// against the direction this module already defines for a rotation gives
//   rotation.z = -asin(sin t sin p)
//   rotation.x =  atan2(sin t cos p, cos t)
// which is what rotationFromPanTilt writes, with rotation.y set to 0.
//
// The yaw has to go, and that is worth stating because the existing note says
// yaw is inert. It is inert ONLY while roll is zero: the spot's forward vector
// starts along Y, so Ry (applied second, after Rz) does nothing to it -- but the
// moment Rz has tipped the vector off the Y axis, Ry turns it round the vertical
// like a pan. `spotAimDirection([0,1.2,0.8])` and `spotAimDirection([0,0,0.8])`
// are two different beams at the same height. So pan/tilt is the canonical
// spelling of an aim and it spells yaw 0; leaving an authored yaw in place would
// mean the beam did not land where the pan said.
export const RAD_TO_DEG = 180 / Math.PI
export const DEG_TO_RAD = Math.PI / 180

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback)
// Float noise only: asin/atan2 hand back 44.99999999999999, and a person reading
// an inspector should see 45. Four places is far finer than any lamp is aimed.
const tidy = (n) => Math.round(n * 1e4) / 1e4 + 0
// Radians are what the renderer consumes, so they are only cleaned of the last
// bits of float dust -- rounding them as hard as the degrees a person reads
// would show up as a tilt of 90.0002 on the way back.
const tidyRad = (n) => Math.round(n * 1e9) / 1e9 + 0

/**
 * Where a spot light is aimed, in the fixture's own language.
 *
 * @param {[number, number, number]} [rotation] euler XYZ, radians
 * @returns {{ pan: number, tilt: number }} degrees; tilt 0..180, pan -180..180
 */
export const panTiltFromRotation = (rotation) => {
    const [x, y, z] = spotAimDirection(rotation)
    const tilt = Math.acos(clamp(-y, -1, 1))
    // Straight down (or straight up) has no direction round the vertical to
    // report -- every pan gives the same beam. 0 rather than a number made up
    // out of float dust.
    const flat = Math.sin(tilt)
    // atan2 on a NEGATIVE ZERO x returns -pi, so a lamp aimed at pan 180 read
    // back as -180 and the slider jumped from one end of its travel to the
    // other after a write. Same beam either way; `+ 0` normalises the -0 that
    // rotationFromPanTilt's sin() hands back at exactly half a turn.
    const pan = Math.abs(flat) < 1e-9 ? 0 : Math.atan2(-x + 0, -z)
    return { pan: tidy(pan * RAD_TO_DEG), tilt: tidy(tilt * RAD_TO_DEG) }
}

/**
 * The rotation that aims a spot light at a given pan and tilt.
 *
 * @param {{ pan?: number, tilt?: number }} aim degrees
 * @returns {[number, number, number]} euler XYZ, radians, yaw 0
 */
export const rotationFromPanTilt = ({ pan, tilt } = {}) => {
    const p = finite(pan) * DEG_TO_RAD
    const t = clamp(finite(tilt), 0, 180) * DEG_TO_RAD
    const rz = -Math.asin(clamp(Math.sin(t) * Math.sin(p), -1, 1))
    const rx = Math.atan2(Math.sin(t) * Math.cos(p), Math.cos(t))
    return [tidyRad(rx), 0, tidyRad(rz)]
}
