// Exponential glide toward the input: the answer chases the target and never
// arrives, closing 63% of the distance every `lag` seconds. Frame-rate
// independent (k derives from real dt), stateful through context.frameMemory
// — the ONLY node state that lives between passes, never in node.values.
// Without memory (tests, one-off reads) it answers the target directly.
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'out') return undefined
    const target = asNumber(input('in'), 0)
    const lagSeconds = Math.max(0, asNumber(input('lag'), 0.5))
    const memory = context?.frameMemory
    const now = asNumber(context?.now, 0)
    if (!memory || lagSeconds === 0) return target
    const key = `${node.id}:out`
    const prev = memory.get(key)
    let value = target
    if (prev && Number.isFinite(prev.value) && Number.isFinite(prev.at)) {
        const dt = Math.max(0, (now - prev.at) / 1000)
        const k = 1 - Math.exp(-dt / lagSeconds)
        value = prev.value + (target - prev.value) * k
    }
    memory.set(key, { value, at: now })
    return value
}
