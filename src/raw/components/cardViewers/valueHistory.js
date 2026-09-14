// A number viewer's sparkline needs "the last ~10 seconds", not the whole
// session — a ring buffer keyed on time, not sample count, so it reads the
// same whether the card polls at 10 Hz or 2 Hz. Pure and DOM-free so it is
// unit-testable without mounting anything.

export const SPARKLINE_WINDOW_MS = 10_000
// A hard cap independent of the time window: a stalled clock (a test, a
// paused tab) must not let push() grow the array without bound.
const MAX_SAMPLES = 256

export const createValueHistory = (windowMs = SPARKLINE_WINDOW_MS) => {
    let samples = []
    return {
        push(value, atMs) {
            if (typeof value !== 'number' || !Number.isFinite(value)) return
            samples.push({ t: atMs, v: value })
            const cutoff = atMs - windowMs
            let start = 0
            while (start < samples.length && samples[start].t < cutoff) start += 1
            if (start > 0) samples = samples.slice(start)
            if (samples.length > MAX_SAMPLES) samples = samples.slice(samples.length - MAX_SAMPLES)
        },
        // Plain numbers, oldest first — what Sparkline draws.
        values() {
            return samples.map((sample) => sample.v)
        },
        clear() {
            samples = []
        }
    }
}
