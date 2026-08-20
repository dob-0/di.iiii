import { risingEdge } from '../edge.js'

// Integrates a rate over the document clock: Rate units per second pile up
// in the running total; Reset empties it. Feed it a knob and get travel —
// TD's Speed, the patch that turns "how fast" into "how far".
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'out') return undefined
    const memory = context?.frameMemory
    if (!memory) return 0
    const now = asNumber(context?.now, 0)
    const key = `${node.id}:state`
    if (risingEdge(memory, `${node.id}:reset`, input('reset'))) memory.set(key, { total: 0, lastAt: now })
    const state = memory.get(key) || { total: 0, lastAt: now }
    if (state.lastAt !== now) {
        const dt = Math.max(0, (now - state.lastAt) / 1000)
        state.total += asNumber(input('rate'), 0) * dt
        state.lastAt = now
    }
    memory.set(key, state)
    return state.total
}
