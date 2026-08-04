import { WALK_RAMP } from './palette.js'

// The behaviour of a Turrell-style light room, as pure functions. No three.js,
// no React — so the timing and the colour walk can be tested without mounting
// a canvas, and so the numbers that decide how the room FEELS are all in one
// readable place.

// Everything here is slow to the point of being hard to catch in the act. A
// gradient you can see moving is an animation; one you cannot is a room that
// turns out to be different when you look back. The second is the effect.
export const BREATH_PERIOD_SEC = 26
export const DRIFT_PERIOD_SEC = 41

// How long the room spends on each colour before starting toward the next.
// Deliberately not a divisor of either period above: when the walk and the
// breath share a factor the room develops an obvious loop, and the whole
// illusion is that nothing repeats.
export const COLOR_HOLD_SEC = 19

const clamp01 = (value) => Math.min(1, Math.max(0, value))

/** Eased 0..1..0 over `period`, starting at 0. The room's slow inhale. */
export const breathe = (timeSec, period = BREATH_PERIOD_SEC, phase = 0) => {
    const t = Math.sin(((timeSec / period) + phase) * Math.PI * 2) * 0.5 + 0.5
    // Smoothstepped rather than raw sine: a sine spends most of its time in
    // motion, which reads as a pulse. Easing the ends makes the room hold at
    // each extreme, so it breathes instead of throbbing.
    return t * t * (3 - 2 * t)
}

/**
 * Which two colours the room is currently between, and how far across.
 *
 * `from` and `to` are always adjacent entries in WALK_RAMP, which is ordered
 * specifically so that interpolating between neighbours never passes through
 * mauve — see the note on WALK_RAMP. Handing this LUMINOUS_RAMP instead would
 * put a blue-to-salmon crossfade in the middle of the room.
 */
export const colorWalk = (timeSec, ramp = WALK_RAMP, holdSec = COLOR_HOLD_SEC) => {
    const position = timeSec / holdSec
    const index = Math.floor(position)
    const raw = position - index

    // Eased so the handover is imperceptible at both ends. A linear crossfade
    // between two colours has a visible start and stop.
    const amount = raw * raw * (3 - 2 * raw)

    return {
        from: ramp[index % ramp.length],
        to: ramp[(index + 1) % ramp.length],
        amount
    }
}

/**
 * How strongly the room responds at a given distance from the viewer.
 *
 * "The space subtly reacts to the viewer" has to stay under the threshold of
 * being a mechanic. If a visitor can tell they are causing it, they start
 * operating it — and this piece's whole premise is that there is nothing to
 * operate. So the response is a gentle swell in the light nearest them, with
 * no edge to its reach.
 */
export const viewerInfluence = (distance, radius = 9) => {
    const t = clamp01(1 - distance / radius)
    return t * t * (3 - 2 * t)
}

/**
 * Slow lateral drift of a light volume, in metres. Two incommensurate periods
 * so the path never closes into a visible orbit.
 */
export const drift = (timeSec, seed = 0, amplitude = 1.6) => ({
    x: Math.sin((timeSec / DRIFT_PERIOD_SEC + seed) * Math.PI * 2) * amplitude,
    y: Math.sin((timeSec / (DRIFT_PERIOD_SEC * 0.61) + seed * 1.7) * Math.PI * 2) * amplitude * 0.35,
    z: Math.cos((timeSec / (DRIFT_PERIOD_SEC * 1.37) + seed * 0.4) * Math.PI * 2) * amplitude
})

/**
 * The aperture's opening, 0..1, over a sequence's local progress.
 *
 * Turrell's apertures do not switch on. They are already there when you notice
 * them, and they change while you are not watching — so this opens over most of
 * the sequence and never quite closes.
 */
export const apertureOpening = (progress, breath) => {
    const arrival = clamp01(progress / 0.45)
    const eased = arrival * arrival * (3 - 2 * arrival)
    // Floor of 0.2 so it is never fully shut: a light that appears from nothing
    // is an event, and events are what this room is avoiding.
    return 0.2 + 0.8 * eased * (0.82 + breath * 0.18)
}
