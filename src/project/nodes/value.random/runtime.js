// One fixed random number per variant, spread between Least and Greatest.
// Deterministic: the same variant always answers the same number, in every
// window and on /out — change Variant to draw again. For a number that
// wanders over time, use Noise instead.
export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'out') return undefined
    const least = asNumber(input('least'), 0)
    const greatest = asNumber(input('greatest'), 1)
    const variant = asNumber(input('variant'), 0)
    const s = Math.sin(variant * 127.1 + 311.7) * 43758.5453
    const unit = s - Math.floor(s)
    return least + (greatest - least) * unit
}
