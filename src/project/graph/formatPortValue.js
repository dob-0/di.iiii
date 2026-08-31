// How a value on a port is written down for a person to read.
//
// Split out of the panel that shows it because the whole feature turns on one
// rule that is easy to get wrong and impossible to see going wrong: a port
// carrying NOTHING and a port carrying zero are different facts, and rendering
// both as "0" is the lie this surface exists to remove. `undefined` reaching a
// template literal writes "undefined"; reaching a JSX child writes nothing at
// all — an empty cell that reads as "no value" or as "the value is blank"
// depending on who is looking. Both are guesses. So the empty case is a WORD.
//
// The port's declared type decides the rendering, never the value's shape: a
// colour is a string and so is a title, and sniffing "does it start with #"
// would put a swatch next to somebody's text.
import { countGeometryPieces, isGeometryDescriptor } from './geometryDescriptor.js'

export const NOTHING = 'nothing'

const trimNumber = (value) => {
    if (!Number.isFinite(value)) return String(value)
    // 0.30000000000000004 is what a Vector arriving through math.add looks
    // like. Six places is past anything a person set by hand and short of
    // where float noise starts.
    const fixed = Number(value.toFixed(6))
    return String(fixed)
}

const isTexture = (value) => Boolean(value && typeof value === 'object' && value.isTexture)

const describeTexture = (value) => {
    const image = value.image || null
    const width = Number(image?.width || image?.videoWidth || 0)
    const height = Number(image?.height || image?.videoHeight || 0)
    // A webcam texture exists before its first frame arrives, and its image
    // has no dimensions until then. "0 × 0" would read as a broken camera
    // rather than as one that has not started.
    return (width > 0 && height > 0) ? `a picture, ${width} × ${height}` : 'a picture'
}

/**
 * @param {*} value        the resolved value on the port
 * @param {string} type    the port's declared type id (PORT_TYPES key)
 * @returns {{ text: string, swatch: string|null, empty: boolean }}
 */
export function formatPortValue(value, type = 'any') {
    if (value === undefined || value === null) return { text: NOTHING, swatch: null, empty: true }

    if (type === 'color' && typeof value === 'string') {
        return { text: value, swatch: value, empty: false }
    }
    if (typeof value === 'boolean') return { text: value ? 'yes' : 'no', swatch: null, empty: false }
    if (typeof value === 'number') return { text: trimNumber(value), swatch: null, empty: false }
    if (typeof value === 'string') {
        const cut = value.length > 60 ? `${value.slice(0, 60)}…` : value
        return { text: `"${cut}"`, swatch: null, empty: false }
    }
    if (Array.isArray(value)) {
        if (!value.length) return { text: NOTHING, swatch: null, empty: true }
        return {
            text: value.map((part) => (typeof part === 'number' ? trimNumber(part) : String(part))).join(', '),
            swatch: null,
            empty: false
        }
    }
    if (isTexture(value)) return { text: describeTexture(value), swatch: null, empty: false }
    if (isGeometryDescriptor(value)) {
        const pieces = countGeometryPieces(value)
        return { text: `a shape — ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`, swatch: null, empty: false }
    }

    // Reached by a live output carrying a MediaStream, an AudioBuffer, a model
    // — things with no honest one-line reading. Saying so beats "[object
    // Object]", and beats inventing a description of a thing we did not look at.
    return { text: 'something this sheet cannot read', swatch: null, empty: false }
}
