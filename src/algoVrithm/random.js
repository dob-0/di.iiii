// Deterministic pseudo-random numbers.
//
// Math.random() would give the piece a different point cloud on every reload —
// a composition you cannot art-direct, review, or reproduce in a screenshot.
// Seeding means the field is scattered but always the SAME scatter: change the
// seed to get a different one on purpose, not by accident.
//
// mulberry32 — small, fast, good enough distribution for scattering geometry.
// Not for anything security-related.
export const createRandom = (seed = 1) => {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
