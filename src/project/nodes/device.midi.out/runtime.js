// The sending half of MIDI lives in MidiOutFeed — a browser API cannot be
// computed. What the graph CAN read back is the feed's own report, from the
// same live side channel every capture node uses. An unmounted feed (tests,
// /out without hardware) reads as empty string, the keeper convention.
export const computeOutput = (node, portId, { context }) => {
    if (portId !== 'status') return undefined
    return context?.liveOutputs?.get(`${node.id}:status`) ?? ''
}
