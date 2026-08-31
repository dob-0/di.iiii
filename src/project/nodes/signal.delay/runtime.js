// Time-shifts a number: answers what Value was Delay seconds ago, from a
// ring of samples in frameMemory. Until enough history exists it answers
// the oldest sample it has — a young Delay is late, never silent.
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'out') return undefined
    const memory = context?.frameMemory
    const value = asNumber(input('value'), 0)
    if (!memory) return value
    const delayMs = Math.max(0, asNumber(input('delay'), 0.5) * 1000)
    const now = asNumber(context?.now, 0)
    const key = `${node.id}:ring`
    const ring = memory.get(key) || []
    if (!ring.length || ring[ring.length - 1].at !== now) {
        ring.push({ at: now, value })
        while (ring.length > 2 && ring[1].at <= now - delayMs) ring.shift()
        memory.set(key, ring)
    }
    const cutoff = now - delayMs
    for (let i = ring.length - 1; i >= 0; i--) {
        if (ring[i].at <= cutoff) return ring[i].value
    }
    return ring[0].value
}
