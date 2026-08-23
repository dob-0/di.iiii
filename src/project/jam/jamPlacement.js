// Where a new object lands in the jam surface.
//
// Studio places into a six-slot ring keyed to the global object count
// (StudioEditor's getViewPlacement), which is right for an editor whose camera
// is a saved orbit view: everyone opens on the same shot, so a ring around that
// shot is a sensible spread. In the jam it is exactly wrong — everyone opens on
// the same saved view, so twenty phones drop twenty objects into the same six
// spots and the scene reads as a pile rather than a place.
//
// Here the visitor IS somewhere: a first-person walker with a position and a
// heading. So the answer is the plain one — the object lands on the ground in
// front of them, where they are looking. All of this is ordinary vector maths
// on plain arrays, deliberately free of three.js so it can be read and tested
// without a renderer.

// How far in front the object lands when the look direction gives no ground
// answer of its own (looking at or above the horizon).
export const JAM_PLACEMENT_DISTANCE = 2
// Arm's reach, and the far edge of "where I am standing". A glance at a distant
// floor would otherwise fling the object across the scene, and a glance at your
// own feet would drop it inside you.
export const JAM_PLACEMENT_MIN_DISTANCE = 0.9
export const JAM_PLACEMENT_MAX_DISTANCE = 8
// One push of the nearer/further control.
export const JAM_NUDGE_STEP = 0.6

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

const asVector3 = (value) => {
    if (!Array.isArray(value) || value.length < 3) return null
    const [x, y, z] = value
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null
    return [x, y, z]
}

// The look direction flattened onto the ground, normalised. Returns null when
// the walker is staring straight up or down, where "forward" has no horizontal
// answer at all.
export const horizontalHeading = (direction) => {
    const vector = asVector3(direction)
    if (!vector) return null
    const [x, , z] = vector
    const length = Math.hypot(x, z)
    if (length < 1e-6) return null
    return [x / length, z / length]
}

/**
 * The walker's eye and its look direction, from the pose object the walker
 * mutates in place every frame ({ x, z, altY, yaw, pitch } — LiveProjectScene's
 * `playerRef`, handed out through its `walkerRef` prop).
 *
 * This is the same camera basis the walker itself builds each frame, written
 * out here as plain maths rather than read off a three.js camera: the camera
 * object lives inside the renderer's own tree, and the one question this
 * surface asks — "where is the floor in front of me, at the moment of the tap?"
 * — needs no renderer to answer.
 */
export const poseToRay = (pose = {}) => {
    const yaw = isFiniteNumber(pose.yaw) ? pose.yaw : 0
    const pitch = isFiniteNumber(pose.pitch) ? pose.pitch : 0
    const cosPitch = Math.cos(pitch)
    return {
        position: [
            isFiniteNumber(pose.x) ? pose.x : 0,
            isFiniteNumber(pose.altY) ? pose.altY : 1.6,
            isFiniteNumber(pose.z) ? pose.z : 0
        ],
        direction: [
            Math.sin(yaw) * cosPitch,
            Math.sin(pitch),
            Math.cos(yaw) * cosPitch
        ]
    }
}

export const clampPlacementDistance = (distance) => Math.min(
    JAM_PLACEMENT_MAX_DISTANCE,
    Math.max(JAM_PLACEMENT_MIN_DISTANCE, distance)
)

/**
 * The ground point a walker is looking at.
 *
 * Casts the camera ray at the y = 0 plane — the same plane Studio's
 * double-click insert uses (computeGroundPoint in StudioShell.jsx) — and clamps
 * the result to a reachable distance. When the ray never meets the ground
 * (level or upward look), falls back to a fixed step straight ahead, so there is
 * always an answer and the control never dead-ends.
 *
 * @param {number[]} cameraPosition [x, y, z] — the walker's eye, y > 0.
 * @param {number[]} cameraDirection [x, y, z] — unit-ish forward vector.
 * @returns {number[]} [x, 0, z]
 */
export const groundPointInFront = (cameraPosition, cameraDirection, {
    fallbackDistance = JAM_PLACEMENT_DISTANCE
} = {}) => {
    const eye = asVector3(cameraPosition) || [0, 1.6, 0]
    const heading = horizontalHeading(cameraDirection)
    const forward = heading || [0, -1]
    const direction = asVector3(cameraDirection)
    const eyeHeight = eye[1]

    // Downward ray meeting y = 0: eye + t * direction, solved for y.
    if (direction && direction[1] < -1e-6 && eyeHeight > 0) {
        const t = eyeHeight / -direction[1]
        const hitX = eye[0] + direction[0] * t
        const hitZ = eye[2] + direction[2] * t
        const reach = Math.hypot(hitX - eye[0], hitZ - eye[2])
        if (reach >= JAM_PLACEMENT_MIN_DISTANCE && reach <= JAM_PLACEMENT_MAX_DISTANCE) {
            return [hitX, 0, hitZ]
        }
        // Too close or too far — keep the DIRECTION of the look, clamp the reach.
        const clamped = clampPlacementDistance(reach)
        if (reach > 1e-6) {
            return [
                eye[0] + ((hitX - eye[0]) / reach) * clamped,
                0,
                eye[2] + ((hitZ - eye[2]) / reach) * clamped
            ]
        }
    }

    return [
        eye[0] + forward[0] * fallbackDistance,
        0,
        eye[2] + forward[1] * fallbackDistance
    ]
}

/**
 * Lift a ground point so an object of a given height sits ON the floor rather
 * than half-buried in it. Text is drawn from its own baseline and wants a
 * readable eye-level lift instead.
 */
export const restOnGround = (groundPoint, { standHeight = 0.5 } = {}) => {
    const point = asVector3(groundPoint) || [0, 0, 0]
    return [point[0], Math.max(0, standHeight), point[2]]
}

// How high the middle of a freshly added object sits above the ground, per
// type, so it RESTS on the floor instead of being half-buried in it. The
// numbers come straight from each type's creation defaults in
// src/shared/projectSchema.js (a sphere's radius is 0.6, a cone is 1.4 tall,
// and so on) — if those defaults ever move, these move with them.
//
// Text and a photo are the exceptions: they are things you read, so they hang
// at reading height rather than lying on the floor.
const STAND_HEIGHTS = {
    box: 0.5,
    sphere: 0.6,
    cone: 0.7,
    cylinder: 0.6,
    torus: 0.68,
    text: 1.4,
    image: 1.4,
    video: 1.4,
    model: 0
}

export const standHeightForType = (type) => (
    Object.prototype.hasOwnProperty.call(STAND_HEIGHTS, type) ? STAND_HEIGHTS[type] : 0.5
)

/**
 * The Y rotation that turns a flat-fronted object (text, a photo) around to
 * face the person who just added it. Objects face +Z when unrotated, and the
 * walker looks along (sin yaw, cos yaw), so facing back at them is half a turn
 * from their heading.
 */
export const facingViewerYaw = (yaw = 0) => {
    const turned = (yaw + Math.PI) % (Math.PI * 2)
    return turned < 0 ? turned + Math.PI * 2 : turned
}

/**
 * Push an object nearer to or further from the person who is looking at it,
 * along the horizontal line between them. `step` is metres; negative pulls it in.
 * Never crosses through the viewer — the near clamp is the same arm's reach the
 * initial placement uses.
 */
export const nudgeFromViewer = (objectPosition, cameraPosition, step = JAM_NUDGE_STEP) => {
    const object = asVector3(objectPosition) || [0, 0, 0]
    const eye = asVector3(cameraPosition) || [0, 1.6, 0]
    const dx = object[0] - eye[0]
    const dz = object[2] - eye[2]
    const reach = Math.hypot(dx, dz)
    if (reach < 1e-6) {
        return [object[0], object[1], object[2] + clampPlacementDistance(step)]
    }
    const nextReach = clampPlacementDistance(reach + step)
    return [
        eye[0] + (dx / reach) * nextReach,
        object[1],
        eye[2] + (dz / reach) * nextReach
    ]
}
