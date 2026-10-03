// A look for a laser: what to draw, not the points. The server that feeds the cube
// renders it (serverXR/src/lighting/laser/shapes.js) and keeps every value safe —
// this only gathers the wires. Every input is a port, so an LFO can turn, grow or
// fade any of them.
export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'look') return undefined
    return {
        shape: String(input('shape') ?? 'circle').trim().toLowerCase() || 'circle',
        sides: asNumber(input('sides'), 5),
        size: asNumber(input('size'), 0.5),
        x: asNumber(input('x'), 0),
        y: asNumber(input('y'), 0),
        spin: asNumber(input('spin'), 0),
        color: input('color') ?? '#00ff00',
        intensity: asNumber(input('intensity'), 0.3),
        waves: asNumber(input('waves'), 3),
        speed: asNumber(input('speed'), 0.25),
    }
}
