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

// A trigger input "fires" when it turns truthy, or changes while truthy (a
// rising count from a Counter or MIDI In) — MidiOutFeed's rule, and the one
// every Reset and Tap uses (Beat in BeatFeed, Oscillator below), so one word
// means one thing whatever is wired into it.
export const signalFired = (was, now) => Boolean(now) && (!was || now !== was)

// signalFired over frameMemory, multi-output safe like risingEdge: the first
// port's compute consumes the change, the same pass's other ports see none.
export const firedEdge = (memory, key, current) => {
    if (!memory) return false
    const was = memory.get(key)
    memory.set(key, current)
    return signalFired(was, current)
}
