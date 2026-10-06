import { plotModel } from './plotModel.js'
import { rigLooksOf } from './looks.js'
import { rentalOf } from './rental.js'
import { FLAG_WORDS } from './sheet.js'

// Where the show stands, step by step, read from the document alone (RIG_BUILD.md §14).
// The steps row prints these beside the steps and the room's row uses `suggested` for
// its "next". Nothing here is a claim the document does not hold: no list means "no
// list yet", not zero; a step with nothing to count says nothing.
//
// `deskFlags` (the desk's own conflicts) are optional: the rig pages that read the desk
// pass them, the room does not ask the desk anything.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * @returns {{ said: Record<string, string>, hints: Record<string, string>, done: Record<string, boolean>, warn: Record<string, boolean>, suggested: string, totals: object }}
 */
export const rigProgress = ({ entities = [], library, deskFlags = [], projectId = '', desk = null }) => {
    const model = plotModel({ entities, library, deskFlags, projectId, desk })
    const ordered = model.rental?.totals?.ordered || 0
    const placed = model.rental?.totals?.placed || 0
    // The equipment page counts every unit on the list, a cable or a node included;
    // the room counts only what hangs (the lamps and effects on the list).
    const list = rentalOf(entities).list
    const hasList = Boolean(list?.items?.length)
    const units = (list?.items || []).reduce((sum, item) => sum + (Number(item.ordered) || 0), 0)
    const byHand = model.sheet.totals.byHand || 0
    // a device run by hand is never addressed: the patch step counts only what goes on DMX
    const lamps = model.sheet.totals.lamps - byHand
    const patched = model.sheet.totals.patched
    const conflicts = model.conflicts.length
    // What the conflicts are made of, by cause, in words (the sheet's Flags list names each lamp).
    const byCause = new Map()
    for (const lamp of model.conflicts) for (const code of lamp.conflicts) byCause.set(code, (byCause.get(code) || 0) + 1)
    const causes = [...byCause].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${n} ${FLAG_WORDS[code] || code}`)
    const looks = rigLooksOf(entities)?.looks?.length || 0

    const said = {
        equipment: hasList ? `${units} on order` : 'no list yet',
        build: ordered ? `${placed} of ${ordered} placed` : lamps ? `${plural(lamps, 'lamp')} placed` : '',
        plot: '',
        cards: looks ? plural(looks, 'look') : '',
        patch: lamps ? `${patched} of ${lamps} addressed${byHand ? ` · ${byHand} by hand` : ''}${conflicts ? ` · ${conflicts} to decide` : ''}` : '',
        crew: ''
    }
    const done = {
        equipment: units > 0,
        build: ordered > 0 ? placed >= ordered : lamps > 0,
        plot: false,
        cards: looks > 0,
        patch: lamps > 0 && patched >= lamps && conflicts === 0,
        crew: false
    }
    const hints = conflicts ? {
        patch: `${conflicts} to decide (${causes.join(', ')}) — the patch sheet's Flags list, under "To decide", names each one. ${lamps - patched ? `${lamps - patched} of the ${lamps} lamps have no address yet.` : ''}`.trim()
    } : {}
    const warn = { patch: conflicts > 0 }
    // The step the show is waiting on, in the order it is made. The plot has no "done"
    // of its own (it is a way of checking); the crew link is the last thing handed over.
    const suggested = ['equipment', 'build', 'cards', 'patch'].find((k) => !done[k]) || 'crew'
    return { said, hints, done, warn, suggested, totals: { units, ordered, placed, lamps, patched, conflicts, looks } }
}
