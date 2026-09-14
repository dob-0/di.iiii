// The desk's Go button. Presses counts this window's presses, published live
// (a press is a cue, not an edit — it never enters the undo history), on top
// of any count an older document stored. Pressed is the finger on it now.
export const computeOutput = (node, portId, { asNumber, context }) => {
    if (portId === 'presses') {
        const stored = Math.max(0, asNumber(node.values?.presses, 0))
        return stored + Math.max(0, asNumber(context?.liveOutputs?.get(`${node.id}:presses`), 0))
    }
    if (portId === 'pressed') return context?.liveOutputs?.get(`${node.id}:pressed`) ?? false
    return undefined
}
