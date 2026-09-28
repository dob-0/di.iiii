// THE RENTAL LIST — what the show has on order, and how much of it is in the rig.
// docs/architecture/RIG_BUILD.md §11 (view C, the cards).
//
// The list is data in the document: `components.rentalList` on the show's own entity
// (RIG_SHOW_ID), written by scripts/rigbuild/rental.mjs from the rental house's
// spreadsheet and the show's order, every number with its source. It travels with
// the space, so a hosted link can say "3 left of 12" without a desk.
//
// Counting is against the lamps in the document (components.fixture.type), the same
// lamps the patch sheet and the plot read. Pure.

import { isLamp } from './autoPatch.js'
import { modeOf, powerOf, typeById } from './fixtureTypes.js'

// The entity that carries what belongs to the SHOW rather than to a lamp or to the
// venue: the rental list now, the designed looks later (§11.4).
export const RIG_SHOW_ID = 'rig-show'

/** The entity carrying the rental list, and the list. */
export const rentalOf = (entities = []) => {
    const entity = entities.find((e) => Array.isArray(e?.components?.rentalList?.items)) || null
    return { entity, list: entity ? entity.components.rentalList : null }
}

/**
 * Per item on the list: how many are on order, how many are in the rig, how many are
 * left to place (or placed past the order). Types in the rig that are not on the list
 * come after, as `unlisted` — a lamp nobody ordered is worth saying out loud.
 * @returns {{ items: object[], totals: { ordered: number, placed: number, left: number, over: number } }}
 */
export const rentalCounts = ({ entities = [], library, list = null }) => {
    const placed = new Map()
    for (const e of entities) {
        if (!isLamp(e)) continue
        const t = e.components.fixture.type
        placed.set(t, (placed.get(t) || 0) + 1)
    }
    const listed = new Set()
    const items = (list?.items || []).map((item) => {
        listed.add(item.type)
        const type = typeById(library, item.type)
        const n = placed.get(item.type) || 0
        const mode = type ? modeOf(type, type.defaultMode) : null
        return {
            code: item.code,
            type: item.type,
            label: item.label || '',
            ordered: item.ordered,
            stock: item.stock ?? null,
            rate: item.rate ?? null,
            source: item.source || '',
            placed: n,
            left: Math.max(0, item.ordered - n),
            over: Math.max(0, n - item.ordered),
            known: Boolean(type),
            category: type?.category || null,
            mode: mode?.name || null,
            footprint: mode?.footprint ?? null,
            modeOwed: type ? Boolean(type.modesOwed) : null,
            watts: type ? powerOf(type) : null,
            unlisted: false
        }
    })
    for (const [t, n] of placed) {
        if (listed.has(t)) continue
        const type = typeById(library, t)
        items.push({ code: type?.code || t, type: t, label: '', ordered: 0, stock: null, rate: null, source: '', placed: n, left: 0, over: n, known: Boolean(type), category: type?.category || null, mode: type?.defaultMode || null, footprint: null, modeOwed: type ? Boolean(type.modesOwed) : null, watts: type ? powerOf(type) : null, unlisted: true })
    }
    const totals = items.reduce((s, i) => ({ ordered: s.ordered + i.ordered, placed: s.placed + i.placed, left: s.left + i.left, over: s.over + i.over }), { ordered: 0, placed: 0, left: 0, over: 0 })
    return { items, totals }
}

/** The count as a card and the plot's key say it. */
export const countWords = (item) => {
    if (!item) return ''
    if (item.unlisted) return `${item.placed} placed · not on the list`
    if (item.over) return `${item.placed} placed · ${item.over} over the order of ${item.ordered}`
    if (item.left) return `${item.left} left of ${item.ordered}`
    return `all ${item.ordered} placed`
}

/** The rental counts by type id, for a view that has a type in hand (the plot's key). */
export const countsByType = (counts) => new Map((counts?.items || []).map((i) => [i.type, i]))
