import { hexToRgb, rgbToHsl } from '../colourMaths.js'

// A colour opened into its channels, both alphabets at once: Red/Green/Blue
// and Hue/Saturation/Lightness, all 0..1. Wire the reading you mean.
export const computeOutput = (node, portId, { input }) => {
    const rgb = hexToRgb(input('colour'))
    if (portId === 'red') return rgb[0]
    if (portId === 'green') return rgb[1]
    if (portId === 'blue') return rgb[2]
    const [h, s, l] = rgbToHsl(rgb)
    if (portId === 'hue') return h
    if (portId === 'saturation') return s
    if (portId === 'lightness') return l
    return undefined
}
