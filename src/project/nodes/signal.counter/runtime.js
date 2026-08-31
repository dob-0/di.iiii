import { risingEdge } from '../edge.js'

// Counts rising edges of Count; Reset returns it to zero. The live cue-index
// primitive: a Button or Keyboard wired in, the count picking what plays.
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'out') return undefined
    const memory = context?.frameMemory
    if (!memory) return 0
    const key = `${node.id}:count`
    if (risingEdge(memory, `${node.id}:reset`, input('reset'))) memory.set(key, 0)
    if (risingEdge(memory, `${node.id}:edge`, input('count'))) {
        memory.set(key, (memory.get(key) || 0) + asNumber(input('step'), 1))
    }
    return memory.get(key) || 0
}
