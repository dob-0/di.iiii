import { risingEdge } from '../edge.js'

// Shapes a firing into motion: a rising edge on Fire runs one attack-hold-
// release envelope, 0 to 1 and back, on the document clock. Re-firing
// restarts it — a show hits the same cue twice and expects the same shape.
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'out') return undefined
    const memory = context?.frameMemory
    if (!memory) return 0
    const now = asNumber(context?.now, 0)
    const key = `${node.id}:firedAt`
    if (risingEdge(memory, `${node.id}:edge`, input('fire'))) memory.set(key, now)
    const firedAt = memory.get(key)
    if (!Number.isFinite(firedAt)) return 0
    const t = Math.max(0, (now - firedAt) / 1000)
    const attack = Math.max(0.001, asNumber(input('attack'), 0.1))
    const hold = Math.max(0, asNumber(input('hold'), 0.2))
    const release = Math.max(0.001, asNumber(input('release'), 0.5))
    if (t < attack) return t / attack
    if (t < attack + hold) return 1
    if (t < attack + hold + release) return 1 - (t - attack - hold) / release
    return 0
}
