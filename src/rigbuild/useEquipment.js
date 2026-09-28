import { useCallback, useMemo, useState } from 'react'
import {
    catalogueLine, equipmentModel, listOps, oflType, owedType, reduction,
    withDays, withLine, withLineFields, withoutLine, withQuantity
} from './equipment.js'
import { inventoryTiles } from './inventory.js'
import { ITEMS, groupOf, itemFor } from './items/index.js'
import { deleteOps } from './plotEdits.js'
import { typeById, typeIdOf } from './fixtureTypes.js'

// THE EQUIPMENT LIST'S EDITS, and what they do to the rig (RIG_BUILD.md §13). Every edit
// is one batch of ops through the caller's history (undo takes back the list change and
// the lamps it removed together); the lamps' desk fixtures follow through auto-patch
// (a deleted lamp's fixture is pruned by its rigKey, §4.2).
//
// Lowering a line below what is placed never removes a lamp silently: `pending` holds the
// question (remove the last placed, pick which, or keep them flagged over the order) until
// the person answers.

const PRICE_FILE = 'lights_rental_quote_calculator.xlsx'

// The rental house's headings to a type category, for a code with no type yet (its mode
// owed): what the plot draws and whether the hand stands it as a box or hangs a beam.
const HEADING_CATEGORY = { 'Moving heads': 'moving-head', 'PAR & wash': 'par', Lasers: 'laser' }
const EFFECT_WORDS = [[/fog|mist/i, 'fog-machine'], [/smoke/i, 'smoke-machine'], [/co2/i, 'co2-jet'], [/spark/i, 'spark-machine']]
const categoryForCatalogue = (cat) => {
    if (HEADING_CATEGORY[cat.category]) return HEADING_CATEGORY[cat.category]
    if (cat.category === 'Atmosphere & FX') return EFFECT_WORDS.find(([re]) => re.test(`${cat.label} ${cat.details}`))?.[1] || 'effect'
    return 'other'
}

export function useEquipment({ entities, library, apply, readOnly = false }) {
    const model = useMemo(() => equipmentModel({ entities, library }), [entities, library])
    const tiles = useMemo(() => inventoryTiles({ model, entities, itemFor, groupOf, extras: [...ITEMS.values()] }), [model, entities])
    const [pending, setPending] = useState(null)
    const [said, setSaid] = useState('')

    const write = useCallback((list, message, extra = []) => {
        if (readOnly) return
        apply([...listOps(entities, list), ...extra], message)
        setSaid(message)
    }, [apply, entities, readOnly])

    const list = model.list

    /** Set a line's quantity; below what is placed, ask first. */
    const setQuantity = useCallback((tile, n) => {
        if (!tile.key || !list) return
        const to = Math.max(0, Math.round(n))
        const next = withQuantity(list, tile.key, to)
        if (tile.typeId && tile.line?.kind === 'fixture') {
            const r = reduction({ entities, type: tile.typeId, to })
            if (r.over > 0 && to < tile.taking) { setPending({ tile, reduction: r, list: next, verb: `${tile.code}: ${tile.taking} → ${to}` }); return }
        }
        write(next, `${tile.code}: ${to}`)
    }, [list, entities, write])

    /** Skip: the line leaves the list. Placed lamps of its type: ask first. */
    const skip = useCallback((tile) => {
        if (!tile.key || !list) return
        const next = withoutLine(list, tile.key)
        if (tile.typeId && tile.line?.kind === 'fixture') {
            const r = reduction({ entities, type: tile.typeId, to: 0 })
            if (r.over > 0) { setPending({ tile, reduction: r, list: next, verb: `${tile.code} off the list` }); return }
        }
        write(next, `${tile.code} is off the list`)
    }, [list, entities, write])

    /** The answer to a pending reduction: 'last', 'keep', or an array of lamp ids. */
    const answer = useCallback((how) => {
        const p = pending
        if (!p) return
        setPending(null)
        if (how === 'cancel') return
        if (how === 'keep') { write(p.list, `${p.verb} · ${p.reduction.over} kept, flagged over the order`); return }
        const ids = how === 'last' ? p.reduction.last : how
        write(p.list, `${p.verb} · removed ${ids.length} placed ${p.tile.code}${how === 'last' ? ' (the last placed)' : ''} — the desk follows`, deleteOps(ids))
    }, [pending, write])

    /** Take a tile that is not on the list yet: a price-list code, a library type, a piece. */
    const take = useCallback((tile, { ordered = 1, from = null, supplier = '', note = '' } = {}) => {
        const extra = { ...(from && from !== 'rental' ? { from } : {}), ...(supplier ? { supplier } : {}), ...(note ? { note } : {}) }
        if (tile.cat) {
            const control = tile.cat.category === 'Control & power'
            const known = typeById(library, typeIdOf(tile.cat.code))
            const line = { ...catalogueLine(tile.cat, { ordered, kind: control ? 'item' : 'fixture', file: `${PRICE_FILE} "Price list"` }), ...extra }
            // A lamp from the price list with no type yet: its code, its words, its mode owed.
            const type = !control && !known ? owedType({ code: tile.cat.code, label: tile.cat.label, category: categoryForCatalogue(tile.cat), cells: tile.cat.cells, file: PRICE_FILE }) : null
            write(withLine(list, line, type), `${tile.code} ×${ordered} taken${type ? ' · its DMX mode is owed' : ''}`)
            return
        }
        if (tile.piece) {
            const line = { code: tile.name, type: tile.piece, kind: 'item', category: tile.piece.startsWith('truss') ? 'truss' : tile.piece === 'tower' ? 'tower' : 'deck', piece: tile.piece, ordered, from: from || 'other', ...(supplier ? { supplier } : {}), ...(note ? { note } : {}), source: 'the rig\'s own piece (src/rigbuild/pieces.js)' }
            write(withLine(list, line), `${tile.name} ×${ordered} on the list`)
            return
        }
        if (tile.typeId) {
            const type = typeById(library, tile.typeId)
            write(withLine(list, { code: type.code, type: type.id, ordered, label: type.product || '', source: 'the type library', ...extra }), `${type.code} ×${ordered} taken`)
        }
    }, [library, list, write])

    /** A non-DMX item (a node, a splitter, a cable): counted and costed, never patched. */
    const addItem = useCallback(({ code, category = 'other', ordered = 1, from = 'other', supplier = '', rate = null, watts = null, note = '', label = '' }) => {
        const line = { code: String(code).trim().slice(0, 40), type: typeIdOf(`item-${code}`).slice(0, 40), kind: 'item', category, ordered, ...(from !== 'rental' ? { from } : {}), ...(supplier ? { supplier } : {}), ...(rate != null && rate !== '' ? { rate: Number(rate) } : {}), ...(watts != null && watts !== '' ? { watts: Number(watts) } : {}), ...(note ? { note } : {}), ...(label ? { label } : {}), source: 'added by hand on the equipment page' }
        write(withLine(list, line), `${line.code} ×${ordered} on the list (${category}, not patched)`)
    }, [list, write])

    /** A new type from the Open Fixture Library (the desk's import), and its line. */
    const addOfl = useCallback(({ manufacturer, manufacturerName, key, described, from: via, ordered = 1, lineFrom = 'other', supplier = '', rate = null, note = '' }) => {
        const type = oflType({ manufacturer, key, described: { ...described, manufacturerName }, fetchedAt: new Date().toISOString(), from: via })
        const line = { code: type.code, type: type.id, ordered, label: `${type.maker} ${type.model}`, source: type.sources.OFL.url, ...(lineFrom !== 'rental' ? { from: lineFrom } : {}), ...(supplier ? { supplier } : {}), ...(rate != null && rate !== '' ? { rate: Number(rate) } : {}), ...(note ? { note } : {}) }
        write(withLine(list, line, type), `${type.code} ×${ordered} taken from the Open Fixture Library${type.modesOwed ? ' · no mode known: owed' : ` · ${type.modes.length} mode${type.modes.length === 1 ? '' : 's'}, ${type.defaultMode} by default`}`)
        return type
    }, [list, write])

    const setFields = useCallback((tile, fields) => {
        if (!tile.key || !list) return
        write(withLineFields(list, tile.key, fields), `${tile.code}: ${Object.keys(fields).join(', ')} changed`)
    }, [list, write])

    const setDays = useCallback((days) => {
        write(withDays(list, days), days.from && days.to ? `rental ${days.from} → ${days.to}` : `rental days: ${days.days || 'unset'}`)
    }, [list, write])

    return { model, tiles, pending, answer, setQuantity, skip, take, addItem, addOfl, setFields, setDays, said, readOnly }
}

export default useEquipment
