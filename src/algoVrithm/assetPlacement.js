import { STANDPOINT } from './stageView.js'

// Polar placement for asset clips — and the inverse, so drag handles can write
// back into it.
//
// The viewer never moves and never walks to find anything, so an asset is
// described relative to where they stand: how far in front, how high, how far
// round, how big. Four numbers a non-technical author can reason about, which
// is why the director panel offers them as fields and why they are staying.
//
// The problem this file solves: the placement maths used to live inside
// AssetClip, which meant the asset's *content* was offset several metres from
// the group the drag handles attach to. The handles appeared on the floor at
// the viewer's feet while the picture floated four metres away — which reads
// exactly like the gizmo being missing.
//
// Lifting it out lets the group itself sit where the asset sits, so the handles
// land on the thing. Dragging then converts back to the same four numbers the
// panel fields edit, and the two controls stay one source of truth.

const EYE_HEIGHT = STANDPOINT.y

export const DEFAULT_PLACEMENT = Object.freeze({
    distance: 4,
    size: 2.4,
    height: 0,
    // Degrees clockwise from straight ahead. Non-zero puts the asset in
    // peripheral vision — worth it for a headset, wrong for a flat screen
    // where anything past ~30° is simply off the edge of the frame.
    bearing: 0
})

// An asset dragged onto the standpoint itself has no defined bearing and would
// render inside the viewer's head.
export const MIN_DISTANCE = 0.3
export const MIN_SIZE = 0.05

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback)

export const resolvePlacement = (asset) => {
    const source = asset ?? {}
    return {
        distance: Math.max(MIN_DISTANCE, finite(source.distance, DEFAULT_PLACEMENT.distance)),
        size: Math.max(MIN_SIZE, finite(source.size, DEFAULT_PLACEMENT.size)),
        height: finite(source.height, DEFAULT_PLACEMENT.height),
        bearing: finite(source.bearing, DEFAULT_PLACEMENT.bearing)
    }
}

const toRadians = (degrees) => (degrees * Math.PI) / 180
const toDegrees = (radians) => (radians * 180) / Math.PI

/** Polar placement -> world position, with the viewer standing at the origin. */
export const placementPosition = (placement) => {
    const radians = toRadians(placement.bearing)
    return [
        Math.sin(radians) * placement.distance,
        EYE_HEIGHT + placement.height,
        -Math.cos(radians) * placement.distance
    ]
}

/** Assets always face the viewer, so bearing is also the group's Y rotation. */
export const placementRotation = (placement) => [0, toRadians(placement.bearing), 0]

export const roundPlacementValue = (value) => Math.round(value * 1000) / 1000

/**
 * World position -> polar placement. The inverse of placementPosition, used
 * when a drag handle has moved the group and the four numbers have to catch up.
 *
 * `previous` supplies the bearing when the asset has been dragged onto the
 * standpoint: at zero distance every bearing is the same point, so atan2 would
 * return an arbitrary one and the asset would spin as it was dragged through
 * the centre.
 */
export const positionToPlacement = ([x, y, z], previous = DEFAULT_PLACEMENT) => {
    const distance = Math.hypot(x, z)
    const bearing = distance < 1e-4 ? previous.bearing : toDegrees(Math.atan2(x, -z))

    return {
        distance: roundPlacementValue(Math.max(MIN_DISTANCE, distance)),
        height: roundPlacementValue(y - EYE_HEIGHT),
        // Normalised to -180..180 so dragging round the back reads as -170
        // rather than 190 in the panel field, whose min is -180.
        bearing: roundPlacementValue(((bearing + 540) % 360) - 180)
    }
}

/** Gizmo scale is a factor; `size` is a height in metres. */
export const scalePlacementSize = (size, factor) =>
    roundPlacementValue(Math.max(MIN_SIZE, size * (Number.isFinite(factor) ? factor : 1)))
