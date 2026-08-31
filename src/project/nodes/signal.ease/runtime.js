// Shapes a 0..1 progress into motion with intent. Input clamps to 0..1 —
// easing outside the unit span has no meaning and the polynomials explode.
export const computeOutput = (node, portId, { input, asNumber }) => {
    const t = Math.min(1, Math.max(0, asNumber(input('in'))))
    if (portId === 'smooth') return t * t * (3 - 2 * t)
    if (portId === 'easeIn') return t * t * t
    if (portId === 'easeOut') return 1 - Math.pow(1 - t, 3)
    if (portId === 'bounce') {
        const n1 = 7.5625, d1 = 2.75
        if (t < 1 / d1) return n1 * t * t
        if (t < 2 / d1) { const u = t - 1.5 / d1; return n1 * u * u + 0.75 }
        if (t < 2.5 / d1) { const u = t - 2.25 / d1; return n1 * u * u + 0.9375 }
        const u = t - 2.625 / d1
        return n1 * u * u + 0.984375
    }
    return undefined
}
