// WHEN card previews are drawn. No WebGL in here — `draw` is injected — so the
// rules that keep a 2012 laptop usable are unit-tested:
//
// - only cards that are MOUNTED are registered (a card zoomed below the port
//   tier, or never drawn, costs nothing);
// - a card redraws when its fingerprint changes, on the next animation frame;
// - otherwise objects turn slowly, at `fps`, sharing a per-frame time budget
//   round-robin — thirty cubes do not cost thirty renders a frame;
// - a hidden tab stops the loop entirely; `wake()` restarts it.

export const PREVIEW_FPS = 12
export const PREVIEW_BUDGET_MS = 6
// About one turn every 16 seconds: enough to read a shape as 3D, slow enough
// not to pull the eye across the desk.
export const TURN_RADIANS_PER_SECOND = 0.4

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const defaultRequestFrame = (callback) => (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : setTimeout(callback, 16))
const defaultCancelFrame = (handle) => (typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame(handle)
    : clearTimeout(handle))
const defaultIsHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

export function createPreviewScheduler({
    draw,
    onEntriesChange = () => {},
    now = defaultNow,
    requestFrame = defaultRequestFrame,
    cancelFrame = defaultCancelFrame,
    isHidden = defaultIsHidden,
    fps = PREVIEW_FPS,
    budgetMs = PREVIEW_BUDGET_MS
} = {}) {
    const entries = new Map()
    let frame = null
    let lastSpinAt = -Infinity
    let spinCursor = 0
    let serial = 0

    // No work, no frames: a desk of lights only (drawn once) idles at zero.
    const hasWork = () => {
        for (const entry of entries.values()) {
            if (entry.payload && (entry.dirty || entry.spin)) return true
        }
        return false
    }

    const ensureLoop = () => {
        if (frame !== null || !hasWork() || isHidden()) return
        frame = requestFrame(loop)
    }

    function loop() {
        frame = null
        if (!hasWork() || isHidden()) return
        tick()
        ensureLoop()
    }

    const drawEntry = (entry, t) => {
        const ok = draw(entry, { angle: entry.spin ? (t / 1000) * TURN_RADIANS_PER_SECOND : 0 }) !== false
        if (ok) entry.dirty = false
        return ok
    }

    function tick(t = now()) {
        const drawn = []
        const started = now()
        const overBudget = () => drawn.length > 0 && now() - started > budgetMs
        for (const entry of entries.values()) {
            if (!entry.dirty || !entry.payload) continue
            if (overBudget()) break
            if (drawEntry(entry, t)) drawn.push(entry.key)
        }
        if (t - lastSpinAt >= 1000 / fps) {
            const spinning = [...entries.values()].filter((entry) => entry.spin && entry.payload && !drawn.includes(entry.key))
            if (spinning.length) {
                lastSpinAt = t
                let visited = 0
                while (visited < spinning.length && !overBudget()) {
                    const entry = spinning[(spinCursor + visited) % spinning.length]
                    visited += 1
                    if (drawEntry(entry, t)) drawn.push(entry.key)
                }
                spinCursor = (spinCursor + visited) % spinning.length
            }
        }
        return drawn
    }

    return {
        /** A mounted card's 2D target. Returns the handle the card updates. */
        register(target) {
            if (!target) return null
            serial += 1
            const entry = { key: `preview-${serial}`, target, fingerprint: null, payload: null, spin: false, dirty: false }
            entries.set(entry.key, entry)
            onEntriesChange()
            return {
                key: entry.key,
                update: (resolved) => {
                    if (entries.get(entry.key) !== entry) return false
                    const fingerprint = resolved?.fingerprint ?? null
                    if (fingerprint === entry.fingerprint) return false
                    entry.fingerprint = fingerprint
                    entry.payload = resolved?.payload ?? null
                    entry.spin = Boolean(resolved?.spin)
                    entry.dirty = true
                    onEntriesChange()
                    ensureLoop()
                    return true
                },
                unregister: () => {
                    if (entries.get(entry.key) !== entry) return
                    entries.delete(entry.key)
                    onEntriesChange()
                }
            }
        },
        /** Something the picture depends on arrived late (a commit, a texture). */
        markDirty(key) {
            const entry = entries.get(key)
            if (!entry) return
            entry.dirty = true
            ensureLoop()
        },
        markAllDirty() {
            for (const entry of entries.values()) entry.dirty = true
            ensureLoop()
        },
        wake: ensureLoop,
        tick,
        entries: () => [...entries.values()],
        isRunning: () => frame !== null,
        dispose() {
            if (frame !== null) cancelFrame(frame)
            frame = null
            entries.clear()
        }
    }
}
