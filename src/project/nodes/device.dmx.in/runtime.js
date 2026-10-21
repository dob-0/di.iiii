// The reading half of DMX In lives in DmxInPanelWindow — the console's levels
// arrive at the lighting desk, not in the graph. What the graph reads is the
// panel's report: Value 0..1, held at the last reading on loss of signal, and
// Status. Unmounted (tests, /out): Value 0, Status ''.
export const computeOutput = (node, portId, { context }) => {
    if (portId === 'value') return context?.liveOutputs?.get(`${node.id}:value`) ?? 0
    if (portId === 'status') return context?.liveOutputs?.get(`${node.id}:status`) ?? ''
    return undefined
}
