// The operator's other hand: a chosen key read from the live side channel
// the editor's KeyboardFeed publishes into. Window-local by nature — the
// key is pressed WHERE the editor runs; /out has no fingers.
export const computeOutput = (node, portId, { context }) => {
    if (portId === 'pressed') return context?.liveOutputs?.get(`${node.id}:pressed`) ?? false
    if (portId === 'count') return context?.liveOutputs?.get(`${node.id}:count`) ?? 0
    return undefined
}
