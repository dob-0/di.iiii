// The status port reads what the feed component wrote into liveOutputs. The
// send itself is an effect and cannot happen here: computeOutput is pure, runs
// many times a frame and out of order, and a UDP packet per evaluation would
// flood a lighting desk.
export const computeOutput = (node, portId, { context }) => {
    if (portId !== 'status') return undefined
    return context?.liveOutputs?.get(`${node.id}:status`) ?? ''
}
