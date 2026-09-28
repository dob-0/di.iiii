// ADDRESSES IN THE AIR — the small tag every lamp carries in view A (sketch A:
// "#36 U2.025"), and which tags are drawn. docs/architecture/RIG_BUILD.md §12.
// Pure: the plot's own lamp rows in (plotModel().lamps — the patch sheet's rows and
// the desk's flags), words and a choice out.
//
// A tag says what RP-2 writes beside a symbol and the channel hookup lists: the
// fixture number and where its channels start. A conflict (plotModel's
// CONFLICT_CODES: an overlap, off the end of a universe, the desk refusing…) is said
// on the lamp itself — a "!" and a dashed tag — never as a colour alone. A type whose
// mode the rental house still owes has nothing to say yet; its tag says so once, and
// only when the lamp is aimed at or chosen, like the plot does (§10.2).
//
// Cheap by construction: at most `max` tags, the nearest within `radius` metres of the
// eye and in front of it, plus the one aimed at and the one chosen, whatever the
// distance. A hundred lamps never means a hundred labels.

import { FLAG_WORDS } from './sheet.js'

export const TAG_RADIUS_M = 14
export const TAG_MAX = 24
export const TAG_MAX_PHONE = 12

const pad3 = (n) => String(n).padStart(3, '0')

/** "U2.025" — a universe and the first slot, as a crew writes it. */
export const addressWords = (universe, address) => (Number.isInteger(universe) && Number.isInteger(address) ? `U${universe}.${pad3(address)}` : null)

/**
 * The tag's words for one lamp row of plotModel().lamps.
 * @returns {{ text: string, conflict: boolean, owed: boolean, patched: boolean }}
 */
export const tagOf = (lamp) => {
    const at = addressWords(lamp.universe, lamp.address)
    const num = Number.isInteger(lamp.index) ? `#${lamp.index}` : '#—'
    const conflict = (lamp.conflicts || []).length > 0
    const owed = (lamp.flags || []).includes('mode-unknown')
    const text = at ? `${num} ${at}` : owed ? `${num} mode owed` : `${num} not patched`
    return { text: conflict ? `! ${text}` : text, conflict, owed, patched: Boolean(at) }
}

/** The patch as the side sheet lists it: one line per field, words not codes. */
export const patchLines = (lamp) => {
    if (!lamp) return []
    const range = lamp.address && lamp.last ? `${pad3(lamp.address)}–${pad3(lamp.last)}` : null
    return [
        ['fixture #', Number.isInteger(lamp.index) ? String(lamp.index) : '—'],
        ['type', lamp.code || lamp.type || '—'],
        ['mode', lamp.mode ? `${lamp.mode}${lamp.footprint ? ` · ${lamp.footprint} ch` : ''}` : 'owed by the rental house'],
        ['universe', Number.isInteger(lamp.universe) ? `U${lamp.universe}` : '—'],
        ['address', range || (Number.isInteger(lamp.address) ? pad3(lamp.address) : 'not patched')],
        ['position', [lamp.position, lamp.unit ? `unit ${lamp.unit}` : ''].filter(Boolean).join(' · ') || '—'],
        ['circuit', lamp.circuit || '—'],
        ['power', lamp.watts ? `${lamp.watts} W` : '—'],
        ['mount', lamp.hung ? 'hung' : 'standing']
    ]
}

/** Every flag on a lamp in words: conflicts first, then what is owed, then the desk's own sentences. */
export const flagLines = (lamp) => {
    if (!lamp) return []
    const conflicts = new Set(lamp.conflicts || [])
    const words = (code) => FLAG_WORDS[code] || code
    return [
        ...[...conflicts].map((c) => ({ conflict: true, text: words(c) })),
        ...(lamp.flags || []).filter((c) => !conflicts.has(c)).map((c) => ({ conflict: false, text: words(c) })),
        ...(lamp.notes || []).filter(Boolean).map((n) => ({ conflict: conflicts.size > 0, text: n }))
    ]
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/**
 * Which lamps get a tag this frame.
 * @param {object} args
 * @param {{id, lens: number[]}[]} args.lamps
 * @param {number[]} args.eye
 * @param {number[]} args.forward  the view direction (unit)
 * @param {string|null} [args.aimed]    always tagged
 * @param {string|null} [args.chosen]   always tagged
 * @param {Set<string>|null} [args.alwaysIds] lamps tagged at any distance (the conflicts, in crew view)
 * @returns {string[]} ids, nearest first
 */
export const tagsInView = ({ lamps = [], eye, forward, aimed = null, chosen = null, alwaysIds = null, radius = TAG_RADIUS_M, max = TAG_MAX }) => {
    const r2 = radius * radius
    const near = []
    for (const l of lamps) {
        const v = [l.lens[0] - eye[0], l.lens[1] - eye[1], l.lens[2] - eye[2]]
        const ahead = v[0] * forward[0] + v[1] * forward[1] + v[2] * forward[2]
        if (ahead <= 0.2) continue
        const dd = d2(l.lens, eye)
        if (dd <= r2 || alwaysIds?.has(l.id)) near.push([dd, l.id])
    }
    near.sort((a, b) => a[0] - b[0])
    const out = near.slice(0, max).map(([, id]) => id)
    for (const id of [chosen, aimed]) if (id && !out.includes(id)) out.push(id)
    return out
}
