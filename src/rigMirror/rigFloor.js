// WHERE THE DESK'S PLAN LIES ON THE ROOM'S FLOOR — one mapping, read both ways.
//
// PROVISIONAL, until fixtures carry real positions. The lighting interface places a
// fixture on a flat plan with normalised x,y (0..1 across the visible plan; it allows
// -1..2 so a fixture can sit off the edge). That plan is laid onto a floor rectangle:
//   plan x 0..1 → world X  -5..+5 m
//   plan y 0..1 → world Z  -5..+5 m   (top of the plan is the far side, -Z)
// A fixture has no height, beam or aim yet, so a mirrored marker sits just above the
// floor rather than at a guessed hang height. Every number lives here and nowhere else:
// the markers (RigMirror.jsx) read it forward, "Send positions to the desk"
// (sendPositions.js) reads it back, and the two can never disagree.
export const RIG_FLOOR = Object.freeze({
    minX: -5,
    maxX: 5,
    minZ: -5,
    maxZ: 5,
    y: 0.1,
    radius: 0.12
})

export const rigFloorPosition = (fixture) => [
    RIG_FLOOR.minX + (Number(fixture?.x) || 0) * (RIG_FLOOR.maxX - RIG_FLOOR.minX),
    RIG_FLOOR.y,
    RIG_FLOOR.minZ + (Number(fixture?.y) || 0) * (RIG_FLOOR.maxZ - RIG_FLOOR.minZ)
]

// The exact inverse: a world position → the plan x,y the desk stores. Height is
// dropped — the plan is flat. Not clamped: a lamp standing past the ten-metre square
// is a fixture off the edge of the plan, which the desk allows and draws.
export const rigPlanPosition = (position) => {
    const [x, , z] = Array.isArray(position) ? position : [0, 0, 0]
    return {
        x: ((Number(x) || 0) - RIG_FLOOR.minX) / (RIG_FLOOR.maxX - RIG_FLOOR.minX),
        y: ((Number(z) || 0) - RIG_FLOOR.minZ) / (RIG_FLOOR.maxZ - RIG_FLOOR.minZ)
    }
}
