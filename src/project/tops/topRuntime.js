// What a picture operator says to the rest of the graph.
//
// The picture itself lives on the GPU, inside the engine. When an operator's
// Picture is wired to something outside the picture world (a Monitor, a
// Plane's texture, an Image), the runner copies it into a small canvas and
// publishes a texture over it through liveOutputs (`${id}:out`, see
// TopNetworkFeed) — so `out` hands that on, or null where no runner is live.
// A wire between two operators is read by the engine, not by this function.
// Analyze is the bridge to numbers: the engine measures, the runner publishes
// the result through liveOutputs, and these ports hand it on like any number.
export const computeTopOutput = (node, portId, { context }) => {
    if (portId === 'out') return context?.liveOutputs?.get?.(`${node.id}:out`) ?? null
    const value = context?.liveOutputs?.get?.(`${node.id}:${portId}`)
    return Number.isFinite(value) ? value : 0
}
