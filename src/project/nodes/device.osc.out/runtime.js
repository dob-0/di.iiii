// The sending half of OSC lives in OscOutPanelWindow — UDP cannot be computed,
// and a page cannot send it: the panel asks this machine's di.iiii
// (serverXR/src/osc). What the graph CAN read back is the panel's report. An
// unmounted panel (tests, /out) reads as empty string, the keeper convention.
export const computeOutput = (node, portId, { context }) => {
    if (portId !== 'status') return undefined
    return context?.liveOutputs?.get(`${node.id}:status`) ?? ''
}
