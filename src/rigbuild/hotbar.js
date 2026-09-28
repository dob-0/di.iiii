// THE HOTBAR — what the hand can take in view A, first person
// (docs/architecture/RIG_BUILD.md §12). Pure.
//
// The pieces first (truss 3/2/1 m, tower, deck: pieces.js), then the show's rental
// list, line by line, with the counts view C shows (rental.js rentalCounts): the
// palette IS the rental list, so the 19th UP-B380F of an order of 18 cannot be hung
// (sketch A). Pieces are not on MOXIR's rental list (the truss is owed by the rental
// house), so a piece slot counts what is placed and has no limit. A type in the rig
// that nobody ordered gets no slot: the hand only takes what is on the list. With no
// list at all, the hand takes every type in the library, unlimited, and says so.

import { PIECES, pieceKindOf } from './pieces.js'
import { rentalCounts, rentalOf } from './rental.js'

export const PIECE_SLOTS = ['truss-3m', 'truss-2m', 'truss-1m', 'tower', 'deck-2x1']

const EFFECT_CATEGORIES = new Set(['co2-jet', 'spark-machine', 'smoke-machine'])

/** Is a type an effect (a box on the floor, no beam)? The plot's own test (plotEdits lampEntity). */
export const isEffect = (type) => Boolean(type) && !type.optics?.beam_deg && EFFECT_CATEGORIES.has(type.category)

const shortCode = (code) => String(code || '').replace(/^UP-/, '')

/**
 * @returns {{slots: object[], listed: boolean}} each slot:
 *   {id, key: '1'..'9' | '0' | null, kind: 'truss-3m' | … | 'lamp', label, type?, effect?,
 *    placed, ordered|null, left|null, full: boolean, words}
 */
export const hotbarSlots = ({ entities = [], library }) => {
    const pieceCounts = new Map()
    for (const e of entities) {
        const k = pieceKindOf(e)
        if (k) pieceCounts.set(k, (pieceCounts.get(k) || 0) + 1)
    }
    const slots = PIECE_SLOTS.map((kind) => {
        const placed = pieceCounts.get(kind) || 0
        const p = PIECES[kind]
        return {
            id: kind, kind, label: p.category === 'truss' ? `truss ${p.length} m` : p.category === 'tower' ? 'tower' : 'deck 2×1',
            placed, ordered: null, left: null, full: false, words: `${placed} placed`
        }
    })
    const { list } = rentalOf(entities)
    const types = library?.types || []
    if (list) {
        const counts = rentalCounts({ entities, library, list })
        for (const item of counts.items) {
            if (item.unlisted || !item.known) continue
            const type = types.find((t) => t.id === item.type)
            slots.push({
                id: `lamp:${item.type}`, kind: 'lamp', type: item.type, code: item.code, label: shortCode(item.code),
                effect: isEffect(type), modeOwed: Boolean(item.modeOwed),
                placed: item.placed, ordered: item.ordered, left: item.left, full: item.left <= 0,
                words: item.left > 0 ? `${item.left} left` : item.over ? `${item.over} over` : 'none left'
            })
        }
    } else {
        for (const type of types) {
            const placed = entities.filter((e) => e.components?.fixture?.type === type.id).length
            slots.push({
                id: `lamp:${type.id}`, kind: 'lamp', type: type.id, code: type.code, label: shortCode(type.code),
                effect: isEffect(type), modeOwed: Boolean(type.modesOwed),
                placed, ordered: null, left: null, full: false, words: `${placed} placed`
            })
        }
    }
    const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
    return { slots: slots.map((s, i) => ({ ...s, key: KEYS[i] || null })), listed: Boolean(list) }
}

/** The sentence the hand says when the list is used up — the rental list is the limit. */
export const fullWords = (slot) => `all ${slot.ordered} ${slot.code} on the order are placed — remove one to hang it elsewhere`

/** Scroll the hotbar: the next / previous slot, wrapping. */
export const cycleSlot = (index, count, dir) => (count ? (((index + dir) % count) + count) % count : 0)

/** A digit key to a slot index ('1' → 0 … '0' → 9), or -1. */
export const slotOfKey = (key, count) => {
    const i = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].indexOf(key)
    return i >= 0 && i < count ? i : -1
}
