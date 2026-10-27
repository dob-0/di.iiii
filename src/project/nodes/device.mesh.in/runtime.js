// The socket lives in MeshInFeed — a WebSocket cannot be computed. The graph
// reads back the feed's report from the live side channel, the MIDI In shape:
// an unmounted feed (tests, a page with no hub) reads as nothing heard yet —
// empty strings, zero time, zero events, link down.
const BARE = { value: '', from: '', time: 0, signal: 0, up: 0, status: '' }

export const computeOutput = (node, portId, { context }) => {
    if (!(portId in BARE)) return undefined
    return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? BARE[portId]
}
