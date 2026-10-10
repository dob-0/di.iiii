// A pure shape generator: numbers in, one laser frame out. The frame is a
// plain object so it travels on an `any` wire to Laser Out, which draws it
// and sends it. Time comes from the document clock like Oscillator's.
import { generateShape } from './laserShapes.js'

export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'frame') return undefined
    const colour = input('colour')
    const points = generateShape({
        shape: input('shape'),
        size: asNumber(input('size'), 0.5),
        height: asNumber(input('height'), 0.5),
        rotation: asNumber(input('rotation'), 0),
        spin: asNumber(input('spin'), 0),
        time: asNumber(context?.now, 0) / 1000,
        colour: typeof colour === 'string' ? colour : undefined,
        level: asNumber(input('level'), 1),
        points: asNumber(input('points'), 120),
    })
    return { kind: 'laser', points }
}
