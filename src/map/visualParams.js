// A CLIP'S OWN SETTINGS — line thickness, square size, how many rings…
//
// Emily, 2026-11-10: "when I click on a visual it will already have its
// parameters, like line thickness, square size". Resolume gets these from
// the clip itself (an ISF shader's INPUTS, a generator's parameters); so does
// the desk. An HTML clip TELLS the desk what it has, over postMessage, and the
// desk sends the values back:
//
//   page → desk  { type: 'di-visual-params', params: [ { key, label, type,
//                  min, max, step, default, options } ] }
//                type: 'number' | 'choice' | 'colour' | 'toggle';
//                options: [[id, label]] for a choice
//   desk → page  { type: 'di-visual-set', values: { key: value } }
//   desk → page  { type: 'di-visual-hello' }   (please announce again)
//
// The page runs sandboxed (no same-origin), so this is the only way in or
// out. The rack (mediaRack.js) relays it for every copy of the page — the
// desk's Preview and Output, the wall — and the desk keeps the announced list
// on the visual (`paramSpec`) and the chosen values (`params`), so the wall
// gets the same values and the panel shows the settings before a copy loads.

const announced = new Map()
const listeners = new Set()

// The parts of a setting that matter for "is this the same list?" — the
// schema fills in min/max/step/options for every type, so a raw page list and
// a stored one differ in shape even when they say the same thing.
export const paramSpecSignature = (spec) => (Array.isArray(spec) ? spec : [])
    .map((entry) => [entry?.key, entry?.type, entry?.label, JSON.stringify(entry?.default),
        entry?.type === 'number' ? `${entry.min}:${entry.max}:${entry.step}` : '',
        entry?.type === 'choice' ? JSON.stringify(entry.options || []) : ''].join('~'))
    .join('|')

export const announceVisualParams = (ref, spec) => {
    if (!ref || !Array.isArray(spec)) return
    const signature = paramSpecSignature(spec)
    if (announced.get(ref)?.signature === signature) return
    announced.set(ref, { spec, signature })
    listeners.forEach((listener) => listener(ref, spec))
}

export const subscribeVisualParams = (listener) => {
    listeners.add(listener)
    announced.forEach(({ spec }, ref) => listener(ref, spec))
    return () => listeners.delete(listener)
}

// A setting's value as the clip will use it: what was chosen, if it fits the
// setting, else its default.
export const paramValue = (entry, values) => {
    const raw = values ? values[entry.key] : undefined
    switch (entry.type) {
        case 'number': {
            const fallback = Number.isFinite(entry.default) ? entry.default : (entry.min ?? 0)
            const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
            return Math.min(entry.max ?? value, Math.max(entry.min ?? value, value))
        }
        case 'toggle': return typeof raw === 'boolean' ? raw : Boolean(entry.default)
        case 'colour': return typeof raw === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : (entry.default || '#ffffff')
        case 'choice': return (entry.options || []).some(([id]) => id === raw) ? raw : entry.default
        default: return raw
    }
}
