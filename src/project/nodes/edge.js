// Rising-edge detection over frameMemory, shared by the stateful operators.
// The transition happens on the FIRST evaluation after the input flips true
// and never again until it has been false — which also makes multi-output
// nodes safe: the first port's compute consumes the edge, the same pass's
// other ports see prev === current and read the settled state.
//
// `pulsed` is a signal wire that fired this pass (nodeGraphRuntime's
// `pulsed(id)`): a count that moved is an event even when the previous pass
// was one too — two MIDI notes in two consecutive passes are two counts.
export const risingEdge = (memory, key, current, pulsed = false) => {
    if (!memory) return false
    if (pulsed) {
        memory.set(key, true)
        return true
    }
    const now = Boolean(current)
    const prev = Boolean(memory.get(key))
    memory.set(key, now)
    return now && !prev
}
