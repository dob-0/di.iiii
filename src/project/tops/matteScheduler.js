// Which Body sources may run the person model this frame.
//
// The model costs about 14 ms. With several Body layers up, running every one each frame
// takes the whole frame. The budget is how many runs this frame may start (the worker path:
// 1 when the worker is idle, 0 while it is busy; the page-thread fallback: 1). The source
// that was picked longest ago goes first, so every layer gets its turn.
//
// candidates: [{ id, lastPicked }]  (lastPicked = number, -Infinity when never)
// returns the ids that may run, oldest first, at most `budget`; ties keep the given order.
export const pickMatteRuns = (candidates, budget) => {
    const limit = Math.max(0, Math.floor(budget))
    if (!limit || !candidates?.length) return []
    return candidates
        .map((candidate, index) => ({ ...candidate, index }))
        .sort((a, b) => (a.lastPicked === b.lastPicked ? a.index - b.index : a.lastPicked - b.lastPicked))
        .slice(0, limit)
        .map((candidate) => candidate.id)
}
