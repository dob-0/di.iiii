// The picture is taken by StillPanelWindow (a canvas and toBlob); the graph
// reads the window's report back from the live side channel. Unmounted, it
// reads as empty strings — nothing taken here.
const BARE = { status: '', file: '' }

export const computeOutput = (node, portId, { context }) => {
    if (!(portId in BARE)) return undefined
    return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? BARE[portId]
}
