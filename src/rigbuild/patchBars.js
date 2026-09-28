// THE PATCH BARS — view C's picture of the patch, one bar per universe filling as the
// cards are dealt. docs/architecture/RIG_BUILD.md §11.3. Pure.
//
// Read from the plot's own model (plotModel → sheetModel rows and the conflicts it
// already draws on the plan — CONFLICT_CODES, the desk's flags included), so the bars,
// the plot and the patch sheet can never disagree. What a bar shows:
//
//   solid      a lamp's channels, address to last
//   hatched    a lamp in conflict (overlap, past 512, the desk refused it) — with the
//              fix offered: move it to the next free address (patch it again)
//   dashed     what the rental list still has to place, at its known footprint, after
//              the channels its type already uses in that universe: "3 to place"
//
// A type whose DMX mode is OWED has no channels to draw. It is not given an assumed
// footprint here: it is listed once under the bars, dashed, with its count — the
// universe it will need is unknown until the rental house sends the mode.

import { CONFLICT_CODES } from './plotModel.js'

export const UNIVERSE_SIZE = 512
const pad3 = (n) => String(n).padStart(3, '0')

/**
 * @param {object} args
 * @param {object} args.model     plotModel(...) — its sheet rows and lamps' conflicts
 * @param {object} [args.rental]  rentalCounts(...) — for "to place" and the owed list
 * @param {object[]} [args.deskFlags] auto-patch's flags ({key, code}) — the lamp the desk
 *        refused or holds elsewhere is the one to move; the lamp it overlaps is not
 * @param {string} [args.projectId]
 */
export const patchBars = ({ model, rental = null, deskFlags = [], projectId = '' }) => {
    const deskIds = new Set((deskFlags || []).map((f) => (projectId && String(f.key || '').startsWith(`${projectId}:`) ? f.key.slice(projectId.length + 1) : f.key)))
    const rows = model.sheet.rows
    const conflictById = new Map(model.lamps.map((l) => [l.id, l.conflicts]))
    const byU = new Map()
    for (const r of rows) {
        if (r.universe == null || !r.footprint) continue
        if (!byU.has(r.universe)) byU.set(r.universe, [])
        byU.get(r.universe).push(r)
    }
    const universes = [...byU.keys()].sort((a, b) => a - b).map((universe) => {
        const list = byU.get(universe).sort((a, b) => a.address - b.address)
        const segments = list.map((r) => {
            const conflicts = (conflictById.get(r.id) || []).filter((c) => CONFLICT_CODES.has(c))
            return { id: r.id, from: r.address, to: Math.min(UNIVERSE_SIZE, r.last), code: r.code, type: r.type, index: r.index, conflict: conflicts.length > 0, conflicts }
        })
        const top = Math.max(...list.map((r) => Math.min(UNIVERSE_SIZE, r.last)))
        const u = model.sheet.universes.find((x) => x.universe === universe)
        const types = new Map()
        for (const r of list) types.set(r.code, (types.get(r.code) || 0) + 1)
        return {
            universe, segments, top,
            used: u?.channels ?? 0,
            free: u?.free ?? UNIVERSE_SIZE,
            makeup: [...types.entries()].map(([code, n]) => `${code.replace(/^UP-/, '')} ×${n}`).join(' · '),
            toPlace: []
        }
    })

    // "n to place": the list's remainder of a patchable type, drawn where that type
    // already lives (after the universe's last used channel), else in a universe to come.
    const owed = []
    for (const item of rental?.items || []) {
        if (item.modeOwed) { owed.push({ code: item.code, type: item.type, ordered: item.ordered, placed: item.placed }); continue }
        if (!item.left || !item.footprint) continue
        const width = item.left * item.footprint
        const home = universes.find((u) => u.segments.some((s) => s.type === item.type))
        const target = home && home.top + width <= UNIVERSE_SIZE ? home : universes.find((u) => u.top + width <= UNIVERSE_SIZE)
        if (target) {
            const from = target.top + 1 + target.toPlace.reduce((s, p) => s + (p.to - p.from + 1), 0)
            target.toPlace.push({ code: item.code, n: item.left, from, to: Math.min(UNIVERSE_SIZE, from + width - 1), footprint: item.footprint })
        } else {
            owed.push({ code: item.code, type: item.type, ordered: item.ordered, placed: item.placed, noRoom: true, width })
        }
    }

    const conflicts = universes.flatMap((u) => u.segments.filter((s) => s.conflict).map((s) => {
        const lamp = model.lamps.find((l) => l.id === s.id)
        return { id: s.id, index: s.index, code: s.code, at: `U${u.universe}.${pad3(s.from)}`, words: [...new Set([...(lamp?.notes || [])])].join(' · ') || s.conflicts.join(', ') }
    }))
    // A lamp the desk refused may not be in any universe at all: list it too.
    for (const l of model.conflicts) {
        if (conflicts.some((c) => c.id === l.id)) continue
        conflicts.push({ id: l.id, index: l.index, code: l.code, at: l.universe != null ? `U${l.universe}.${pad3(l.address)}` : 'not patched', words: l.notes.join(' · ') || l.conflicts.join(', ') })
    }
    // Which to move: the lamps the desk flagged (typed over another, or held elsewhere);
    // when the desk said nothing (no desk here), every lamp in the clash is offered.
    const anyDesk = conflicts.some((c) => deskIds.has(c.id))
    for (const c of conflicts) c.move = anyDesk ? deskIds.has(c.id) : true
    conflicts.sort((a, b) => Number(b.move) - Number(a.move))
    return { universes, owed, conflicts }
}

/** `U1  1–468 / 512` — the bar's own title. */
export const barTitle = (u) => `U${u.universe}  1–${u.top} / ${UNIVERSE_SIZE}`
