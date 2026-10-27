// The sending half lives in MeshOutFeed; the graph reads back whether the link
// is up and what the feed says it is doing. Unmounted: down, nothing to say.
const BARE = { up: 0, status: '' }

export const computeOutput = (node, portId, { context }) => {
    if (!(portId in BARE)) return undefined
    return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? BARE[portId]
}
