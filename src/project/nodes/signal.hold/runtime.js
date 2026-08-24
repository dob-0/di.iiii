import { risingEdge } from '../edge.js'

// Sample-and-hold: freezes Value on each rising edge of Sample. Before the
// first sample it passes the live value through — an unsampled Hold is a
// wire, not a zero.
export const computeOutput = (node, portId, { input, context }) => {
    if (portId !== 'out') return undefined
    const memory = context?.frameMemory
    const value = input('value')
    if (!memory) return value
    const key = `${node.id}:held`
    if (risingEdge(memory, `${node.id}:edge`, input('sample'))) memory.set(key, value)
    return memory.has(key) ? memory.get(key) : value
}
