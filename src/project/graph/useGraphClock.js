import { useEffect, useState } from 'react'

export const hasClockNode = (nodes = []) => nodes.some((node) => node?.typeId === 'time')

// Drives the `time` node. Returns a monotonic millisecond clock that advances
// once per animation frame, or a constant 0 when nothing needs it.
//
// The gate is the whole point. A live clock means rebuilding the graph context
// every frame — the per-pass outputCache has to be thrown away or `time` would
// return its first sampled value forever. That is O(nodes + edges) per frame,
// which is fine for a document that asked for a clock and pure waste for one
// that did not. Every other surface in this codebase is rAF-gated for the same
// reason; an always-on clock would quietly undo that for every project.
//
// Pass `active` from hasClockNode(document.nodes).
export function useGraphClock(active) {
    const [now, setNow] = useState(0)

    useEffect(() => {
        if (!active) return undefined
        let frame = requestAnimationFrame(function tick() {
            setNow(performance.now())
            frame = requestAnimationFrame(tick)
        })
        return () => cancelAnimationFrame(frame)
    }, [active])

    // Returning a literal 0 while inactive keeps `elapsed` defined rather than
    // undefined, so a disconnected Time node reads as a stopped clock instead of
    // poisoning every downstream math node with NaN.
    return active ? now : 0
}
