import { useEffect, useState, useMemo } from 'react'
import { createFrameMemory, createNodeGraphContext } from './nodeGraphRuntime.js'
import { useDocumentClock } from './useDocumentClock.js'

// The project's node graph, run while a visitor WALKS. It is the same runtime
// RawViewport drives (document clock -> createNodeGraphContext, with a frame
// memory so a Timer keeps its start) — no second evaluator. RawViewport is not
// mounted in a walk (PublicProjectSceneSurface shows one OR the other), and this
// claim keeps it that way if two surfaces ever mount together: the first runner
// owns the graph, any later one stays quiet until the first leaves.
let owner = null
export const claimWalkGraph = (token) => {
    if (owner && owner !== token) return false
    owner = token
    return true
}
export const releaseWalkGraph = (token) => {
    if (owner === token) owner = null
}

// Returns the graph context of this frame (read it with evaluateNodeInput /
// evaluateNodeOutput), or null while this runner does not own the graph.
// The clock's rAF is gated by hasClockNode, so a graph with no clock node
// costs one evaluation context, not one per frame; leaving cancels the rAF.
export function useWalkGraph(document) {
    const [token] = useState(() => Symbol('walk-graph'))
    const [claimed, setClaimed] = useState(false)
    useEffect(() => {
        if (!claimWalkGraph(token)) return undefined
        setClaimed(true)
        return () => {
            releaseWalkGraph(token)
            setClaimed(false)
        }
    }, [token])
    const live = claimed ? document : null
    const now = useDocumentClock(live)
    const [frameMemory] = useState(() => createFrameMemory())
    useEffect(() => { frameMemory.clear() }, [frameMemory, document?.projectMeta?.id])
    return useMemo(
        () => (live ? createNodeGraphContext(live, { now, frameMemory }) : null),
        [live, now, frameMemory]
    )
}
