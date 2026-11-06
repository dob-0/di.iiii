/**
 * safety.mjs — the lava hub's one safety/health layer (lasers AND lights).
 *
 * Rules (owner 2026-11-07; photosensitive guidance: no flash faster than 3 Hz, WCAG 2.3.1):
 *   - every value is clamped; non-finite becomes 0
 *   - an output never updates faster than MAX_HZ (40)
 *   - per-frame slew limit: a channel moves at most `slew` per frame
 *   - the luminance may not reverse direction (a swing >= SWING) more than 2*FLASH_HZ times a second
 *   - master cap (default 0.8) scales everything
 *   - game silent > SILENCE_MS: the live state fades over FADE_MS into the timed lava loop (never dark, never strobe)
 * Pure: time is passed in, nothing here touches a network.
 */
export const MAX_HZ = 40
export const FLASH_HZ = 3
export const SILENCE_MS = 2000
export const FADE_MS = 3000
export const SWING = 0.08

export const clamp = (v, lo = 0, hi = 1) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return lo
    return n < lo ? lo : n > hi ? hi : n
}

/** The timed lava loop: a slow rise and fall, 0.15..0.85, 40 s round. Never dark. */
export const timedLoop = (tSec) => ({ lava: 0.5 + 0.35 * Math.sin((tSec / 40) * Math.PI * 2), burn: 0, mode: 'loop' })

/** Blends the live game state with the timed loop by how long the game has been silent. */
export class SilenceFader {
    constructor({ silenceMs = SILENCE_MS, fadeMs = FADE_MS } = {}) {
        this.silenceMs = silenceMs
        this.fadeMs = fadeMs
        this.lastSeen = null
    }
    seen(nowMs) { this.lastSeen = nowMs }
    /** 1 = all live, 0 = all loop. */
    weight(nowMs) {
        if (this.lastSeen == null) return 0
        const quiet = nowMs - this.lastSeen
        if (quiet <= this.silenceMs) return 1
        return clamp(1 - (quiet - this.silenceMs) / this.fadeMs)
    }
    mix(live, nowMs) {
        const w = this.weight(nowMs)
        if (w >= 1) return { ...live, weight: 1 }
        const loop = timedLoop(nowMs / 1000)
        return {
            lava: w * clamp(live?.lava) + (1 - w) * loop.lava,
            burn: w * clamp(live?.burn),
            mode: w <= 0 ? 'loop' : 'fading',
            weight: w
        }
    }
}

/**
 * Limits an output channel array (values 0..1). limit(values, nowMs) -> values to send, or null when the
 * frame is too soon (rate cap). Keeps counters for /health.
 */
export class OutputLimiter {
    constructor({ maxHz = MAX_HZ, slew = 0.15, master = 0.8, flashHz = FLASH_HZ, swing = SWING } = {}) {
        this.minGap = 1000 / Math.min(MAX_HZ, maxHz)
        this.slew = slew
        this.master = clamp(master)
        this.maxReversals = Math.floor(2 * Math.min(FLASH_HZ, flashHz))
        this.swing = swing
        this.last = null
        this.lastAt = -Infinity
        this.dir = 0
        this.extreme = null
        this.reversals = []
        this.stats = { sent: 0, rateDropped: 0, flashHeld: 0 }
    }
    luma(v) { return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length) }
    limit(values, nowMs) {
        if (nowMs - this.lastAt < this.minGap) { this.stats.rateDropped++; return null }
        const want = values.map((v) => clamp(v) * this.master)
        const prev = this.last || null
        const out = prev ? want.map((v, i) => prev[i] + clamp(v - prev[i], -this.slew, this.slew)) : want
        if (prev) {
            const l = this.luma(out)
            const pl = this.luma(prev)
            const d = Math.sign(l - pl)
            this.reversals = this.reversals.filter((t) => nowMs - t < 1000)
            if (d !== 0) {
                if (this.dir === 0) { this.dir = d; this.extreme = pl }
                else if (d !== this.dir && Math.abs((this.extreme ?? pl) - pl) >= this.swing) {
                    if (this.reversals.length >= this.maxReversals) {
                        // budget spent: hold the previous frame, do not reverse
                        this.stats.flashHeld++
                        this.lastAt = nowMs
                        return prev.slice()
                    }
                    this.reversals.push(nowMs)
                    this.dir = d
                    this.extreme = pl
                } else if (d === this.dir) this.extreme = this.extreme ?? pl
            }
        }
        this.last = out
        this.lastAt = nowMs
        this.stats.sent++
        return out
    }
}

/** Counts and rates for /health. */
export class Meter {
    constructor(now = Date.now()) { this.t0 = now; this.n = {}; this.seenAt = {} }
    hit(name, nowMs = Date.now()) { this.n[name] = (this.n[name] || 0) + 1; this.seenAt[name] = nowMs }
    snapshot(nowMs = Date.now()) {
        const up = Math.max(1, (nowMs - this.t0) / 1000)
        const out = {}
        for (const k of Object.keys(this.n)) out[k] = { count: this.n[k], perSec: +(this.n[k] / up).toFixed(2), lastSeenMsAgo: Math.round(nowMs - this.seenAt[k]) }
        return out
    }
}
