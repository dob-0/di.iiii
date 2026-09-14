// Where a walker arriving on a PORTRAIT screen stands, so the doors are in the
// picture.
//
// An authored spawn is composed on a laptop. A 390px phone held upright sees
// a horizontal field about half as wide from the same spot, so an arc of doors
// spread either side of the view is cut off at both edges — the front room's
// outer two doors were never in frame on a phone, and when the arrival raced
// the room's document nothing at all was. The same answer the fixed-camera
// lane already gives (utils/cameraFraming.js → fitCameraToAspect): step back
// along the direction you are facing until what the laptop saw fits — never
// turn the visitor, never move them sideways.
//
// Pure, and in walker terms ({x, z, yaw, pitch, altY}; forward is
// (sin yaw, cos yaw)), so it can be applied to the spawn itself and not only to
// the camera — the flight lands where the walker stands, or the handover lurches.

const DEFAULT_FOV = 60
// Pulling back further than this leaves the doors as specks on a phone; past
// it, fitting fewer of them large beats fitting all of them tiny.
export const MAX_PULLBACK = 32
// Room around a door's ring so it does not touch the screen edge.
const EDGE_MARGIN = 1.5

const horizontalHalfTan = (fov, aspect) => Math.tan(((fov || DEFAULT_FOV) * Math.PI) / 360) * aspect

/**
 * @param {object} pose     walker pose
 * @param {Array}  doors    [{ x, z, radius }]
 * @param {number} aspect   width / height
 * @param {number} [fov]    vertical fov in degrees
 * @returns {object} the pose, moved back if a portrait screen needs it
 */
export const fitArrivalToDoors = (pose, doors, aspect, { fov = DEFAULT_FOV, maxPullback = MAX_PULLBACK } = {}) => {
    if (!pose || !Array.isArray(doors) || !doors.length) return pose
    if (!(aspect > 0) || aspect >= 1) return pose
    const fx = Math.sin(pose.yaw ?? 0)
    const fz = Math.cos(pose.yaw ?? 0)
    const tanH = horizontalHalfTan(fov, aspect)
    // What each door needs: how far back the visitor must stand for its whole
    // ring to be inside the horizontal field.
    const needs = doors
        .map((door) => {
            const dx = door.x - pose.x
            const dz = door.z - pose.z
            const ahead = dx * fx + dz * fz
            const lateral = Math.abs(dx * fz - dz * fx)
            const reach = lateral + (door.radius || 1) * EDGE_MARGIN
            return { ahead, need: reach / tanH - ahead }
        })
        .filter((d) => d.ahead > 0)
        .map((d) => Math.max(0, d.need))
        .sort((a, b) => a - b)
    if (!needs.length) return pose
    // The most doors that fit within the pullback allowance — always at least
    // the nearest one to the middle, whatever it costs.
    const within = needs.filter((need) => need <= maxPullback)
    const back = within.length ? within[within.length - 1] : needs[0]
    if (back <= 0.001) return pose
    return { ...pose, x: pose.x - fx * back, z: pose.z - fz * back }
}

// The doors of a document, in the terms above.
export const doorsOf = (entities = []) => entities
    .filter((e) => e?.type === 'portal'
        && e.components?.reference?.mode !== 'embed'
        && e.components?.runtime?.visible !== false
        && Array.isArray(e.components?.transform?.position))
    .map((e) => {
        const [x, , z] = e.components.transform.position
        const scale = e.components.transform.scale
        const s = Array.isArray(scale) ? Math.max(Math.abs(scale[0] ?? 1), Math.abs(scale[1] ?? 1)) : 1
        return { x, z, radius: 1.22 * s }
    })
