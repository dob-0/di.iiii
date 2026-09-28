// THE PLOT'S MODEL — everything view B draws, from the document alone (and the
// desk's flags, when a desk answered). docs/architecture/RIG_BUILD.md §10. Pure.
//
// The rows, the patch and the power come from sheet.js (`sheetModel`), the lamp and
// piece poses from `plotData` and plotGeometry — the same functions the patch sheet
// and the MVR use, so the plot, sheet 2 and sheet 3 can never disagree.

import { plotData, sheetModel } from './sheet.js'
import { boxesOf, freeEnds, piecesOf, trussRuns } from './plotGeometry.js'
import { keyRows, symbolTable } from './plotSymbols.js'
import { venueOf } from './venuePlan.js'
import { countsByType, libraryWithShow, rentalCounts, rentalOf } from './rental.js'
import { orderFlags } from './equipment.js'

// A CONFLICT is something wrong that someone must resolve before the rig is
// plugged — drawn dashed with a flag. An OWED item (a mode the rental house has not
// sent, a channel list) is not a conflict: it is said once, in the key and on the
// sheet, not on 58 symbols.
export const CONFLICT_CODES = new Set([
    'overlap', 'off-the-end', 'index-duplicate', 'desk-differs', 'circuit-over',
    'no-room', 'profile-clash', 'profile-refused', 'group-split', 'unknown-type'
])

// Against the EQUIPMENT LIST (RIG_BUILD.md §13): a lamp past its line's count (the last
// placed), or of a type the list does not carry. Drawn like a conflict — someone must
// resolve it before the rig is plugged, because the lamp will not be there — but it is
// not a patch fault: the patch bars do not hatch it and offer no "move to next free".
export const ORDER_CODES = new Set(['over-order', 'not-on-list'])
const ORDER_WORDS = { 'over-order': 'more placed than the equipment list orders — this is one of the last placed', 'not-on-list': 'its type is not on the equipment list' }

/**
 * @param {object} args
 * @param {object[]} args.entities
 * @param {object} args.library          a type library
 * @param {{key: string, code: string, message?: string}[]} [args.deskFlags]  auto-patch's flags
 * @param {string} [args.projectId]
 */
export const plotModel = ({ entities = [], library: base, deskFlags = [], projectId = '' }) => {
    const library = libraryWithShow(base, entities)
    const order = orderFlags(entities)
    const sheet = sheetModel({ entities, library })
    const data = plotData({ entities, library })
    const rowById = new Map(sheet.rows.map((r) => [r.id, r]))
    const flagsByEntity = new Map()
    for (const f of deskFlags || []) {
        const id = projectId && String(f.key || '').startsWith(`${projectId}:`) ? f.key.slice(projectId.length + 1) : f.key
        if (!flagsByEntity.has(id)) flagsByEntity.set(id, [])
        flagsByEntity.get(id).push(f)
    }
    const byId = new Map(entities.map((e) => [e.id, e]))
    const lamps = data.lamps.map((l) => {
        const row = rowById.get(l.id)
        const desk = flagsByEntity.get(l.id) || []
        const ordered = order.get(l.id)
        const codes = [...new Set([...(row?.flags || []), ...desk.map((f) => f.code), ...(ordered ? [ordered] : [])])]
        const conflicts = codes.filter((c) => CONFLICT_CODES.has(c) || ORDER_CODES.has(c))
        const entity = byId.get(l.id)
        return {
            ...l,
            at: [l.mount[0], l.mount[2]],
            name: entity?.name || '',
            type: row?.type || null,
            mode: row?.mode || null,
            footprint: row?.footprint ?? null,
            last: row?.last ?? null,
            watts: row?.watts ?? null,
            flags: codes,
            conflicts,
            notes: [...(row?.notes || []), ...desk.map((f) => f.message).filter(Boolean), ...(ordered ? [ORDER_WORDS[ordered]] : [])],
            colour: entity?.components?.light?.color || null,
            row
        }
    })
    const pieces = piecesOf(entities)
    const boxes = boxesOf(entities)
    const { entity: venueEntity, plan } = venueOf(entities)
    const types = library?.types || []
    const table = symbolTable(types)
    const runs = trussRuns(pieces)
    // The rental list, when the project has one (RIG_BUILD.md §11): the key can say
    // "3 left of 12" beside each type.
    const rental = rentalCounts({ entities, library, list: rentalOf(entities).list })
    const byType = countsByType(rental)
    return {
        sheet,
        lamps,
        pieces,
        boxes,
        runs,
        freeEnds: freeEnds(runs, pieces),
        venue: plan,
        venueEntityId: venueEntity?.id || null,
        table,
        key: keyRows({ rows: sheet.rows, types, table }).map((k) => (byType.get(k.type)?.ordered ? { ...k, rental: byType.get(k.type) } : k)),
        rental,
        conflicts: lamps.filter((l) => l.conflicts.length)
    }
}

/**
 * The title block's running totals (sketch B): channels by universe, power,
 * circuits. Strings, as printed.
 */
export const titleTotals = (sheet) => {
    const p = sheet.power
    return {
        channels: sheet.universes.map((u) => `U${u.universe} ${u.channels}`).join(' · ') || 'nothing patched',
        power: `${(p.totalW / 1000).toFixed(1)} kW · ${p.circuits.length} circuits`,
        circuits: `load alone ≥ ${p.minCircuitsByLoad} × ${p.circuit.amps} A`,
        fixtures: `${sheet.totals.lamps} fixtures · ${sheet.totals.patched} patched`
    }
}
