// Touch double-tap, detected by hand. The graph and the room relied on the
// browser synthesizing `dblclick` from two taps on a `touch-action: none`
// element — Chromium does, the 2026-08-20 real-phone test said the device did
// not, so the whole product was dead at step one on a phone.
//
// Thresholds are exported so the owner's real-device pass can tune them in
// one place.
export const DOUBLE_TAP_MAX_INTERVAL_MS = 350
export const DOUBLE_TAP_MAX_RADIUS_PX = 24
export const TAP_MOVE_TOLERANCE_PX = 12

// A pure state machine, no callback held: `up()` RETURNS true when a
// double-tap just completed, and the caller fires its own handler from the
// event site — so the freshest closure handles it and no ref plumbing exists
// to go stale. Works on DOM pointer events and R3F's, which carry the same
// pointerType/clientX/clientY.
//
// Rules: touch pointers only; a second finger poisons the gesture (that is a
// pinch); a tap that slid more than the tolerance is a pan, not a tap; two
// qualifying taps within the interval and radius complete, on the second tap.
export function createTapTracker(now = () => performance.now()) {
    let downAt = null
    let activePointers = 0
    let poisoned = false
    let lastTap = null
    let firedAt = -Infinity

    const down = (event) => {
        activePointers += 1
        if (activePointers > 1) { poisoned = true; downAt = null; return }
        if (event.pointerType !== 'touch') return
        poisoned = false
        downAt = { x: event.clientX, y: event.clientY }
    }
    const up = (event) => {
        activePointers = Math.max(0, activePointers - 1)
        if (event.pointerType !== 'touch' || poisoned || !downAt) { downAt = null; return false }
        const start = downAt
        downAt = null
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MOVE_TOLERANCE_PX) return false
        const tap = { x: event.clientX, y: event.clientY, at: now() }
        const previous = lastTap
        lastTap = tap
        if (!previous) return false
        if (tap.at - previous.at > DOUBLE_TAP_MAX_INTERVAL_MS) return false
        if (Math.hypot(tap.x - previous.x, tap.y - previous.y) > DOUBLE_TAP_MAX_RADIUS_PX) return false
        lastTap = null
        firedAt = tap.at
        return true
    }
    const cancel = () => {
        activePointers = Math.max(0, activePointers - 1)
        downAt = null
    }
    // Chromium DOES synthesize dblclick from two taps — without this guard the
    // palette would open twice there (once from the tap path, once natively).
    const justFired = () => now() - firedAt < 700

    return { down, up, cancel, justFired }
}
