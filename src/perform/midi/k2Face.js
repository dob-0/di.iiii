// The drawn face of a controller: where every control sits, as data (xone-k2-face.json), plus the
// small pure helpers the controller window draws with. A console whose controller has no face
// gets no Device button and no window. Nothing here names a show or a person.
import xoneK2Face from './xone-k2-face.json'
import { K2_NAME } from './xoneK2.js'

export const FACES = { [K2_NAME]: xoneK2Face }

/** The face of a console's controller, or null (a console without `controller` is a K2). */
export const faceOfConsole = (current) => FACES[current?.controller || K2_NAME] || null
export const faceOfController = (name) => FACES[name] || null

/** Job text split into at most `maxLines` lines of at most `wrapChars`, on spaces; a rest that does not fit ends in "…". */
export const wrapJob = (text, { wrapChars = 9, maxLines = 2 } = {}) => {
    const words = String(text || '').split(/\s+/).filter(Boolean)
    const lines = []
    let line = ''
    for (const word of words) {
        if (!line) line = word
        else if (line.length + 1 + word.length <= wrapChars) line += ` ${word}`
        else { lines.push(line); line = word }
    }
    if (line) lines.push(line)
    const cut = (value) => (value.length > wrapChars ? `${value.slice(0, wrapChars - 1)}…` : value)
    if (lines.length <= maxLines) return lines.map(cut)
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = cut(`${kept[maxLines - 1]}…`.length > wrapChars ? `${kept[maxLines - 1].slice(0, wrapChars - 1)}…` : `${kept[maxLines - 1]}…`)
    return kept
}

/** The words a face prints for a job: "Layer 3 level" is drawn "L3 level" (the face already says "L1 blend", "L1 clip 1"). The readout keeps the full words. */
export const shortLayer = (text) => String(text || '').replace(/\bLayer (\d+)/g, 'L$1')

/** The lines a control's job is drawn in: shortened, wrapped, at most the control's own `maxLines` (default the face's). */
export const faceLines = (control, job, text = {}) => wrapJob(shortLayer(job), { ...text, maxLines: control.maxLines ?? text.maxLines })

export const CAP_WIDTH = 8
export const CAP_HEIGHT = 5

/** The fader cap's rectangle for a value 0..127 (no value = rest, the foot of the track). */
export const faderCapBox = (control, value) => {
    const length = control.length || control.size
    const top = control.y - length / 2
    const along = Number.isFinite(value) ? Math.min(127, Math.max(0, value)) / 127 : 0
    const centre = top + length - along * length
    return { left: control.x - CAP_WIDTH / 2, top: centre - CAP_HEIGHT / 2, right: control.x + CAP_WIDTH / 2, bottom: centre + CAP_HEIGHT / 2 }
}

/** The rectangle of a control's shape (`width` and `height` are optional, `size` is the default for both): { left, top, right, bottom } in face units. */
export const shapeBox = (control) => {
    if (control.kind === 'fader') {
        const long = (control.length || control.size) / 2
        // the track plus the cap at either end of its travel
        return { left: control.x - CAP_WIDTH / 2, top: control.y - long - CAP_HEIGHT / 2, right: control.x + CAP_WIDTH / 2, bottom: control.y + long + CAP_HEIGHT / 2 }
    }
    const halfWide = (control.width ?? control.size) / 2
    const halfHigh = (control.height ?? control.size) / 2
    return { left: control.x - halfWide, top: control.y - halfHigh, right: control.x + halfWide, bottom: control.y + halfHigh }
}

/** The room a control takes with its job text under it (or inside it). */
export const jobBox = (control, text = {}) => {
    const width = text.jobWidth ?? 28
    const height = (control.maxLines ?? text.maxLines ?? 2) * (text.lineHeight ?? 5.6)
    return { left: control.x - width / 2, top: control.jobTop, right: control.x + width / 2, bottom: control.jobTop + height }
}

export const unionBox = (a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) })
export const boxesOverlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
