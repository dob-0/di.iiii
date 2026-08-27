// WHAT A PORTRAIT PHONE CAN SEE, AND WHERE TO STAND TO SEE IT.
//
// A project's `worldState.savedView` was framed by whoever last pressed save,
// on whatever screen they had — in practice a wide one. RawViewport renders it
// at a fixed vertical field of view and three.js derives the horizontal field
// from the aspect ratio, so a room that fits a laptop shows about a third of
// itself on a phone and everything else is off both edges.
//
// The first pass at this fixed the lens and stepped the camera back by a
// constant. Looked at on a real 390×844 screen, that was still wrong in the way
// that matters: the objects sat in a thin band across the middle, with an empty
// third above them and half a screen of receding floor below. The cause was the
// constant — a fixed ROOM_RADIUS of 3.4 metres, framed around the world origin,
// for rooms whose contents are neither that wide nor centred there.
//
// So: fit the CONTENT. Aim at the middle of what is in the room, and stand
// exactly far enough back that every object in it — measured one box at a time,
// on the camera's own axes, never as one union box and never as a sphere —
// lands inside the frustum. Every number below falls out of that one idea;
// nothing is a magic distance.
//
// Pure, and takes an aspect number and a plain document rather than an element
// or a renderer, so the framing can be checked without a canvas or a device.

const DEG = Math.PI / 180

// The lens. 50° is what every other Raw surface uses and what a wide screen
// wants. A tall screen gets a slightly wider one — not to see more (the fit
// below decides that) but because a long lens on a portrait phone flattens the
// room into a picture of itself. 60° still keeps a cube's near edges honest.
export const LANDSCAPE_FOV = 50
export const PORTRAIT_FOV = 60
// Below this the screen is tall enough to be treated as portrait.
const PORTRAIT_ASPECT = 1

// How steeply the eye looks down.
//
// This is the number that decides whether the screen is full. A room is wide
// and deep and barely tall; a phone is narrow and tall. Look at such a room
// from near floor level and its width fights the narrow axis while its depth
// collapses to nothing, which is precisely the thin band the first pass
// produced. Tip the eye over and the room's DEPTH maps onto the screen's long
// axis instead — the floor plan opens out and fills the height.
//
// 30° is as far as it goes, and it is chosen against the lens: at a 60° field
// the top of the frame then sits within a couple of degrees of the horizon, so
// the sky is a band rather than a third of the picture and the ground carries
// everything else. Past about 35° a child is looking at the tops of their own
// objects and can no longer see the FRONT of the thing they just coloured, and
// the horizon leaves the frame entirely, taking with it the one cue that says
// you are standing somewhere rather than reading a map.
//
// What no angle can do is make a wide room fill a tall screen. A camp room is
// about six metres across and four deep; a portrait phone is 0.58 as wide as it
// is tall. Fit that and the WIDTH is what binds — the room spans the full width
// and rather less of the height, and no elevation, lens or margin changes that
// ratio, only cropping does. So the height that is left over is given to the
// room's own ground and horizon rather than to black (MakeRoom's ambience), and
// the arc a child's objects land in was narrowed to stop the room getting wider
// still (makePlacement.js).
const PORTRAIT_ELEVATION_DEG = 30
const LANDSCAPE_ELEVATION_DEG = 18

// Air around the room. Small on purpose — the complaint this whole file answers
// is that the room did not fill the screen — but not zero: the half-extent
// table below is a good measurement of each object and not a perfect one, and
// the cost of being a few per cent short is a block cut in half by the screen
// edge, which is the failure this file exists to prevent.
const MARGIN = 1.05

// Never nearer than this even for a single small object, and never further than
// this for a room somebody scaled to the size of a town.
const MIN_DISTANCE = 3
const MAX_DISTANCE = 44

// An empty room still needs a frame. Half a small room, in metres.
const EMPTY_HALF_EXTENT = 2.2

// --- what is in the room -------------------------------------------------

const isNum = (value) => Number.isFinite(Number(value))

const asTriple = (value, fallback = null) => (
    Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(isNum)
        ? value.slice(0, 3).map(Number)
        : fallback
)

// Half the size of each shape at scale 1, straight off the creation defaults in
// src/shared/projectSchema.js. Restated rather than derived because the schema
// describes a shape's PARAMETERS (a cone's radius and height) and what a
// bounding box wants is its extent; the two only coincide for a box.
const HALF_EXTENTS = {
    box: [0.5, 0.5, 0.5],
    sphere: [0.6, 0.6, 0.6],
    cone: [0.55, 0.7, 0.55],
    cylinder: [0.45, 0.6, 0.45],
    torus: [0.68, 0.68, 0.18],
    plane: [1, 1, 1],
    // ImageObject sizes its plane three metres tall and as wide as the photo's
    // own aspect makes it, so a landscape phone photo is four metres across —
    // which is why the toybox stands its pictures at 0.6 scale (makePlacement),
    // and why these numbers are the FULL-SIZE ones: halfExtentForEntity
    // multiplies by the entity's own scale. Symmetric in x and z because a
    // picture is turned to face the camera and this file is asked for its box
    // before anybody knows which way that is.
    image: [1.85, 1.5, 1.85],
    video: [1.85, 1.5, 1.85]
}

// Anything whose size this file has no table for — a model, a video, a node
// visual. Generous rather than exact: an under-measured object gets cropped at
// the screen edge, which is the failure this file exists to prevent, and an
// over-measured one only costs a step backwards.
const UNKNOWN_HALF_EXTENT = 0.75

const halfExtentForEntity = (entity) => {
    const scale = asTriple(entity?.components?.transform?.scale, [1, 1, 1])
    const shape = entity?.components?.primitive?.shape || entity?.type
    if (entity?.components?.text) {
        // Text is drawn from a baseline, not from a centre, and its width is
        // the one extent here that depends on what somebody typed.
        const size = Number(entity.components.text.fontSize3D) || 0.45
        const length = String(entity.components.text.value || '').split('\n')
            .reduce((longest, line) => Math.max(longest, line.length), 1)
        return [
            Math.max(0.5, length * size * 0.34) * Math.abs(scale[0]),
            Math.max(0.4, size) * Math.abs(scale[1]),
            0.2 * Math.abs(scale[2])
        ]
    }
    const base = HALF_EXTENTS[shape] || [UNKNOWN_HALF_EXTENT, UNKNOWN_HALF_EXTENT, UNKNOWN_HALF_EXTENT]
    return [
        base[0] * Math.abs(scale[0]),
        base[1] * Math.abs(scale[1]),
        base[2] * Math.abs(scale[2])
    ]
}

// Nodes that stand in the room, as opposed to nodes that are wiring. A node
// with no position is not in the room at all; a `world.*` node is the room
// itself (the light, the grid, the mentor's camera) and framing the camera into
// its own shot is how a room ends up looking twice as wide as it is.
const nodeIsInTheRoom = (node) => (
    Boolean(asTriple(node?.values?.position)) && !String(node?.typeId || '').startsWith('world.')
)

// A spatial node states its own size on its values — `size` for a cube,
// `width`/`height` for a plane, `radius` for a ball — so ask it rather than
// assuming. Measured: the camp scaffold's picture plane is 2.2 x 1.4, and the
// blanket 0.75 guess this replaced under-measured it by a third, which showed
// up as the leftmost block of the room clipped by the screen edge.
//
// Symmetric in x and z, because a node carries a Y rotation this file does not
// resolve; a plane turned edge-on is measured as though it were facing you,
// which costs a step backwards and never a cropped edge.
const halfExtentForNode = (node) => {
    const values = node?.values || {}
    const scale = asTriple(values.scale, [1, 1, 1])
    const size = asTriple(values.size)
    let half = [UNKNOWN_HALF_EXTENT, UNKNOWN_HALF_EXTENT, UNKNOWN_HALF_EXTENT]
    if (size) {
        half = [size[0] / 2, size[1] / 2, size[2] / 2]
    } else if (isNum(values.width) || isNum(values.height)) {
        const width = Math.abs(Number(values.width) || 0) / 2
        const height = Math.abs(Number(values.height) || 0) / 2
        half = [Math.max(width, height), Math.max(height, width * 0.05), Math.max(width, height)]
    } else if (isNum(values.radius)) {
        const radius = Math.abs(Number(values.radius))
        half = [radius, isNum(values.height) ? Math.abs(Number(values.height)) / 2 : radius, radius]
    }
    return [
        Math.max(0.05, half[0]) * Math.abs(scale[0]),
        Math.max(0.05, half[1]) * Math.abs(scale[1]),
        Math.max(0.05, half[2]) * Math.abs(scale[2])
    ]
}

/**
 * Everything standing in the room, as `{ position, half }` — one box each,
 * measured out from its middle along the world axes. The list the fit is
 * actually computed from.
 *
 * One box PER OBJECT, and never one union box over all of them, and never a
 * bounding sphere either. Both shortcuts were tried and both were measured on
 * the real thing:
 *
 *   A union box makes the camera hold a corner nothing occupies — it pairs the
 *   far-left X of one object with the near Z of another.
 *
 *   A sphere is worse for the object that matters most here. A child's
 *   photograph is a flat rectangle; the sphere that contains it has the radius
 *   of its DIAGONAL, and because a frustum plane is slanted, a sphere costs the
 *   camera `r/sinθ` of standing-back — about 9 metres for one photograph on a
 *   390px screen. Measured: the room filled 61% of the width while the
 *   arithmetic believed it filled all of it.
 */
export const placedItems = (projectDocument = null) => {
    const items = []
    for (const entity of projectDocument?.entities || []) {
        items.push({
            position: asTriple(entity?.components?.transform?.position, [0, 0, 0]),
            half: halfExtentForEntity(entity)
        })
    }
    for (const node of projectDocument?.nodes || []) {
        if (!nodeIsInTheRoom(node)) continue
        items.push({ position: asTriple(node.values.position), half: halfExtentForNode(node) })
    }
    return items
}

/**
 * The box everything in the room occupies: `{ min, max, center, isEmpty }`.
 *
 * Used for the AIM and for deciding when a re-fit is due. The distance comes
 * from placedItems above.
 *
 * Never null — an empty project gets a small box around the origin, because
 * every caller here has to produce a camera either way and a null would only
 * move that decision somewhere with less to say about it.
 */
export const contentBounds = (projectDocument = null) => {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    const items = placedItems(projectDocument)

    for (const item of items) {
        for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis], item.position[axis] - item.half[axis])
            max[axis] = Math.max(max[axis], item.position[axis] + item.half[axis])
        }
    }

    if (!items.length) {
        return {
            min: [-EMPTY_HALF_EXTENT, 0, -EMPTY_HALF_EXTENT],
            max: [EMPTY_HALF_EXTENT, EMPTY_HALF_EXTENT, EMPTY_HALF_EXTENT],
            center: [0, EMPTY_HALF_EXTENT / 2, 0],
            isEmpty: true
        }
    }

    // The floor is part of the room. Without this a room of three low blocks is
    // framed on the blocks alone and the ground they stand on is cropped away,
    // which reads as objects hanging in the air.
    min[1] = Math.min(min[1], 0)

    return {
        min,
        max,
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
        isEmpty: false
    }
}

// --- the lens ------------------------------------------------------------

export const isPortraitAspect = (aspect) => Number(aspect) > 0 && Number(aspect) < PORTRAIT_ASPECT

export const fovForAspect = (aspect) => (isPortraitAspect(aspect) ? PORTRAIT_FOV : LANDSCAPE_FOV)

export const elevationForAspect = (aspect) =>
    (isPortraitAspect(aspect) ? PORTRAIT_ELEVATION_DEG : LANDSCAPE_ELEVATION_DEG) * DEG

// Which way "in front" is: the compass bearing from the middle of the room out
// towards wherever the saved view is taken from. Without this every room would
// be looked at down +Z, which is true of the camp scaffold and is not a promise
// any document makes.
export const bearingFromView = (savedView = null) => {
    const eye = asTriple(savedView?.position)
    const target = asTriple(savedView?.target)
    if (!eye || !target) return 0
    const dx = eye[0] - target[0]
    const dz = eye[2] - target[2]
    if (dx === 0 && dz === 0) return 0
    return Math.atan2(dx, dz)
}

/**
 * How far back to stand so every object lands inside the frustum.
 *
 * Exact, and per object. Turn each object's box onto the camera's own axes —
 * `across`, `rise` and `depth` for where its middle is, and `ex`, `ey`, `ez`
 * for how far it reaches along each of them (the support function of a box: the
 * sum of its half-extents projected onto that axis). Then the condition that it
 * clears the left and right planes of a frustum whose half-angle has tangent
 * `tanH` is
 *
 *     d ≥ (|across| + ex) / tanH − depth + ez
 *
 * and the same with the vertical tangent for the top and bottom. The answer is
 * the largest of those over every object on both axes. Slightly conservative
 * within one object — it pairs that object's widest corner with its nearest
 * face — and exactly right between objects, which is where the room was
 * actually being lost.
 */
export const distanceForItems = (items, target, aspect, bearing = 0, elevation = 0) => {
    const tanV = Math.tan((fovForAspect(aspect) / 2) * DEG)
    const safeAspect = Number(aspect) > 0 ? Number(aspect) : 1
    const tanH = tanV * safeAspect

    // The camera basis at this bearing and elevation. `forward` points from the
    // camera towards the middle of the room.
    const cosE = Math.cos(elevation)
    const forward = [-Math.sin(bearing) * cosE, -Math.sin(elevation), -Math.cos(bearing) * cosE]
    const right = [Math.cos(bearing), 0, -Math.sin(bearing)]
    const up = [
        right[1] * forward[2] - right[2] * forward[1],
        right[2] * forward[0] - right[0] * forward[2],
        right[0] * forward[1] - right[1] * forward[0]
    ]

    const project = (vector, axis) => vector[0] * axis[0] + vector[1] * axis[1] + vector[2] * axis[2]
    const reach = (half, axis) =>
        Math.abs(half[0] * axis[0]) + Math.abs(half[1] * axis[1]) + Math.abs(half[2] * axis[2])

    let distance = MIN_DISTANCE
    for (const item of items) {
        const point = [
            item.position[0] - target[0],
            item.position[1] - target[1],
            item.position[2] - target[2]
        ]
        const depth = project(point, forward)
        const ez = reach(item.half, forward)
        distance = Math.max(
            distance,
            (Math.abs(project(point, right)) + reach(item.half, right)) / tanH - depth + ez,
            (Math.abs(project(point, up)) + reach(item.half, up)) / tanV - depth + ez
        )
    }

    return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance * MARGIN))
}

/**
 * The whole frame: `{ target, position, fov, bearing, distance, elevation }`.
 *
 * `bearing` is a parameter rather than a reading so the surface can re-fit
 * around whichever way a child has already turned the room — a re-fit that
 * spins the view back to north is a re-fit that loses their place.
 */
export const fitToContent = (projectDocument, aspect, bearing = null) => {
    const bounds = contentBounds(projectDocument)
    const savedView = projectDocument?.worldState?.savedView || null
    const heading = Number.isFinite(bearing) ? bearing : bearingFromView(savedView)
    const elevation = elevationForAspect(aspect)
    const distance = distanceForItems(
        placedItems(projectDocument),
        bounds.center,
        aspect,
        heading,
        elevation
    )
    const cosE = Math.cos(elevation)
    const target = bounds.center
    return {
        target,
        position: [
            target[0] + Math.sin(heading) * cosE * distance,
            target[1] + Math.sin(elevation) * distance,
            target[2] + Math.cos(heading) * cosE * distance
        ],
        fov: fovForAspect(aspect),
        bearing: heading,
        distance,
        elevation,
        bounds
    }
}

// A saved view in the shape RawViewport reads at mount, from a fit. The rest of
// the authored view (`mode`, `zoom`, `near`, `far`) is carried through — this
// replaces where the eye stands, not what kind of eye it is.
export const savedViewFromFit = (savedView, fit) => ({
    ...(savedView || {}),
    target: fit.target,
    position: fit.position,
    fov: fit.fov
})
