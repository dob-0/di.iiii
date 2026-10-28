// Laser Text: a string in, single-stroke Hershey paths (frame v2) out — see hersheyText.js.
import { layoutText } from './hersheyText.js'

const last = new Map()
const LAST_MAX = 256

const layoutFor = (node, { input, asNumber }) => {
    const colour = input('colour')
    const text = input('text')
    const options = {
        size: asNumber(input('size'), 0.2),
        height: asNumber(input('height'), 0.5),
        colour: typeof colour === 'string' && colour ? colour : '#00ff40',
        level: asNumber(input('level'), 1),
    }
    const key = JSON.stringify([text, options])
    const hit = last.get(node.id)
    if (hit && hit.key === key) return hit.result
    const { frame, stats } = layoutText(text === undefined || text === null ? '' : String(text), options)
    const notes = [
        stats.missing ? `${stats.missing} characters not in the font, drawn as ?` : '',
        stats.fitted ? `size brought down to ${stats.size.toFixed(3)} to fit` : '',
        stats.cutPoints ? `cut ${stats.cutPoints} points to fit` : '',
    ].filter(Boolean)
    const result = { frame, status: `${stats.paths} strokes, ${stats.points} points${notes.length ? `, ${notes.join(', ')}` : ''}` }
    if (last.size >= LAST_MAX) last.clear()
    last.set(node.id, { key, result })
    return result
}

export const computeOutput = (node, portId, helpers) => {
    if (portId === 'frame') return layoutFor(node, helpers).frame
    if (portId === 'status') return layoutFor(node, helpers).status
    return undefined
}
