// Passive locomotion — the viewer travels without doing anything.
//
// Until now the rule was that the viewer never moves and the sequences travel
// past them. This is the deliberate exception: the standpoint itself drifts, so
// you are carried through the piece rather than walking through it. No stick,
// no teleport, no button. The illusion of self-motion produced by visual flow
// alone is called VECTION, and it is the whole effect being aimed at here.
//
// COMFORT IS THE ENTIRE DESIGN CONSTRAINT.
//
// Vection makes people sick, and what makes them sick is ACCELERATION. The
// inner ear reports no motion at all while the eyes report speed changing, and
// that mismatch is the nausea. Constant velocity is far better tolerated: after
// a second or two the eyes stop arguing and it simply reads as gliding.
//
// So the velocity profile here is a trapezoid — a short ramp up, a long
// constant cruise, a short ramp down — rather than the smoothstep used
// everywhere else in this piece for fades. Smoothstep is ALL acceleration: it
// is accelerating or decelerating at every instant, which is exactly the
// profile to avoid for movement. It is right for opacity and wrong for a body.
//
// Two further rules the edit list has to respect, because no amount of easing
// rescues them:
//
//   1. NEVER rotate the viewer. Rotational vection is dramatically worse than
//      linear, and turning someone's head for them is disorienting even when it
//      does not make them ill. Travel is translation only — there is no
//      rotation field here on purpose.
//   2. Prefer travel along the direction of gaze. Sideways and vertical drift
//      are the least comfortable axes.
//
// If it still reads as rough in a headset, the next lever is a comfort vignette
// (narrowing the field of view while moving, which cuts the peripheral flow
// that drives vection hardest). Not built — say the word.

const clamp01 = (value) => Math.min(1, Math.max(0, value))

/**
 * Fraction of a travel move spent ramping up, and again ramping down.
 *
 * Small enough that most of the move is constant velocity, big enough that the
 * start and stop are not jerks. A jerk — an instant velocity change — is the
 * single most uncomfortable thing a passive move can do.
 */
export const COMFORT_RAMP = 0.18

/**
 * Trapezoidal velocity, integrated to a 0..1 position curve.
 *
 * Accelerates over the first `ramp`, cruises at constant speed, decelerates
 * over the last `ramp`. Normalised so the move always completes exactly.
 */
export const comfortEase = (progress, ramp = COMFORT_RAMP) => {
    const t = clamp01(progress)
    // No ramp means constant velocity throughout — legitimate, and the branches
    // below would divide by zero.
    if (ramp <= 0) return t
    // Ramps meeting in the middle is the most easing this profile can express;
    // past that they would overlap and the maths stops describing a trapezoid.
    const r = Math.min(0.5, ramp)
    const total = 1 - r

    if (t < r) return (t * t) / (2 * r) / total
    if (t <= 1 - r) return (r / 2 + (t - r)) / total
    return (total - ((1 - t) * (1 - t)) / (2 * r)) / total
}

const asVector = (value) => {
    if (!Array.isArray(value) || value.length !== 3) return null
    // A NaN here propagates straight into the camera matrix and the whole scene
    // stops rendering, with no error anywhere to explain it.
    return value.every((n) => Number.isFinite(n)) ? value : null
}

/**
 * Where the standpoint has been carried to by `playheadSec`.
 *
 * Each sequence may declare `travel: [dx, dy, dz]` — the TOTAL displacement it
 * contributes over its own window, in metres. Contributions ACCUMULATE: a
 * sequence that moves the viewer 8m forward leaves them 8m forward for
 * everything after it, rather than snapping back when its window ends. That is
 * what makes travel composable across an edit list whose clips overlap.
 *
 * Returns a plain [x, y, z] offset to be added to the standpoint.
 */
export const resolveTravel = (sequences = [], playheadSec = 0) => {
    let x = 0
    let y = 0
    let z = 0

    for (const sequence of sequences) {
        const travel = asVector(sequence?.travel)
        if (!travel) continue

        const span = sequence.endSec - sequence.startSec
        // A zero-width clip is fully applied the moment the playhead reaches
        // it; dividing by the span would be NaN.
        const raw = span > 0 ? (playheadSec - sequence.startSec) / span : 1
        if (raw <= 0) continue

        const eased = comfortEase(clamp01(raw))
        x += travel[0] * eased
        y += travel[1] * eased
        z += travel[2] * eased
    }

    return [x, y, z]
}

/** True when the viewer is being carried right now — used to gate comfort aids. */
export const isTravelling = (sequences = [], playheadSec = 0, epsilon = 1e-4) => {
    const before = resolveTravel(sequences, playheadSec - 0.05)
    const after = resolveTravel(sequences, playheadSec + 0.05)
    return Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) > epsilon
}

/** Metres per second the viewer is currently being moved at. */
export const travelSpeed = (sequences = [], playheadSec = 0, sampleSec = 0.05) => {
    const before = resolveTravel(sequences, playheadSec - sampleSec)
    const after = resolveTravel(sequences, playheadSec + sampleSec)
    return Math.hypot(
        after[0] - before[0],
        after[1] - before[1],
        after[2] - before[2]
    ) / (sampleSec * 2)
}

/**
 * The speed above which passive motion starts costing comfort.
 *
 * A brisk walk is about 1.5 m/s and reads as natural. Past roughly 4 m/s the
 * optic flow is faster than anything a body does unaided and the vestibular
 * mismatch gets hard to ignore. Not enforced — the edit list is allowed to
 * break it deliberately — but the director panel can warn.
 */
export const COMFORTABLE_SPEED = 4
