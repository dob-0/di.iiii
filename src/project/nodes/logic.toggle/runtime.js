import { risingEdge } from '../edge.js'

// A latch: each rising edge on Flip inverts it, Reset forces it off. The
// difference between a held button and a light switch.
export const computeOutput = (node, portId, { input, context }) => {
    if (portId !== 'out') return undefined
    const memory = context?.frameMemory
    if (!memory) return false
    const key = `${node.id}:on`
    if (risingEdge(memory, `${node.id}:reset`, input('reset'))) memory.set(key, false)
    if (risingEdge(memory, `${node.id}:edge`, input('flip'))) memory.set(key, !memory.get(key))
    return Boolean(memory.get(key))
}
