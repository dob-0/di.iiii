// A two-axis pad (a stick when Spring back is on). X and Y run -1..1, right
// and up positive. The authored point — written through an op when the
// finger lifts, the centre when it springs back — is what every window
// agrees on; while THIS window's finger is down, X and Y follow it through
// the live side channel and Held is true.
const unit = (value) => Math.min(1, Math.max(-1, value))

export const computeOutput = (node, portId, { asNumber, context }) => {
    const finger = context?.liveOutputs?.get(`${node.id}:held`)
    if (portId === 'held') return finger ?? false
    const held = finger === true
    if (portId !== 'x' && portId !== 'y') return undefined
    const live = held ? context?.liveOutputs?.get(`${node.id}:${portId}`) : undefined
    return unit(asNumber(live ?? node.values?.[portId], 0))
}
