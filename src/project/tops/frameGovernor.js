// How often an engine may draw and how often it may start a model run (pilot 2, 2026-11-11).
// A preview window (the deck) needs no more than 30 draws and 15 model runs a second; on a 240 Hz screen it
// otherwise takes graphics-thread time the output page needs. Both limits are 0 = unlimited (the default).
// The time source is the requestAnimationFrame timestamp; a frame may come up to SLACK_MS early so that a
// 60 / 144 / 240 Hz screen lands on 30 draws a second instead of 20 or 24.
const SLACK_MS = 2

export const createGovernor = ({ maxFps = 0, runsPerSecond = 0 } = {}) => {
    const drawStep = maxFps > 0 ? 1000 / maxFps : 0
    const runStep = runsPerSecond > 0 ? 1000 / runsPerSecond : 0
    let lastDraw = -Infinity
    let lastRun = -Infinity
    return {
        /** May the engine draw at `now`? Says yes at most once per step. */
        drawDue(now) {
            if (!drawStep) return true
            if (now - lastDraw < drawStep - SLACK_MS) return false
            lastDraw = now
            return true
        },
        /** May a model run start at `now`? Does not use the slot: call noteRun when one starts. */
        runDue(now) {
            return !runStep || now - lastRun >= runStep - SLACK_MS
        },
        noteRun(now) { lastRun = now }
    }
}
