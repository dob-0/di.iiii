// DEALING A CARD — n lamps of one type onto a position's free slots.
// docs/architecture/RIG_BUILD.md §11.2. Pure: the document in, ops out.
//
// Two ways to pick the slots, both symmetric about the stage's axis:
//   'spread'      evenly across the free slots — the first and last free slot taken,
//                 the rest at equal steps (a truss header, a pit line, a backdrop);
//   'from-stage'  the free slots nearest the stage first (a row of columns: six booms on
//                 the first three pairs, then ten beams on the next five).
// On a position with two sides (column rows, the flanks, the tower ladders) the count is
// split between the sides; an odd count gives the left side one more, and says so.
// Every new lamp is the plot's own (lampEntity: its fixture record, its lens from its
// mount); the caller then asks the desk to patch the card as one group (§4.2).

import { createOps, lampEntity } from './plotEdits.js'
import { nextUnit } from './plotGeometry.js'

/** n indices out of 0..count-1, evenly spread, mirror-symmetric (i ↔ count-1-i). */
export const evenPick = (count, n) => {
    if (n <= 0 || count <= 0) return []
    if (n >= count) return Array.from({ length: count }, (_, i) => i)
    if (n === 1) return [Math.floor((count - 1) / 2)]
    const out = new Array(n)
    for (let k = 0; k < Math.ceil(n / 2); k++) {
        const t = (k * (count - 1)) / (n - 1)
        const i = Math.floor(t + 0.5 - 1e-9)
        out[k] = i
        out[n - 1 - k] = count - 1 - i
    }
    // A middle one (n odd): the centre, rounded toward the start.
    if (n % 2) out[(n - 1) / 2] = Math.floor((count - 1) / 2)
    return [...new Set(out)].sort((a, b) => a - b)
}

const bySide = (slots) => ({ left: slots.filter((s) => s.side < 0), mid: slots.filter((s) => s.side === 0), right: slots.filter((s) => s.side > 0) })

/**
 * The slots a deal takes.
 * @param {object} position     from positionsOf
 * @param {Set<string>} filled  slot ids already taken
 * @param {number} n
 * @param {'spread'|'from-stage'} [mode]
 * @returns {{ slots: object[], note: string }}
 */
export const pickSlots = (position, filled, n, mode = null) => {
    const how = mode || (position.order === 'stage' ? 'from-stage' : 'spread')
    const free = position.slots.filter((s) => !filled.has(s.id))
    const want = Math.min(n, free.length)
    const notes = []
    if (want < n) notes.push(`${position.name} has ${free.length} free — ${n - want} not dealt`)
    const choose = (list, k) => {
        const sorted = [...list].sort((a, b) => a.rank - b.rank || a.pos[0] - b.pos[0])
        if (how === 'from-stage') return sorted.slice(0, k)
        return evenPick(sorted.length, k).map((i) => sorted[i])
    }
    const { left, mid, right } = bySide(free)
    const twoSided = position.kind === 'rows' && left.length && right.length && !mid.length
    if (!twoSided) {
        // A line across the axis: order by x and spread; 'from-stage' on a line = spread.
        const line = [...free].sort((a, b) => a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2] || a.pos[1] - b.pos[1])
        const picked = how === 'from-stage' && position.kind === 'rows' ? choose(free, want) : evenPick(line.length, want).map((i) => line[i])
        return { slots: picked, note: notes.join('; ') }
    }
    let l = Math.ceil(want / 2)
    let r = want - l
    if (l > left.length) { r += l - left.length; l = left.length }
    if (r > right.length) { l = Math.min(left.length, l + r - right.length); r = right.length }
    if (want % 2) notes.push('an odd count — the left side has one more')
    return { slots: [...choose(left, l), ...choose(right, r)], note: notes.join('; ') }
}

/**
 * The ops for a deal: one lamp per slot, named after the position, numbered along it.
 * @returns {{ ops: object[], ids: string[], note: string }}
 */
export const dealOps = ({ entities, position, filled, type, n, mode = null, newId }) => {
    const { slots, note } = pickSlots(position, filled, n, mode)
    // Units follow the position's own order (rank, then left to right), not the pick order.
    const ordered = [...slots].sort((a, b) => a.side - b.side || a.rank - b.rank || a.pos[0] - b.pos[0])
    let unit = nextUnit(entities, position.name)
    const made = []
    for (const s of ordered) {
        made.push(lampEntity({ id: newId(), type, mount: s.pos, hung: s.hung, position: position.name, unit: unit++, entities: [...entities, ...made] }))
    }
    return { ops: createOps(made), ids: made.map((e) => e.id), note }
}
