// The desk's Go button. Presses is the authored count — written through an
// op, so every window and a Counter downstream agree how many times the
// show was told to go. Pressed is this window's live finger, from the
// side channel, honest only where the button is actually being held.
export const computeOutput = (node, portId, { asNumber, context }) => {
    if (portId === 'presses') return Math.max(0, asNumber(node.values?.presses, 0))
    if (portId === 'pressed') return context?.liveOutputs?.get(`${node.id}:pressed`) ?? false
    return undefined
}
