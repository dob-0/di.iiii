// The hearing half of OSC lives in OscInPanelWindow — a UDP socket cannot be
// computed, and a page cannot open one: the panel asks this machine's di.iiii
// (serverXR/src/osc). What the graph CAN read is the panel's report, from the
// same live side channel every capture node uses. Unmounted (tests, /out):
// Address '', Value 0, Signal 0 (the MIDI In idiom), Status ''.
const BARE = { address: '', value: 0, signal: 0, status: '' }

export const computeOutput = (node, portId, { context }) => {
    if (!(portId in BARE)) return undefined
    return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? BARE[portId]
}
