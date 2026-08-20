import { useEffect, useState } from 'react'

// Every type whose output moves with the clock alone — placing ANY of these
// starts the per-frame rebuild (and the show-clock stamp), not just Time.
// Lag glides between answers; Noise wanders; both read context.now.
export const CLOCK_DRIVEN_TYPE_IDS = new Set(['time', 'signal.lag', 'signal.lfo', 'value.noise'])

export const hasClockNode = (nodes = []) => nodes.some((node) => (
    CLOCK_DRIVEN_TYPE_IDS.has(node?.typeId)
    // A PLAYING timeline is clock-driven; a paused one costs nothing. The
    // per-node condition keeps the rAF gate honest both ways.
    || (node?.typeId === 'view.timeline' && node?.values?.playing === true)
))

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
