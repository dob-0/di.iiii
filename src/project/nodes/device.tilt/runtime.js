// How the phone is tipped, as x and y in -1..1, read from the live side
// channel the editor's TiltFeed publishes into. Where no feed runs (a
// desktop, /out, a phone that refused) it rests level: 0, 0, not live.
export const computeOutput = (node, portId, { context }) => {
    if (portId === 'x') return context?.liveOutputs?.get(`${node.id}:x`) ?? 0
    if (portId === 'y') return context?.liveOutputs?.get(`${node.id}:y`) ?? 0
    if (portId === 'live') return context?.liveOutputs?.get(`${node.id}:live`) ?? false
    return undefined
}
