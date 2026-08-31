const TAU = Math.PI * 2

// The clock node. `elapsed` is the document clock in seconds (context.now is
// ms — window-local until the show clock is stamped, shared after); bpm
// drives the musical outputs, clamped so 0 or negative can't run the phase
// backwards or freeze it. `beat` is a monotonically rising count — consumers
// detect a new beat by the value CHANGING, never by sampling a pulse they
// could miss between frames.
export const computeOutput = (node, portId, { input, asNumber, context }) => {
    const seconds = asNumber(context?.now, 0) / 1000
    if (portId === 'elapsed') return seconds
    const bpm = Math.max(1, asNumber(input('bpm'), 120))
    const beats = seconds * (bpm / 60)
    if (portId === 'sin') return Math.sin(beats * TAU)
    if (portId === 'cos') return Math.cos(beats * TAU)
    if (portId === 'beat') return Math.floor(beats)
    return undefined
}
