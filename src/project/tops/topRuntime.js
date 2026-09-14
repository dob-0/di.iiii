// What a picture operator says to the rest of the graph.
//
// The picture itself lives on the GPU, inside the engine, and never passes
// through the React graph — so a Picture port evaluates to null here, and a
// wire between two operators is read by the engine, not by this function.
// Analyze is the bridge to numbers: the engine measures, the runner publishes
// the result through liveOutputs, and these ports hand it on like any number.
export const computeTopOutput = (node, portId, { context }) => {
    if (portId === 'out') return null
    const value = context?.liveOutputs?.get?.(`${node.id}:${portId}`)
    return Number.isFinite(value) ? value : 0
}
