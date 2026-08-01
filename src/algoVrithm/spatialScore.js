// Timing helpers for the spatial score — the pure half of SpatialScore.jsx.
//
// The score is synthesized, not sampled: every beat's sound is built from
// oscillators and filtered noise whose gains gate and swell in the same
// rhythms the visuals already run on. These helpers are the rhythms. Pure
// functions of time, so the claims worth testing (a gate has the duty cycle
// it says, a stutter is deterministic) need no AudioContext.

// The same integer hash the glitch shaders use (TransitionVeil.jsx,
// ScanRoom.jsx) — one family of noise across the piece, ears included.
// Exported for SpatialScore's event rolls (bubble pitches, static pitch
// jumps): anything that must be the same on every load and at every scrub.
export const scoreHash = (n) => {
    const s = Math.sin(n * 127.1) * 43758.5453
    return s - Math.floor(s)
}
const hash = scoreHash

/**
 * A metronome gate: 1 for the first `duty` fraction of every cycle, else 0.
 * Drives the scan beat's machine tick and the test pattern's steps.
 */
export const tickGate = (timeSec, hz, duty = 0.25) => {
    const phase = (timeSec * hz) % 1
    return phase >= 0 && phase < duty ? 1 : 0
}

/**
 * A broken gate: each cycle rolls once whether it fires at all. This is the
 * audio twin of the veil's torn strips — quantised, irregular, hard-edged.
 * Deterministic in time, so scrubbing the piece replays the same stutter.
 */
export const stutterGate = (timeSec, hz, chance = 0.6) => {
    const tick = Math.floor(timeSec * hz)
    return hash(tick) < chance ? 1 : 0
}

/**
 * Where a circling voice sits, on a ring around the standpoint.
 * Returns [x, y, z] for a bearing measured the way the metaball pairs are.
 */
export const ringPosition = (bearing, radius, height) => [
    Math.cos(bearing) * radius,
    height,
    Math.sin(bearing) * radius
]
