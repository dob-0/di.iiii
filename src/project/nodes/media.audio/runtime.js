// The playing sound as numbers, read back from the live side channel the
// editor's SoundAnalysisFeed publishes into (the mic idiom). 0 — silence,
// not undefined — where nothing analyses, so downstream maths stays sane.
const LEVEL_PORTS = new Set(['volume', 'low', 'mid', 'high'])

export const computeOutput = (node, portId, { context }) => {
    if (!LEVEL_PORTS.has(portId)) return undefined
    return context?.liveOutputs?.get(`${node.id}:${portId}`) ?? 0
}
