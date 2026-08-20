// Crossfades whatever arrives — numbers lerp, colours blend, vectors mix
// per-axis; the shape-aware work lives in the shared mix helper.
export const computeOutput = (node, portId, { input, asNumber, mix }) => (
    portId === 'out' ? mix(input('a'), input('b'), asNumber(input('t'), 0.5)) : undefined
)
