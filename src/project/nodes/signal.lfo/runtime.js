// Four waveforms of one phase, all -1..1, driven by the document clock so
// every window oscillates together. Wire the shape you mean — no menu.
// Phase offsets in cycles (0.25 turns a sine into a cosine).
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    const frequency = asNumber(input('frequency'), 1)
    const phase = asNumber(input('phase'), 0)
    const t = (asNumber(context?.now, 0) / 1000) * frequency + phase
    const cycle = t - Math.floor(t)
    if (portId === 'sine') return Math.sin(t * Math.PI * 2)
    if (portId === 'square') return cycle < 0.5 ? 1 : -1
    if (portId === 'triangle') return 1 - 4 * Math.abs(cycle - 0.5)
    if (portId === 'saw') return cycle * 2 - 1
    return undefined
}
