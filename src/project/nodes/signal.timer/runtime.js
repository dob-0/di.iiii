import { risingEdge } from '../edge.js'

// A cued stopwatch: a rising edge on Start (re)starts it; Elapsed counts
// seconds on the document clock, Progress is elapsed over Length clamped to
// one, Done speaks when the length is served. Never started: all quiet.
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    const memory = context?.frameMemory
    if (!memory) return portId === 'done' ? false : 0
    const now = asNumber(context?.now, 0)
    const key = `${node.id}:startedAt`
    if (risingEdge(memory, `${node.id}:edge`, input('start'))) memory.set(key, now)
    const startedAt = memory.get(key)
    if (!Number.isFinite(startedAt)) return portId === 'done' ? false : 0
    const elapsed = Math.max(0, (now - startedAt) / 1000)
    const length = Math.max(0.001, asNumber(input('length'), 5))
    if (portId === 'elapsed') return elapsed
    if (portId === 'progress') return Math.min(1, elapsed / length)
    if (portId === 'done') return elapsed >= length
    return undefined
}
