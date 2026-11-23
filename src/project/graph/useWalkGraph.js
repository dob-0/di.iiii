import { useEffect, useState, useMemo } from 'react'
import { createFrameMemory, createNodeGraphContext } from './nodeGraphRuntime.js'
import { useDocumentClock } from './useDocumentClock.js'

// The project's node graph, run while a visitor WALKS. It is the same runtime
// RawViewport drives (document clock -> createNodeGraphContext, with a frame
// memory so a Timer keeps its start) — no second evaluator. RawViewport is not
// mounted in a walk (PublicProjectSceneSurface shows one OR the other), and this
// claim keeps it that way if two surfaces ever mount together: the first runner
// owns the graph; a later one waits and takes it when the first leaves, so a
// second surface keeps the graph running.
let owner = null
const waiting = new Set()
export const claimWalkGraph = (token) => {
    if (owner && owner !== token) return false
    owner = token
    return true
}
export const releaseWalkGraph = (token) => {
    if (owner !== token) return
    owner = null
    for (const retry of [...waiting]) { if (retry()) break }
}

// Returns the graph context of this frame (read it with evaluateNodeInput /
// evaluateNodeOutput), or null while this runner does not own the graph.
// The clock's rAF is gated by hasClockNode, so a graph with no clock node
// costs one evaluation context, not one per frame; leaving cancels the rAF.
export function useWalkGraph(document) {
    const [token] = useState(() => Symbol('walk-graph'))
    const [claimed, setClaimed] = useState(false)
    useEffect(() => {
        const take = () => {
            if (!claimWalkGraph(token)) return false
            waiting.delete(take)
            setClaimed(true)
            return true
        }
        if (!take()) waiting.add(take)
        return () => {
            waiting.delete(take)
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
