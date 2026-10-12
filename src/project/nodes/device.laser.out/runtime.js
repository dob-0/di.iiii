// The sending half of Laser Out lives in LaserOutPanelWindow — the cubes are
// reached through the server, and a graph cannot do that. What the graph CAN
// read back is the panel's own report, from the live side channel every
// capture node uses. An unmounted panel (tests, /out) reads as empty string.
export const computeOutput = (node, portId, { context }) => {
    if (portId !== 'status') return undefined
    return context?.liveOutputs?.get(`${node.id}:status`) ?? ''
}
