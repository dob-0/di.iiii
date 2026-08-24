import { rgbToHex } from '../colourMaths.js'

export const computeOutput = (node, portId, { input, asNumber }) => (
    portId === 'out'
        ? rgbToHex(asNumber(input('red'), 0), asNumber(input('green'), 0), asNumber(input('blue'), 0))
        : undefined
)
