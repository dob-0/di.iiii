// Tells a pointer lock that can never look (broken relative motion at the
// compositor) from a person looking around slowly.
//
// The shapes a broken lock delivers were captured live (KDE Wayland +
// Firefox, July 2026; see walkModeConfig.js): all-zero deltas, a constant
// ±1,0 crawl, and small random noise in both axes while the mouse is really
// being swept. Until 2026-09-28 ANY run of BROKEN_LOCK_DEAD_MOVES small moves
// (|Δ| ≤ BROKEN_LOCK_DEAD_DELTA_MAX) counted as broken — which a slow, steady
// pan also is. Measured then on Chromium 153 / X11 / DPR 1.5: a pan of one
// mouse count per frame arrives as movementX 1,0,1,1,0,… and the lock was
// abandoned after 30 events — an eighth of a second at 240 Hz, where every
// slow look-around across a hall is "small" per frame.
//
// A slow pan differs from all three broken shapes in a way per-event size
// cannot see and a short window can: it GOES somewhere. So a window of small
// moves is broken only when
//   - it is incoherent: |Σv| / Σ|v| below BROKEN_LOCK_MIN_COHERENCE — zero
//     motion (0/0) and random noise both land here (the captured noise stream
//     scores ≈ 0.4, independent noise ≈ 1/√n), a real pan ≈ 0.8–1; or
//   - every move in it is the identical non-zero delta — the ±1,0 crawl.
//     A real slow pan at a fractional DPR alternates (1,0,1,1,0) and a real
//     hand varies; the one real motion this still flags is a perfectly
//     constant 1-count-per-frame pan at DPR 1 for the whole window, which
//     only costs the lock (drag-look still works), as before.
//
// Pure: fed movementX/movementY, answers { broken, streak }. The walker
// resets it on every lock engage.

import {
    BROKEN_LOCK_DEAD_DELTA_MAX,
    BROKEN_LOCK_DEAD_MOVES,
    BROKEN_LOCK_MIN_COHERENCE
} from './walkModeConfig.js'

export function createBrokenLockDetector({
    windowSize = BROKEN_LOCK_DEAD_MOVES,
    maxDelta = BROKEN_LOCK_DEAD_DELTA_MAX,
    minCoherence = BROKEN_LOCK_MIN_COHERENCE
} = {}) {
    let win = []
    let streak = 0

    const verdict = () => {
        if (win.length < windowSize) return false
        let sx = 0
        let sy = 0
        let path = 0
        let identical = true
        const [fx, fy] = win[0]
        for (const [x, y] of win) {
            sx += x
            sy += y
            path += Math.hypot(x, y)
            if (x !== fx || y !== fy) identical = false
        }
        if (identical && (fx !== 0 || fy !== 0)) return true
        if (path === 0) return true
        return Math.hypot(sx, sy) / path < minCoherence
    }

    return {
        push(dx, dy) {
            const small = Math.abs(dx) <= maxDelta && Math.abs(dy) <= maxDelta
            if (!small) {
                win = []
                streak = 0
                return { broken: false, streak }
            }
            streak++
            win.push([dx, dy])
            if (win.length > windowSize) win.shift()
            return { broken: verdict(), streak }
        },
        reset() {
            win = []
            streak = 0
        },
        get streak() {
            return streak
        }
    }
}
