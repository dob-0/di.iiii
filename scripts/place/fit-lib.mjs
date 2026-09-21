// Standing the room up: the maths, with no files and no python, so it can be
// tested on numbers that were never a mesh.
//
// The reconstruction comes back in its own private frame — tipped however the
// camera was held, in units that mean nothing, centred nowhere. Three things
// fix it, in this order:
//
//   1. turn it so the floor plane's normal points at +Y (gravity up)
//   2. multiply it by one number so a metre is a metre
//   3. slide it so the floor is y = 0 and the room stands over the origin
//
// The turn is the only rotation applied, and it is the SHORTEST one that
// takes the floor normal to +Y — a room should not be spun about its own
// vertical axis by a fitting step; which way is "forward" is a decision, and
// decisions belong to the person, through --forward.

const EPSILON = 1e-8

export const normalize = (v) => {
    const length = Math.hypot(v[0], v[1], v[2])
    if (length < EPSILON) return [0, 1, 0]
    return [v[0] / length, v[1] / length, v[2] / length]
}

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
]

/** The shortest rotation taking unit vector `from` onto unit vector `to`, as [x,y,z,w]. */
export const quatFromTo = (from, to) => {
    const a = normalize(from)
    const b = normalize(to)
    const d = dot(a, b)
    if (d >= 1 - EPSILON) return [0, 0, 0, 1]
    if (d <= -1 + EPSILON) {
        // Exactly opposite: any perpendicular axis will do, so pick a stable one.
        let axis = cross([1, 0, 0], a)
        if (Math.hypot(...axis) < EPSILON) axis = cross([0, 0, 1], a)
        const [x, y, z] = normalize(axis)
        return [x, y, z, 0]
    }
    const axis = cross(a, b)
    const w = 1 + d
    const length = Math.hypot(axis[0], axis[1], axis[2], w)
    return [axis[0] / length, axis[1] / length, axis[2] / length, w / length]
}

export const applyQuat = (v, q) => {
    const [x, y, z, w] = q
    const ix = w * v[0] + y * v[2] - z * v[1]
    const iy = w * v[1] + z * v[0] - x * v[2]
    const iz = w * v[2] + x * v[1] - y * v[0]
    const iw = -x * v[0] - y * v[1] - z * v[2]
    return [
        ix * w + iw * -x + iy * -z - iz * -y,
        iy * w + iw * -y + iz * -x - ix * -z,
        iz * w + iw * -z + ix * -y - iy * -x
    ]
}

/**
 * Quaternion → Euler XYZ in radians, the order three.js (and therefore a
 * di.iiii entity's `transform.rotation`) reads.
 */
export const eulerFromQuaternion = (q) => {
    const [x, y, z, w] = q
    const x2 = x + x, y2 = y + y, z2 = z + z
    const xx = x * x2, xy = x * y2, xz = x * z2
    const yy = y * y2, yz = y * z2, zz = z * z2
    const wx = w * x2, wy = w * y2, wz = w * z2

    const m11 = 1 - (yy + zz), m12 = xy - wz, m13 = xz + wy
    const m22 = 1 - (xx + zz), m23 = yz - wx
    const m32 = yz + wx, m33 = 1 - (xx + yy)

    const clamped = Math.min(1, Math.max(-1, m13))
    const ey = Math.asin(clamped)
    if (Math.abs(m13) < 0.9999999) {
        return [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)]
    }
    return [Math.atan2(m32, m22), ey, 0]
}

/**
 * Everything the importer needs to place the model.
 *
 * @param {object} fit
 *   floorNormal  the floor plane's normal in the model's own frame, already
 *                pointing into the room
 *   bounds       {min,max} of the mesh AFTER the up-rotation, before scaling
 *   scale        metres per model unit
 */
export const fitTransform = ({ floorNormal, bounds, scale = 1 }) => {
    const quaternion = quatFromTo(floorNormal, [0, 1, 0])
    const rotation = eulerFromQuaternion(quaternion)
    const min = bounds.min.map((value) => value * scale)
    const max = bounds.max.map((value) => value * scale)
    // Floor onto y=0, and the room's footprint centred on the origin: a
    // visitor should arrive in a room, not beside one.
    const position = [
        -(min[0] + max[0]) / 2,
        -min[1],
        -(min[2] + max[2]) / 2
    ]
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
    return {
        quaternion,
        rotation,
        scale,
        position,
        // Where the room ends up once position/rotation/scale are applied.
        placedBounds: {
            min: [-size[0] / 2, 0, -size[2] / 2],
            max: [size[0] / 2, size[1], size[2] / 2]
        },
        size
    }
}

/**
 * The floor the walker may stand on: the room's footprint, pulled in from the
 * walls so nobody's nose ends up inside the plaster.
 */
export const walkableFromBounds = (placedBounds, inset = 0.6) => {
    const [minX, , minZ] = placedBounds.min
    const [maxX, , maxZ] = placedBounds.max
    const width = maxX - minX
    const depth = maxZ - minZ
    // Never inset a small room into nothing: at most a quarter of each side.
    const insetX = Math.min(inset, width / 4)
    const insetZ = Math.min(inset, depth / 4)
    return [{
        minX: minX + insetX,
        maxX: maxX - insetX,
        minZ: minZ + insetZ,
        maxZ: maxZ - insetZ
    }]
}

/**
 * Where the visitor arrives and which way they look.
 *
 * With a doorway found, they stand just inside it facing the middle of the
 * room — the shot a person gets walking in. With no doorway, they stand at
 * the near edge and look across. `forwardDegrees` overrules the yaw.
 */
export const spawnFrom = ({ placedBounds, door = null, forwardDegrees = null, eyeHeight = 1.6 }) => {
    const centreX = (placedBounds.min[0] + placedBounds.max[0]) / 2
    const centreZ = (placedBounds.min[2] + placedBounds.max[2]) / 2
    const depth = placedBounds.max[2] - placedBounds.min[2]
    const stand = door
        ? { x: door.x, z: door.z }
        : { x: centreX, z: placedBounds.max[2] - Math.min(1.5, depth / 4) }

    // Step in off the threshold, towards the middle.
    const toCentreX = centreX - stand.x
    const toCentreZ = centreZ - stand.z
    const distance = Math.hypot(toCentreX, toCentreZ) || 1
    const step = Math.min(1.5, distance / 2)
    const x = stand.x + (toCentreX / distance) * step
    const z = stand.z + (toCentreZ / distance) * step

    // di.iiii's walker reads yaw as a rotation about +Y with 0 looking down -Z.
    const yaw = forwardDegrees === null
        ? Math.atan2(centreX - x, -(centreZ - z))
        : (Number(forwardDegrees) * Math.PI) / 180
    return { x: round(x), z: round(z), yaw: round(yaw), pitch: 0, altY: eyeHeight }
}

const round = (value) => Math.round(value * 1000) / 1000

/**
 * place.json, written and read back the same. Everything a later step needs,
 * and nothing it has to recompute.
 */
export const buildPlaceRecord = ({
    glb, fit, door = null, scaleSource = 'none', scaleNote = '',
    floor = null, spawn = null, walkable = null, confidence = null
}) => ({
    tool: 'scripts/place/fit.mjs',
    version: 1,
    createdAt: new Date().toISOString(),
    glb,
    units: 'metres',
    // 'measured' — a person put a tape on something.
    // 'guess'    — we read a doorway off the mesh and called it 2.1 m.
    // 'none'     — nobody said, so the model is in its own units.
    scaleSource,
    scaleNote,
    transform: {
        position: fit.position.map(round),
        rotation: fit.rotation.map(round),
        scale: [round(fit.scale), round(fit.scale), round(fit.scale)]
    },
    size: fit.size.map(round),
    bounds: {
        min: fit.placedBounds.min.map(round),
        max: fit.placedBounds.max.map(round)
    },
    floor,
    door,
    spawn,
    walkableAreas: walkable,
    confidence
})

export const readPlaceRecord = (record) => {
    if (!record || record.version !== 1) return null
    const transform = record.transform || {}
    return {
        ...record,
        transform: {
            position: (transform.position || [0, 0, 0]).map(Number),
            rotation: (transform.rotation || [0, 0, 0]).map(Number),
            scale: (transform.scale || [1, 1, 1]).map(Number)
        }
    }
}
