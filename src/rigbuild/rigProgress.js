import { plotModel } from './plotModel.js'
import { rigLooksOf } from './looks.js'
import { rentalOf } from './rental.js'

// Where the show stands, step by step, read from the document alone (RIG_BUILD.md §14).
// The steps row prints these beside the steps and the room's row uses `suggested` for
// its "next". Nothing here is a claim the document does not hold: no list means "no
// list yet", not zero; a step with nothing to count says nothing.
//
// `deskFlags` (the desk's own conflicts) are optional: the rig pages that read the desk
// pass them, the room does not ask the desk anything.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * @returns {{ said: Record<string, string>, done: Record<string, boolean>, warn: Record<string, boolean>, suggested: string, totals: object }}
 */
export const rigProgress = ({ entities = [], library, deskFlags = [], projectId = '' }) => {
    const model = plotModel({ entities, library, deskFlags, projectId })
    const ordered = model.rental?.totals?.ordered || 0
    const placed = model.rental?.totals?.placed || 0
    // The equipment page counts every unit on the list, a cable or a node included;
    // the room counts only what hangs (the lamps and effects on the list).
    const list = rentalOf(entities).list
    const hasList = Boolean(list?.items?.length)
    const units = (list?.items || []).reduce((sum, item) => sum + (Number(item.ordered) || 0), 0)
    const lamps = model.sheet.totals.lamps
    const patched = model.sheet.totals.patched
    const conflicts = model.conflicts.length
    const looks = rigLooksOf(entities)?.looks?.length || 0

    const said = {
        equipment: hasList ? `${units} on order` : 'no list yet',
        build: ordered ? `${placed} of ${ordered} placed` : lamps ? `${plural(lamps, 'lamp')} placed` : '',
        plot: '',
        cards: looks ? plural(looks, 'look') : '',
        patch: lamps ? `${patched} of ${lamps} addressed${conflicts ? ` · ! ${conflicts}` : ''}` : '',
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
    const warn = { patch: conflicts > 0 }
    // The step the show is waiting on, in the order it is made. The plot has no "done"
    // of its own (it is a way of checking); the crew link is the last thing handed over.
    const suggested = ['equipment', 'build', 'cards', 'patch'].find((k) => !done[k]) || 'crew'
    return { said, done, warn, suggested, totals: { units, ordered, placed, lamps, patched, conflicts, looks } }
}
