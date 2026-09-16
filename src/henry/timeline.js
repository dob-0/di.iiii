// The edit list, and the maths over it. Pure functions — no React, no three —
// so the shape of the piece is testable without mounting a canvas.
//
// henry is an interactive short film, which means two clocks disagree: the
// film wants fixed durations, the player wants to stand still and look at a
// flower. The resolution is that a beat has a nominal length AND, optionally,
// a gate:
//
//   advance: 'time'  the beat ends when its seconds run out.
//   advance: 'gate'  the seconds run out and then the beat WAITS, holding its
//                    final state, until the player does the thing.
//
// So a player who plays along sees a 1:55 film, and a player who wanders never
// sees it break — the world just keeps breathing until they arrive. No timer
// is ever shown and nothing is ever failed.

export const BEATS = [
    { id: 'garden', label: 'Dream Garden', sec: 20, advance: 'gate', gate: 'reach-tree' },
    { id: 'deer', label: 'Deer Tree', sec: 20, advance: 'gate', gate: 'sit' },
    { id: 'bear', label: 'Giant Plush Bear', sec: 25, advance: 'gate', gate: 'brush' },
    { id: 'turn', label: 'The Dream Changes', sec: 20, advance: 'time' },
    // Scene 5 is two beats, not one, and the split is load-bearing. A single
    // gated beat would run its own animation to the end and only THEN wait for
    // the player — so the dream would have already dissolved by the time she
    // reached up to take the glasses off, and the reveal would read as
    // something that happened to her rather than something she did. 'stop' is
    // the held breath before; 'reveal' is what her hands cause.
    { id: 'stop', label: 'She Stops', sec: 6, advance: 'gate', gate: 'glasses' },
    { id: 'reveal', label: 'Reality', sec: 14, advance: 'time' },
    { id: 'ending', label: 'Ending', sec: 10, advance: 'time' }
]

export const NOMINAL_DURATION_SEC = BEATS.reduce((total, beat) => total + beat.sec, 0)

export const beatIndexById = (id) => BEATS.findIndex((beat) => beat.id === id)

export const beatById = (id) => BEATS.find((beat) => beat.id === id) ?? null

/** 0..1 through the current beat. Gated beats clamp at 1 and stay there. */
export const beatProgress = (beat, elapsedSec) => {
    if (!beat || beat.sec <= 0) return 1
    return Math.min(1, Math.max(0, elapsedSec / beat.sec))
}

/** A gated beat that has run out of seconds is waiting for the player. */
export const isWaitingForGate = (beat, elapsedSec) =>
    Boolean(beat) && beat.advance === 'gate' && elapsedSec >= beat.sec

/**
 * Should the piece move on? Time beats answer on the clock; gate beats need
 * both the clock and the gate, so an interaction fired early cannot skip the
 * beat's own animation.
 */
export const shouldAdvance = (beat, elapsedSec, firedGates) => {
    if (!beat) return false
    if (elapsedSec < beat.sec) return false
    if (beat.advance === 'time') return true
    return Boolean(firedGates && firedGates.has(beat.gate))
}

export const nextBeatId = (id) => {
    const index = beatIndexById(id)
    if (index === -1 || index >= BEATS.length - 1) return null
    return BEATS[index + 1].id
}

// --- the two global dials every visual in the piece reads ---------------

// Smoothstep, not linear. Every transition in the references is a dissolve,
// and a linear ramp reads as a wipe: you can see the constant speed.
const ease = (t) => {
    const clamped = Math.min(1, Math.max(0, t))
    return clamped * clamped * (3 - 2 * clamped)
}

/**
 * How much dream is left. 1 = the giant world, 0 = the room she is sitting in.
 * Drives object scale, material colour and sky in one number.
 *
 * The spike at the end of 'ending' is her putting the glasses back on: it
 * rises faster than it fell, because putting them on is a decision and taking
 * them off was a surrender.
 */
export const dreamAmount = (beatId, progress) => {
    if (beatId === 'reveal') return 1 - ease(progress)
    if (beatId !== 'ending') return 1
    // First 65% ordinary; then it comes back, and the cut to black takes it.
    if (progress < 0.65) return 0
    return ease((progress - 0.65) / 0.25) * 0.85
}

/**
 * How wrong it feels. 0 = Family A (warm storybook), 1 = Family B (plastic,
 * cloned, watched). Rises through 'turn' and is still up underneath 'glasses'
 * — the dream does not become nice again before it ends.
 */
export const strangeAmount = (beatId, progress) => {
    if (beatId === 'turn') return ease(progress)
    if (beatId === 'stop' || beatId === 'reveal' || beatId === 'ending') return 1
    return 0
}

/** The final fade. Only the last beat has one, and only at its very end. */
export const blackAmount = (beatId, progress) => {
    if (beatId !== 'ending') return 0
    return ease((progress - 0.9) / 0.1)
}
