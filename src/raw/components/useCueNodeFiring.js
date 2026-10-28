import { useEffect, useRef } from 'react'
import { fireCue } from '../../map/cueFiring.js'
import { evaluateNodeOutput } from '../../project/graph/nodeGraphRuntime.js'

// A Cue node (signal.cue) that a person drives — Go, Back or Jump pressed in
// this window — fires each cue it moves to through fireCue, the one choke
// point the Perform window's cue list, the Projection desk and the cards page
// use: the cue's fade and surfaces as document ops, its light recalled on the
// desk. A node nobody has pressed only reads the list (the show's clock or the
// desk already plays it to the room), so it fires nothing.

/** The document cue to fire for a node's state, or null. Pure. */
export const cueToFire = (state, lastFired, cues) => {
    if (!state || state.pressed !== true || !(state.index >= 0) || !Number.isFinite(state.firedAt)) return null
    const mark = `${state.id}@${state.firedAt}`
    if (mark === lastFired) return null
    const cue = (Array.isArray(cues) ? cues : []).find((candidate) => candidate?.id === state.id) || null
    return cue ? { cue, mark } : null
}

export function useCueNodeFiring({ document, context, applyOps, enabled = true }) {
    const fired = useRef(new Map())
    useEffect(() => {
        const memory = context?.frameMemory
        if (!enabled || !memory || typeof applyOps !== 'function') return
        const cues = document?.mappingState?.cues || []
        for (const node of document?.nodes || []) {
            if (node?.typeId !== 'signal.cue') continue
            // A cache hit when something drew the node this pass; else this read is the pass's.
            evaluateNodeOutput(node, 'index', context)
            const pick = cueToFire(memory.get(`${node.id}:state`), fired.current.get(node.id), cues)
            if (!pick) continue
            fired.current.set(node.id, pick.mark)
            fireCue(pick.cue, applyOps)
        }
    }, [document, context, applyOps, enabled])
}
