import { useCallback, useState } from 'react'

// Live, non-serializable node outputs (a captured webcam's texture, a mic's
// level, a picture operator's canvas) that can't live in node.values — see
// createNodeGraphContext's liveOutputs. The surface that runs the feeds owns
// the map; the room and the graph read it.
//
// null/undefined clears a port (the feed went, capture failed); any other
// value — including 0 or an empty array — is set as-is, so a real "silent
// microphone" reading is never treated as unset. An identical value
// re-reported (a steady level, the same texture instance) keeps the same map,
// so it does not re-render the whole surface.
export const nextLiveOutputs = (prev, key, value) => {
    const clear = value === null || value === undefined
    if (clear && !prev.has(key)) return prev
    if (!clear && prev.get(key) === value) return prev
    const next = new Map(prev)
    if (clear) next.delete(key)
    else next.set(key, value)
    return next
}

export function useLiveOutputs() {
    const [liveOutputs, setLiveOutputs] = useState(() => new Map())
    const onLiveOutputChange = useCallback((nodeId, portId, value) => {
        setLiveOutputs((prev) => nextLiveOutputs(prev, `${nodeId}:${portId}`, value))
    }, [])
    return [liveOutputs, onLiveOutputChange]
}
