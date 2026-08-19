// Shared pointer-drag plumbing for the performable control widgets
// (fader/XY pad). Commits are rAF-gated for the same reason node-card drags
// are in RawGraphSurface: raw pointermove can outpace the display refresh
// rate, and every commit is a document op that re-evaluates the graph.
// The pointerup commit always flushes the exact final value.

export const clamp01 = (value) => Math.min(1, Math.max(0, value))

export const asFiniteNumber = (value, fallback) => {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

export const createRafCommitter = (commit) => {
    let rafId = null
    let pending = null
    const flush = () => {
        rafId = null
        if (pending === null) return
        const patch = pending
        pending = null
        commit(patch)
    }
    return {
        queue(patch) {
            pending = patch
            if (rafId === null) rafId = requestAnimationFrame(flush)
        },
        finish(patch) {
            if (rafId !== null) cancelAnimationFrame(rafId)
            rafId = null
            pending = null
            commit(patch)
        },
        cancel() {
            if (rafId !== null) cancelAnimationFrame(rafId)
            rafId = null
            pending = null
        }
    }
}
