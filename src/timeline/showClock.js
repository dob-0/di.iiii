// ONE SHOW CLOCK — tempo, beat and phase, shared by every tool that keeps time.
//
// Method (di-atlas decisions/2026-09-24-perform-line.md, METHOD): the model is
// Ableton Link's (ableton.github.io/link). A timeline is the triple (beat,
// time, tempo), "a bijection between the sets of all beat and time values";
// PHASE is the position inside a QUANTUM of beats (a bar is quantum 4), and
// what participants agree on is tempo and phase, not a start button.
// Here the triple is stored as { bpm, epoch }: `epoch` is the time, in the
// LEADER's milliseconds, at which beat 0 fell — the same pair the Light desk
// already keeps as fx.bpm / fx.epoch (serverXR/src/lighting/fx.js beatGrid),
// so the deck and the lights read one grid with one formula.
//
// Adopted from Link: tempo + beat + phase as the shared state; quantum as the
// unit of phase; "a tap says this instant is a beat" (the tap moves the
// epoch, not only the rate); any follower may propose a tempo to the session.
// NOT adopted: Link's leaderless last-one-wins session. The owner's rule
// (2026-09-24) is that the Light desk's clock LEADS and the deck FOLLOWS, and
// runs its own tempo only when no Light desk is up. That choice is one seam,
// `pickLeader`, so it can be changed in one place.
//
// Clock offset between this browser and the leader (a phone's clock is not
// the server's) is estimated with Cristian's algorithm (Cristian 1989,
// "Probabilistic clock synchronization", Distributed Computing 3:146–158):
// offset = serverTime + rtt/2 − localReceiveTime, keeping the sample with the
// SMALLEST round trip of the recent ones — the minimum-delay filter NTP uses
// (RFC 5905 §10) because the shortest round trip bounds the error tightest.
//
// Nothing here touches React, the DOM or the network.

export const DEFAULT_BPM = 120
export const MIN_BPM = 20
export const MAX_BPM = 300
export const DEFAULT_QUANTUM = 4

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const sanitizeBpm = (value, fallback = DEFAULT_BPM) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.round(clamp(n, MIN_BPM, MAX_BPM) * 10) / 10
}

export const sanitizeEpoch = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : 0
}

export const beatMs = (bpm) => 60000 / sanitizeBpm(bpm)

/** The beat (fractional) at `time`, on the timeline { bpm, epoch }. */
export const beatAt = ({ bpm, epoch = 0 } = {}, time = 0) => (time - sanitizeEpoch(epoch)) / beatMs(bpm)

/** Where inside the quantum `time` is: 0 ≤ phase < quantum. */
export const phaseAt = (timeline, time = 0, quantum = DEFAULT_QUANTUM) => {
    const q = Number(quantum) > 0 ? Number(quantum) : DEFAULT_QUANTUM
    const beat = beatAt(timeline, time)
    return ((beat % q) + q) % q
}

/** The time of the next quantum boundary at or after `time` (Link's quantized launch). */
export const nextBoundaryAt = (timeline, time = 0, quantum = DEFAULT_QUANTUM) => {
    const q = Number(quantum) > 0 ? Number(quantum) : DEFAULT_QUANTUM
    const phase = phaseAt(timeline, time, q)
    if (phase === 0) return time
    return time + (q - phase) * beatMs(timeline?.bpm)
}

// --- tap tempo --------------------------------------------------------------

// A pause longer than this starts a new count: nobody taps 30 bpm by hand.
export const TAP_RESET_MS = 2000
const TAP_KEEP = 8
// The fastest tap that can be a beat. Anything quicker is a double click or a
// bouncing key, and must never be averaged in: a double click 100 ms apart is
// 600 bpm, clamped to 300 — which is how the deck came to read 300.0 on the
// owner's screen on 2026-09-24.
export const MIN_TAP_INTERVAL_MS = 60000 / MAX_BPM

/**
 * One tap. Takes the taps so far (timestamps, ms) and now; returns the taps to
 * keep, the tempo they make (null until there are two), and the epoch the tap
 * sets — a tap says "this instant is a beat".
 */
export const tapTempo = (taps = [], now = 0) => {
    const last = taps[taps.length - 1]
    if (Number.isFinite(last) && now >= last && now - last < MIN_TAP_INTERVAL_MS) {
        // A bounce: the tap is ignored whole, the count carries on.
        return { taps, bpm: null, epoch: null, ignored: true }
    }
    const kept = Number.isFinite(last) && now > last && now - last <= TAP_RESET_MS ? [...taps, now].slice(-TAP_KEEP) : [now]
    if (kept.length < 2) return { taps: kept, bpm: null, epoch: now, ignored: false }
    const span = kept[kept.length - 1] - kept[0]
    const interval = span / (kept.length - 1)
    return { taps: kept, bpm: sanitizeBpm(60000 / interval), epoch: now, ignored: false }
}

// --- who leads ----------------------------------------------------------------

export const CLOCK_POLICIES = ['light-leads', 'deck-only']
// The owner's rule, 2026-09-24 (taken as recommended, not yet confirmed):
// the Light desk's clock leads; the deck's own tempo only when no Light desk
// is up. Change it HERE.
export const DEFAULT_CLOCK_POLICY = 'light-leads'

/**
 * The seam. `light` is the last reading of the Light desk ({ up, bpm, epoch })
 * or null; `follow` is this device's "Follow Light" switch (Link's own
 * per-application switch — every Link app can leave the session).
 */
export const pickLeader = ({ policy = DEFAULT_CLOCK_POLICY, light = null, follow = true } = {}) => (
    policy === 'light-leads' && follow && light?.up === true ? 'light' : 'deck'
)

// --- clock offset (Cristian) ------------------------------------------------

export const OFFSET_SAMPLES = 8

/**
 * One exchange: the local time the request left, the leader's time in the
 * reply, the local time the reply arrived. Returns the sample, or null for
 * one that cannot be right (negative round trip, a missing number).
 */
export const offsetSample = ({ sentAt, serverNow, receivedAt }) => {
    const t0 = Number(sentAt)
    const ts = Number(serverNow)
    const t1 = Number(receivedAt)
    if (![t0, ts, t1].every(Number.isFinite) || t1 < t0) return null
    const rtt = t1 - t0
    return { offset: ts + rtt / 2 - t1, rtt, at: t1 }
}

/** Keep the newest OFFSET_SAMPLES; the estimate is the one with the smallest round trip. */
export const addOffsetSample = (samples = [], sample) => {
    if (!sample) return samples
    return [...samples, sample].slice(-OFFSET_SAMPLES)
}

export const bestOffset = (samples = []) => {
    if (!samples.length) return null
    return samples.reduce((best, sample) => (sample.rtt < best.rtt ? sample : best))
}

/**
 * The show clock as a follower sees it, in LOCAL time: the leader's epoch
 * moved by the offset, so beatAt(clock, performance-free Date.now()) is the
 * leader's beat now.
 */
export const localTimeline = ({ bpm, epoch }, offset = 0) => ({
    bpm: sanitizeBpm(bpm),
    epoch: sanitizeEpoch(epoch) - (Number(offset) || 0)
})

/**
 * Phase error between two timelines at one instant, in milliseconds on the
 * beat circle: how far apart their beats land, signed, within ±half a beat.
 * What the drift measurement reports.
 */
export const phaseErrorMs = (a, b, time = 0) => {
    const beat = beatMs(a?.bpm)
    const diff = (beatAt(a, time) - beatAt(b, time)) * beat
    const wrapped = ((diff % beat) + beat * 1.5) % beat - beat / 2
    return wrapped
}
