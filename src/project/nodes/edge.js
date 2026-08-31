// Rising-edge detection over frameMemory, shared by the stateful operators.
// The transition happens on the FIRST evaluation after the input flips true
// and never again until it has been false — which also makes multi-output
// nodes safe: the first port's compute consumes the edge, the same pass's
// other ports see prev === current and read the settled state.
export const risingEdge = (memory, key, current) => {
    if (!memory) return false
    const now = Boolean(current)
    const prev = Boolean(memory.get(key))
    memory.set(key, now)
    return now && !prev
}
