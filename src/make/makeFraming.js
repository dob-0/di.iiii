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
// exactly far enough back that every object in it — measured one bounding
// sphere at a time, not as one union box — lands inside the frustum. Every
// number below falls out of that one idea; nothing is a magic distance.
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

// Air around the room. Small on purpose: the complaint this whole file answers
// is that the room did not fill the screen.
const MARGIN = 1.0

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
    // own aspect makes it, so a landscape phone photo is four metres across.
    // Symmetric in x and z because the toybox stands its pictures up facing
    // whichever way the camera is, and this file is asked for the box before
    // anybody knows which way that is.
    image: [1.7, 1.55, 1.7],
    video: [1.7, 1.55, 1.7]
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

const halfExtentForNode = (node) => {
    const scale = asTriple(node?.values?.scale, [1, 1, 1])
    return [
        UNKNOWN_HALF_EXTENT * Math.abs(scale[0]),
        UNKNOWN_HALF_EXTENT * Math.abs(scale[1]),
        UNKNOWN_HALF_EXTENT * Math.abs(scale[2])
    ]
}

/**
 * Everything standing in the room, as `{ position, radius }` — one bounding
 * sphere each. The list the fit is actually computed from.
 *
 * Spheres rather than one union box, and the difference is visible rather than
 * academic. Fitting the eight corners of a union box pairs the far-left X of
 * one object with the near Z of another and asks the camera to hold a corner
 * that nothing occupies. Measured on a real camp room with one photograph in
 * it, that cost about a third of the picture: the objects filled 66% of the
 * width when the arithmetic believed they filled 100%.
 */
export const placedItems = (projectDocument = null) => {
    const items = []
    const asSphere = (position, half) => ({
        position,
        radius: Math.hypot(half[0], half[1], half[2])
    })
    for (const entity of projectDocument?.entities || []) {
        const position = asTriple(entity?.components?.transform?.position, [0, 0, 0])
        items.push(asSphere(position, halfExtentForEntity(entity)))
    }
    for (const node of projectDocument?.nodes || []) {
        if (!nodeIsInTheRoom(node)) continue
        items.push(asSphere(asTriple(node.values.position), halfExtentForNode(node)))
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
            min[axis] = Math.min(min[axis], item.position[axis] - item.radius)
            max[axis] = Math.max(max[axis], item.position[axis] + item.radius)
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
 * Exact, and per object. For a sphere of radius r whose middle sits at (x, y,
 * z) in camera axes — x across, y up, z along the line of sight, all measured
 * from the point the camera is aimed at — the condition that it clears the left
 * and right planes of a frustum whose half-angle is θ is
 *
 *     d ≥ |x|/tanθ + r/sinθ − z
 *
 * and the same with the vertical half-angle for the top and bottom. The answer
 * is the largest of those over every object on both axes. The `r/sinθ` term is
 * the part a corner-of-a-box fit gets wrong: a frustum plane is slanted, so the
 * room a sphere needs beside it is not its radius but its radius divided by the
 * sine of the angle.
 */
export const distanceForItems = (items, target, aspect, bearing = 0, elevation = 0) => {
    const tanV = Math.tan((fovForAspect(aspect) / 2) * DEG)
    const safeAspect = Number(aspect) > 0 ? Number(aspect) : 1
    const tanH = tanV * safeAspect
    // sinθ from tanθ, without an arctangent round trip.
    const invSinH = Math.sqrt(1 + tanH * tanH) / tanH
    const invSinV = Math.sqrt(1 + tanV * tanV) / tanV

    // The camera basis at this bearing and elevation. `eye` points from the
    // middle of the room towards the camera; forward is its opposite.
    const cosE = Math.cos(elevation)
    const forward = [-Math.sin(bearing) * cosE, -Math.sin(elevation), -Math.cos(bearing) * cosE]
    const right = [Math.cos(bearing), 0, -Math.sin(bearing)]
    const up = [
        right[1] * forward[2] - right[2] * forward[1],
        right[2] * forward[0] - right[0] * forward[2],
        right[0] * forward[1] - right[1] * forward[0]
    ]

    let distance = MIN_DISTANCE
    for (const item of items) {
        const point = [
            item.position[0] - target[0],
            item.position[1] - target[1],
            item.position[2] - target[2]
        ]
        const across = point[0] * right[0] + point[1] * right[1] + point[2] * right[2]
        const rise = point[0] * up[0] + point[1] * up[1] + point[2] * up[2]
        const depth = point[0] * forward[0] + point[1] * forward[1] + point[2] * forward[2]
        distance = Math.max(
            distance,
            Math.abs(across) / tanH + item.radius * invSinH - depth,
            Math.abs(rise) / tanV + item.radius * invSinV - depth
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
