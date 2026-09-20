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
