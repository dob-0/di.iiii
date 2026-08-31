// The sending half of DMX lives in DmxOutPanelWindow — a rig on the LAN
// cannot be computed. What the graph CAN read back is the panel's own report,
// from the same live side channel every capture node uses. An unmounted
// panel (tests, /out) reads as empty string, the keeper convention.
export const computeOutput = (node, portId, { context }) => {
    if (portId !== 'status') return undefined
    return context?.liveOutputs?.get(`${node.id}:status`) ?? ''
}
