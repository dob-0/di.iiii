import { lerpHex } from '../colourMaths.js'

// A three-stop gradient read at Position: 0 is A, one half is B, 1 is C.
// Mix blends two colours; the Ramp gives a journey — sunrise through noon.
export const computeOutput = (node, portId, { input, asNumber }) => {
    if (portId !== 'out') return undefined
    const t = Math.min(1, Math.max(0, asNumber(input('position'), 0)))
    const a = input('a') || '#000000'
    const b = input('b') || '#ffffff'
    const c = input('c') || '#ffffff'
    return t < 0.5 ? lerpHex(a, b, t * 2) : lerpHex(b, c, (t - 0.5) * 2)
}
