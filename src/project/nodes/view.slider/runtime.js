// A fader. Value is the authored level — written through an op when the
// finger lifts, so every window and every reader downstream agree. While
// THIS window's finger is down the live side channel carries where it is,
// and Value follows it; Held says so. Always inside Min..Max.
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    const finger = context?.liveOutputs?.get(`${node.id}:held`)
    if (portId === 'held') return finger ?? false
    const held = finger === true
    if (portId !== 'value') return undefined
    const a = asNumber(input('min'), 0)
    const b = asNumber(input('max'), 1)
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const live = held ? context?.liveOutputs?.get(`${node.id}:value`) : undefined
    const raw = asNumber(live ?? node.values?.value, lo)
    return Math.min(hi, Math.max(lo, raw))
}
