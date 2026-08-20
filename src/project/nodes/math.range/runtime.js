// The remap every show patch needs: value measured against one span, spoken
// in another. No clamping — Clamp exists and chains; a value outside the in
// span honestly overshoots. A zero-width in span answers the out start
// rather than dividing by zero.
export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'out') return undefined
    const value = asNumber(input('in'))
    const inMin = asNumber(input('inMin'), 0)
    const inMax = asNumber(input('inMax'), 1)
    const outMin = asNumber(input('outMin'), 0)
    const outMax = asNumber(input('outMax'), 1)
    if (inMax === inMin) return outMin
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin)
}
