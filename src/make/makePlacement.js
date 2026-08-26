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
// Half the arc, in radians — about 46°. It was 65°, which put the fourth thing
// a child made almost at right angles to the room: seen on a 390px screen, a
// photo landed with a third of itself past the left edge, and the camera had to
// stand a long way back to gather it in, shrinking everything else. A room is
// wider than a phone; the arc should not make it wider still.
const ARC_HALF = 0.8

// PICTURES STAND UP.
//
// ImageObject draws its plane with `rotation-x={-Math.PI/2}` — flat on the
// floor, always, on every surface in the platform. That is a sensible default
// for a picture dropped into a jam and it is the wrong one here: seen on the
// real thing, a child's photograph of Dilijan arrived as a RUG. The plane is
// three metres tall whatever the photo, so it also has to be lifted half of
// that or it is buried to the waist.
//
// Countered in the entity's own transform rather than in ImageObject, because
// ImageObject is shared with Studio, with Raw, with the jam and with every
// published page, and none of them asked for their pictures to stand up.
//
// The maths, since it is not obvious: three.js reads a transform's euler in
// XYZ order, so `[π/2, 0, -bearing]` composes as Rx(π/2)·Rz(-bearing) and turns
// the mesh's up-facing normal into a horizontal one pointing along the bearing
// — which is where the camera is. A plain yaw on Y would have been swallowed:
// applied before the X quarter-turn, it only spins a horizontal plane in place.
// And a picture is drawn THREE METRES TALL whatever it is a picture of, which
// beside a one-metre cube is a billboard, not a photograph somebody stood in
// their room. Worse, on a portrait phone one of them alone pushes the camera
// back far enough to shrink everything else: measured, a single photograph cost
// about a third of the picture's width. At 0.6 it is 1.8m — a shade taller than
// the child holding the phone, which is the size a thing you look at wants to
// be.
const PICTURE_HEIGHT = 3
const PICTURE_SCALE = 0.6
const PICTURE_STANDS = new Set(['image', 'video'])

export const makePlacementRotation = (type, { bearing = 0 } = {}) => (
    PICTURE_STANDS.has(type) ? [Math.PI / 2, 0, -bearing] : [0, 0, 0]
)

export const makePlacementScale = (type) => (
    PICTURE_STANDS.has(type) ? [PICTURE_SCALE, PICTURE_SCALE, PICTURE_SCALE] : [1, 1, 1]
)

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
    const ground = [origin[0] + Math.sin(angle) * radius, 0, origin[2] + Math.cos(angle) * radius]
    // A standing picture's middle is half its own height up. standHeightForType
    // has no answer for one, because on every other surface a picture lies flat.
    if (PICTURE_STANDS.has(type)) return [ground[0], (PICTURE_HEIGHT * PICTURE_SCALE) / 2, ground[2]]
    return restOnGround(ground, { standHeight: standHeightForType(type) })
}
