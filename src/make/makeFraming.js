// WHAT A PORTRAIT PHONE CAN SEE.
//
// A project's `worldState.savedView` was framed by whoever last pressed save,
// on whatever screen they had — in practice a wide one. RawViewport renders it
// at a fixed 50° VERTICAL field of view, and three.js derives the horizontal
// field from the aspect ratio. On a 16:10 desktop that is a comfortable 74°
// across. On a 390×750 phone canvas the same number is 27° across, so a room
// that fits a laptop shows about a third of itself and everything else is off
// both edges. Measured, not reasoned: the first screenshot of a real camp
// project had two of its four objects cut in half by the screen edges.
//
// Two levers, both applied only to the copy of the document handed to the
// viewport. Nothing here is ever written to the project:
//
//   1. A wider lens on a tall screen. Still a normal lens — past about 70° the
//      near edges of a cube start to shear and a child reads it as "broken".
//   2. Step back until the room is as wide in frame as its author framed it.
//      Capped, because a step back far enough to satisfy the arithmetic on a
//      very narrow screen puts the room at the far end of a field.
//
// Pure, and takes an aspect number rather than an element, so the framing can
// be checked without a renderer, a canvas or a device.

const DEG = Math.PI / 180

// The lens. 50° is what every other surface uses and what a wide screen wants.
export const LANDSCAPE_FOV = 50
export const PORTRAIT_FOV = 68
// Below this the screen is tall enough to be worth a wider lens.
const PORTRAIT_ASPECT = 1

// How wide a camp room is, in metres from its middle. Everything the scaffold
// places — the title, the two blocks, the picture plane, the node cards — sits
// inside about three; the first two rings of makePlacement.js reach 3.2. A
// fixed number rather than a measured one, deliberately: a frame that recomputed
// itself from the contents would step backwards under a child's thumb every
// time they added a shape, and a camera that moves when you did not move it
// reads as the surface losing your place.
const ROOM_RADIUS = 3.4

// Past this the room is a diorama at the end of a corridor, which is a worse
// failure than a cropped edge.
const MAX_PULL = 2.4

export const fovForAspect = (aspect) =>
    (Number(aspect) > 0 && Number(aspect) < PORTRAIT_ASPECT ? PORTRAIT_FOV : LANDSCAPE_FOV)

// Half the horizontal field, as a tangent. three.js takes a VERTICAL fov and
// derives the horizontal one from the aspect, which is exactly why a portrait
// screen sees so little: the number that is held constant is the one the screen
// has plenty of.
export const horizontalHalfTan = (aspect) => {
    const safeAspect = Number(aspect)
    if (!Number.isFinite(safeAspect) || safeAspect <= 0) return null
    return Math.tan((fovForAspect(safeAspect) / 2) * DEG) * safeAspect
}

// Stand back far enough to see a room this wide — and never nearer than the
// person who framed the view stood, because on a wide screen their framing is
// already better than anything computed here.
export const pullForAspect = (aspect, authoredDistance = 0) => {
    const halfTan = horizontalHalfTan(aspect)
    if (!halfTan) return 1
    const needed = ROOM_RADIUS / halfTan
    if (!(authoredDistance > 0)) return 1
    return Math.min(MAX_PULL, Math.max(1, needed / authoredDistance))
}

const asTriple = (value, fallback) => (
    Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(Number(n)))
        ? value.map(Number)
        : fallback
)

// RawViewport's own defaults, restated here rather than imported, because this
// has to produce a complete view even when a document carries no saved one.
const DEFAULT_POSITION = [0, 2.4, 6.5]
const DEFAULT_TARGET = [0, 0.75, 0]

// Where the eye is aimed. A room stands ON a floor, so an eye aimed at ankle
// height fills the bottom half of a tall screen with empty grid and pushes the
// things a child made up into the top third. Aiming a little higher on a
// portrait screen brings them back to the middle. Only ever raises the aim, so
// a view already framed higher than this is left alone.
const PORTRAIT_MIN_AIM = 1.2

// And how steeply. A saved view framed on a wide screen sits almost level with
// the floor, which on a tall screen spends the bottom half of the picture on
// empty grid rushing at you and the top half on empty sky. Lifting the eye to a
// gentle three-quarter angle spends that height on the room instead. Only ever
// steepens, never flattens, and stops well short of a plan view — a child needs
// to see the FRONT of the thing they coloured.
const PORTRAIT_MIN_ELEVATION_DEG = 21

export const frameForAspect = (savedView = null, aspect = 1) => {
    const authoredTarget = asTriple(savedView?.target, DEFAULT_TARGET)
    const eye = asTriple(savedView?.position, DEFAULT_POSITION)
    const isPortrait = Number(aspect) > 0 && Number(aspect) < PORTRAIT_ASPECT
    const target = isPortrait
        ? [authoredTarget[0], Math.max(authoredTarget[1], PORTRAIT_MIN_AIM), authoredTarget[2]]
        : authoredTarget
    const authoredDistance = Math.hypot(
        eye[0] - target[0],
        eye[1] - target[1],
        eye[2] - target[2]
    )
    const pull = pullForAspect(aspect, authoredDistance)
    const position = [
        target[0] + (eye[0] - target[0]) * pull,
        target[1] + (eye[1] - target[1]) * pull,
        target[2] + (eye[2] - target[2]) * pull
    ]

    if (isPortrait) {
        const groundRun = Math.hypot(position[0] - target[0], position[2] - target[2])
        const minRise = groundRun * Math.tan(PORTRAIT_MIN_ELEVATION_DEG * DEG)
        // Raise only; the horizontal bearing and the ground distance the pull
        // just worked out are both left exactly as they are, so the room stays
        // the width it was fitted to.
        position[1] = Math.max(position[1], target[1] + minRise)
    }

    return { ...(savedView || {}), target, position }
}
