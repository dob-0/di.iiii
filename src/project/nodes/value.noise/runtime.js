// Smooth value noise over the document clock: deterministic in (now, speed,
// variant), so every window — and /out — sees the SAME wander at the same
// moment. Variant picks a different journey ("seed" is banned copy). Output
// glides through -1..1: random lattice values, smoothstep between them.
const lattice = (i, variant) => {
    const s = Math.sin(i * 127.1 + variant * 311.7) * 43758.5453
    return (s - Math.floor(s)) * 2 - 1
}

export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'out') return undefined
    const speed = asNumber(input('speed'), 1)
    const variant = asNumber(input('variant'), 0)
    const t = (asNumber(context?.now, 0) / 1000) * speed
    const i = Math.floor(t)
    const f = t - i
    const a = lattice(i, variant)
    const b = lattice(i + 1, variant)
    return a + (b - a) * (f * f * (3 - 2 * f))
}
