import { restOnGround, standHeightForType } from '../project/jam/jamPlacement.js'

// WHERE A NEW THING LANDS.
//
// The jam places what you add where you are looking, because in the jam you are
// standing inside the room. Here the child is outside it, looking in — so
// "where you are looking" is one fixed spot, and six taps would stack six
// shapes inside each other.
//
// Two rules, both learned by looking at it rather than by reasoning about it:
//
//   1. IN FRONT OF THE ROOM, never in it. Every camp project arrives with a
//      mentor's scaffold already standing near the middle — a title, two
//      blocks, a picture plane, all inside a radius of about two. A ring
//      starting at 1.7 dropped a child's first ball exactly on top of one of
//      those blocks (screenshot 23 of the 2026-08-26 pass). So new things fill
//      the empty floor between the room and the camera, which is both unoccupied
//      and, on a portrait screen, the largest empty part of the picture.
//
//   2. IN AN ARC, widening. Left to right first, because that is how a phone
//      screen is read, then a step further out. Never behind the room, where a
//      child would have to orbit to discover that anything had happened at all.
//
// Pure, and takes a count and a bearing rather than a document, so the
// arrangement can be checked without a renderer, a canvas or a device.

// How many land in one arc before it steps outward.
const PER_ARC = 4
// Clear of the scaffold's outermost piece, and inside the radius makeFraming.js
// fits the camera to, so the first thing a child makes is already in frame.
const FIRST_RADIUS = 2.6
const ARC_STEP = 1.25
// Half the arc, in radians — about 65°, so the widest slot is still well inside
// a portrait frame.
const ARC_HALF = 1.14

export const makePlacementPosition = (type, index = 0, { bearing = 0, origin = [0, 0, 0] } = {}) => {
    const safeIndex = Math.max(0, Math.floor(index) || 0)
    const arc = Math.floor(safeIndex / PER_ARC)
    const slot = safeIndex % PER_ARC
    // Slots spread across the arc; each further arc is offset half a slot so a
    // thing never sits directly behind the thing before it.
    const spread = (PER_ARC > 1 ? (slot / (PER_ARC - 1)) * 2 - 1 : 0)
    const angle = bearing + spread * ARC_HALF + (arc % 2 ? ARC_HALF / (PER_ARC - 1) : 0)
    const radius = FIRST_RADIUS + arc * ARC_STEP
    // standHeightForType is the jam's table of how high each type's middle sits
    // so it RESTS on the floor rather than being half-buried in it. Reused, not
    // restated: it is derived from the creation defaults in projectSchema.js and
    // has to move when those move.
    return restOnGround(
        [origin[0] + Math.sin(angle) * radius, 0, origin[2] + Math.cos(angle) * radius],
        { standHeight: standHeightForType(type) }
    )
}

// Which way "in front" is: the compass bearing from the middle of the room out
// towards wherever the view is taken from. Without this the arc would assume
// every project is looked at down the +Z axis, which is true of the camp
// scaffold and is not a promise any document makes.
export const bearingFromView = (savedView = null) => {
    const eye = savedView?.position
    const target = savedView?.target
    if (!Array.isArray(eye) || !Array.isArray(target)) return 0
    const dx = Number(eye[0]) - Number(target[0])
    const dz = Number(eye[2]) - Number(target[2])
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx === 0 && dz === 0)) return 0
    return Math.atan2(dx, dz)
}
