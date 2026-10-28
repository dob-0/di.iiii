// The recording itself lives in RecorderPanelWindow — MediaRecorder is a
// browser API a graph cannot run. What the graph CAN read back is the
// window's own report, from the live side channel every capture node uses.
// An unmounted window (tests, /out) reads as not recording: false, 0, ''.
const BARE = { recording: false, seconds: 0, status: '', file: '' }

export const computeOutput = (node, portId, { context }) => {
    if (!(portId in BARE)) return undefined
    return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? BARE[portId]
}
