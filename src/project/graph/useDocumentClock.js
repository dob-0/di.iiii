import { hasClockNode, useGraphClock } from './useGraphClock.js'

// One show has ONE clock. `time` used to read each window's own
// performance.now(), so the editor, a second window, and /out all disagreed
// about "now" by however far apart their page loads were. When the document
// carries showState.clockEpoch (stamped once by the editor, the first time a
// Time node exists), every window derives the same elapsed value from wall
// time instead. A document without an epoch — or one only ever opened on the
// read-only /out — keeps the old window-local clock, so nothing existing
// changes until the editor stamps it.
//
// The rAF gate lives in useGraphClock: no Time node, no per-frame work.
export function useDocumentClock(document) {
    const active = hasClockNode(document?.nodes)
    const frameNow = useGraphClock(active)
    const epoch = document?.showState?.clockEpoch || 0
    if (!active) return 0
    // timeOrigin + frameNow IS this frame's wall-clock ms, written so render
    // stays pure: the origin is a constant, frameNow is hook state. Every
    // window's own origin absorbs its own page-load offset, so they agree.
    return epoch > 0 ? performance.timeOrigin + frameNow - epoch : frameNow
}
