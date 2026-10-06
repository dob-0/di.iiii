// THE EQUIPMENT LIST — the show's own list of what it takes, in what quantity, from
// where. docs/architecture/RIG_BUILD.md §13. Pure: the document in, a model or ops out.
//
// It is the rental list of §11.1 grown up, kept in the same place
// (`components.rentalList` on the show's entity, RIG_SHOW_ID) so that every view that
// already counts against it — A's hotbar, B's key, C's cards — follows an edit here
// with no second copy. The rental house's spreadsheet is where it STARTS
// (scripts/rigbuild/rental.mjs); from there a line can be added (a known type, a new
// type from the Open Fixture Library, a code from the rental house's price list, or a
// non-DMX item such as a node or a cable), deleted, or given another quantity. Every
// line keeps its source.
//
// Cost follows the quote's own rule, read from the spreadsheet: day 1 at the full
// rate, each further day at 50% ("Price list"!A2, "Price data"!H2 = 0.5, and the
// sheet's own 2-day / 3-day / 1-week columns, which a test holds this function to).

import { RIG_SHOW_ID, libraryWithShow, rentalCounts, rentalOf } from './rental.js'

export { libraryWithShow }
import { isLamp } from './autoPatch.js'
import { modeOf, powerOf, typeById, typeIdOf } from './fixtureTypes.js'
import { pieceKindOf } from './pieces.js'
import { toCsv } from './sheet.js'

export const UNIVERSE_SLOTS = 512

// Where a line comes from. The rental house is the default (a line with no `from`).
export const FROM = ['rental', 'own', 'other']
export const FROM_WORDS = { rental: 'rental house', own: 'own', other: 'other supplier' }
export const fromOf = (item) => (item?.from === 'own' || item?.from === 'other' ? item.from : 'rental')

// A non-DMX item: counted and costed, never hung and never patched.
export const ITEM_CATEGORIES = [
    ['node', 'network node (Art-Net / sACN)'],
    ['splitter', 'DMX splitter / amplifier'],
    ['cable', 'cable'],
    ['control', 'console / controller'],
    ['power', 'power distribution'],
    ['truss', 'truss'],
    ['tower', 'tower'],
    ['deck', 'stage deck'],
    ['other', 'other']
]
export const isItemLine = (item) => item?.kind === 'item'

// The quote's day rule (the spreadsheet's own words and cells).
export const DAY_RULE = Object.freeze({
    extraDay: 0.5,
    source: '"Price list"!A2 "Day 1 full rate; each additional day 50%." · "Quote"!E7 · "Price data"!H2 = 0.5'
})

/** Billed day-equivalents for `days` rental days: 1 + (days − 1) × extraDay. */
export const billedDays = (days, extraDay = DAY_RULE.extraDay) => {
    const d = Number(days)
    if (!Number.isInteger(d) || d < 1) return null
    return 1 + (d - 1) * extraDay
}

/** Inclusive days from one ISO date to another (17.10 → 17.10 is one day). */
export const daysBetween = (from, to) => {
    const a = Date.parse(`${from}T00:00:00Z`)
    const b = Date.parse(`${to}T00:00:00Z`)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
    return Math.round((b - a) / 86400000) + 1
}

// ---- the show's own types --------------------------------------------------------

// OFL categories to the rig's. Anything else is 'other' (a shape of its own on the plot).
const OFL_CATEGORY = [
    ['Hazer', 'hazer'], ['Smoke', 'smoke-machine'], ['Moving Head', 'moving-head'], ['Scanner', 'moving-head'],
    ['Laser', 'laser'], ['Matrix', 'matrix'], ['Pixel Bar', 'bar'], ['Strobe', 'strobe'],
    ['Blinder', 'blinder'], ['Color Changer', 'wash'], ['Dimmer', 'dimmer'], ['Effect', 'effect'], ['Fan', 'effect']
]
export const categoryFromOfl = (categories = []) => {
    for (const [ofl, ours] of OFL_CATEGORY) if (categories.includes(ofl)) return ours
    return 'other'
}

/**
 * A fixture type from an Open Fixture Library fixture, as the desk describes it
 * (GET /light/api/library/fixture — library.js `describe`). Every mode OFL lists with a
 * plain channel list becomes a mode with its channels (the desk's roles, OFL's names);
 * a mode with a matrix insert has no fixed footprint the desk can read and is left out
 * and said to be owed. A fixture with no usable mode is `modesOwed`: its lamps are
 * placed and never patched. Physical numbers are OFL's, marked as OFL's.
 */
export const oflType = ({ manufacturer, key, described, fetchedAt = '', from = '' }) => {
    const code = String(described?.name ? `${described.manufacturerName || manufacturer} ${described.name}` : `${manufacturer} ${key}`).replace(/\s+/g, ' ').trim().slice(0, 40)
    const url = `https://open-fixture-library.org/${manufacturer}/${key}`
    const modes = []
    const owedModes = []
    for (const m of described?.modes || []) {
        const names = Array.isArray(m.channelNames) ? m.channelNames : null
        const plain = names && !m.matrix && Array.isArray(m.roles) && m.roles.length === names.length && names.length > 0
        if (!plain) { owedModes.push(m.name); continue }
        const name = String(m.shortName || m.name || `${names.length}ch`).slice(0, 32)
        if (modes.some((x) => x.name === name)) continue
        modes.push({ name, footprint: names.length, channels: m.roles.map((role, i) => ({ role, label: String(names[i] || role).slice(0, 40) })) })
    }
    const physical = described?.physical || {}
    const sourced = (value) => ({ value, src: 'OFL', basis: 'OFL' })
    const type = {
        id: `ofl-${manufacturer}-${key}`.toLowerCase().slice(0, 40),
        code,
        maker: String(described?.manufacturerName || manufacturer).slice(0, 80),
        model: String(described?.name || key).slice(0, 80),
        identified: 'OFL',
        category: categoryFromOfl(described?.categories || []),
        modes,
        defaultMode: modes[0]?.name || null,
        modesOwed: modes.length === 0,
        sources: {
            OFL: {
                url,
                what: `Open Fixture Library: ${described?.name || key}${described?.lastModifyDate ? `, last modified ${described.lastModifyDate}` : ''}${from ? ` (via the desk, ${from})` : ''}`,
                licence: 'MIT (Open Fixture Library)',
                accessed: fetchedAt.slice(0, 10)
            }
        },
        ofl: { manufacturer, key, lastModifyDate: described?.lastModifyDate || '', fetchedAt }
    }
    if (Number.isFinite(physical.power) && physical.power >= 0) type.power_w = sourced(physical.power)
    if (Number.isFinite(physical.weight) && physical.weight >= 0) type.weight_kg = sourced(physical.weight)
    if (Array.isArray(physical.dimensions) && physical.dimensions.length === 3 && physical.dimensions.every(Number.isFinite)) type.size_mm = { ...sourced(physical.dimensions), order: 'W x H x D (OFL)' }
    const notes = []
    if (owedModes.length) notes.push(`mode${owedModes.length === 1 ? '' : 's'} ${owedModes.join(', ')}: matrix or no plain channel list — owed`)
    if (!modes.length) notes.push('no DMX mode known — owed')
    notes.push('which mode the unit is set to is the crew\'s; the first is a planning default')
    type.note = notes.join('; ').slice(0, 240)
    return type
}

/**
 * A type for a rental code with no type in the library (a price-list line such as the
 * UP-236 mist machine): the code and its words, and its mode OWED — never invented.
 */
export const owedType = ({ code, label = '', category = 'other', cells = '', file = '' }) => ({
    id: typeIdOf(code),
    code,
    maker: null,
    model: null,
    identified: 'OWED',
    category,
    modes: [],
    defaultMode: null,
    modesOwed: true,
    sources: { Q: { url: '', what: `${file || 'the rental house\'s price list'}${cells ? ` ${cells}` : ''}: "${label}"` } },
    note: 'the rental house\'s code only: maker, DMX mode and power owed'
})

// ---- the model -------------------------------------------------------------------

/** A line's key: the fixture type for a fixture, `item:<code>` for an item. */
export const lineKey = (item) => (isItemLine(item) ? `item:${item.code}` : item.type)

/**
 * Lamps packed into universes in list order, a lamp never split across two
 * (ANSI E1.11: a footprint lies within one universe's 512 slots). A planning count.
 */
export const universesNeeded = (blocks) => {
    let universes = 0
    let free = 0
    for (const { count, footprint } of blocks) {
        if (!footprint || footprint > UNIVERSE_SLOTS) continue
        for (let i = 0; i < count; i++) {
            if (free < footprint) { universes++; free = UNIVERSE_SLOTS }
            free -= footprint
        }
    }
    return universes
}

/**
 * Everything the equipment page shows, from the document alone.
 * @returns {{ list, lines: object[], totals: object, owed: string[], catalogue: object[], terms: object[] }}
 */
export const equipmentModel = ({ entities = [], library }) => {
    const { entity, list } = rentalOf(entities)
    const lib = libraryWithShow(library, list)
    const counts = rentalCounts({ entities, library: lib, list })
    const pieces = new Map()
    for (const e of entities) {
        const k = pieceKindOf(e)
        if (k) pieces.set(k, (pieces.get(k) || 0) + 1)
    }
    const extraDay = list?.rule?.extraDay ?? DAY_RULE.extraDay
    const days = list?.days ?? (list?.dates?.from && list?.dates?.to ? daysBetween(list.dates.from, list.dates.to) : null)
    const billed = billedDays(days, extraDay)
    const sourceItems = list?.items || []
    const lines = counts.items.map((c, i) => {
        const item = c.unlisted ? null : sourceItems[i]
        const type = item && isItemLine(item) ? null : typeById(lib, c.type)
        const mode = type ? modeOf(type, type.defaultMode) : null
        const kind = item && isItemLine(item) ? 'item' : 'fixture'
        const placed = kind === 'item' ? (item.piece ? pieces.get(item.piece) || 0 : null) : c.placed
        const watts = kind === 'item' ? (item.watts ?? null) : (type ? powerOf(type) : null)
        const flags = []
        if (c.stock != null && c.ordered > c.stock) flags.push('over-stock')
        if (placed != null && placed > c.ordered) flags.push(c.unlisted ? 'not-on-list' : 'over-order')
        if (kind === 'fixture' && type?.modesOwed) flags.push('mode-owed')
        if (kind === 'fixture' && mode && !mode.channels) flags.push('channels-owed')
        if (kind === 'fixture' && !type) flags.push('type-unknown')
        if (c.rate == null && fromOf(item) === 'rental' && !c.unlisted) flags.push('rate-unknown')
        return {
            key: c.unlisted ? c.type : lineKey(item),
            index: c.unlisted ? null : i,
            code: c.code,
            type: c.type,
            kind,
            label: c.label || type?.product || type?.model || '',
            category: kind === 'item' ? (item.category || 'other') : (type?.category || null),
            from: c.unlisted ? null : fromOf(item),
            supplier: item?.supplier || '',
            source: c.source,
            note: item?.note || '',
            ordered: c.ordered,
            stock: c.stock,
            rate: c.rate,
            placed,
            over: placed != null ? Math.max(0, placed - c.ordered) : 0,
            left: placed != null ? Math.max(0, c.ordered - placed) : null,
            unlisted: c.unlisted,
            mode: mode?.name || null,
            footprint: mode?.footprint ?? null,
            modeOwed: kind === 'fixture' ? Boolean(type?.modesOwed) : null,
            channelsOwed: Boolean(mode && !mode.channels),
            watts,
            piece: item?.piece || null,
            showType: Boolean(list?.types?.some((t) => t.id === c.type)),
            ofl: type?.ofl || null,
            cost: c.rate != null && billed != null && !c.unlisted ? c.rate * c.ordered * billed : null,
            perDay: c.rate != null && !c.unlisted ? c.rate * c.ordered : null,
            flags
        }
    })
    const listed = lines.filter((l) => !l.unlisted)
    const sum = (f) => listed.reduce((s, l) => s + (f(l) || 0), 0)
    const fixtures = listed.filter((l) => l.kind === 'fixture')
    const byFrom = Object.fromEntries(FROM.map((f) => [f, listed.filter((l) => l.from === f)]))
    const totals = {
        lines: listed.length,
        units: sum((l) => l.ordered),
        fixtures: fixtures.reduce((s, l) => s + l.ordered, 0),
        items: listed.filter((l) => l.kind === 'item').reduce((s, l) => s + l.ordered, 0),
        placed: fixtures.reduce((s, l) => s + (l.placed || 0), 0),
        over: lines.reduce((s, l) => s + l.over, 0),
        days,
        billed,
        extraDay,
        perDay: sum((l) => l.perDay),
        cost: billed != null ? sum((l) => l.cost) : null,
        costByFrom: Object.fromEntries(FROM.map((f) => [f, billed != null ? byFrom[f].reduce((s, l) => s + (l.cost || 0), 0) : null])),
        unpriced: listed.filter((l) => l.rate == null).map((l) => l.code),
        watts: sum((l) => (l.watts != null ? l.watts * l.ordered : 0)),
        wattsUnknown: listed.filter((l) => l.watts == null && (l.kind === 'fixture')).map((l) => l.code),
        channels: fixtures.reduce((s, l) => s + (l.footprint ? l.footprint * l.ordered : 0), 0),
        universes: universesNeeded(fixtures.map((l) => ({ count: l.ordered, footprint: l.footprint }))),
        modesOwed: fixtures.filter((l) => l.modeOwed).map((l) => `${l.code} ×${l.ordered}`)
    }
    const owed = []
    for (const l of fixtures) if (l.modeOwed && l.ordered) owed.push(`${l.code}: DMX mode`)
    for (const l of fixtures) if (!l.modeOwed && l.channelsOwed && l.ordered) owed.push(`${l.code} ${l.mode}: channel list`)
    for (const l of listed) if (l.flags.includes('over-stock')) owed.push(`${l.code}: ${l.ordered} ordered, the house lists ${l.stock}`)
    for (const l of listed) if (l.flags.includes('rate-unknown')) owed.push(`${l.code}: day rate`)
    return { entity, list, library: lib, lines, totals, owed, catalogue: list?.catalogue || [], terms: list?.terms || [] }
}

// ---- edits: a new list, then one op ----------------------------------------------

/** The op that writes a whole list onto the show's entity (created when missing). */
export const listOps = (entities, list) => {
    const show = entities.find((e) => e.id === RIG_SHOW_ID)
    if (show) return [{ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rentalList', patch: list } }]
    return [{
        type: 'createEntity',
        payload: { entity: { id: RIG_SHOW_ID, type: 'group', name: 'the show — equipment list, looks', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rentalList: list } } }
    }]
}

const emptyList = (name = 'equipment list') => ({ name, source: '', writtenAt: '', currency: 'AMD', items: [] })

/** The list with one line's quantity set. */
export const withQuantity = (list, key, ordered) => ({
    ...list,
    items: list.items.map((item) => (lineKey(item) === key ? { ...item, ordered: Math.max(0, Math.min(100000, Math.round(ordered))) } : item))
})

/** The list with one line's fields changed (from, supplier, rate, note, …). */
export const withLineFields = (list, key, fields) => ({
    ...list,
    items: list.items.map((item) => {
        if (lineKey(item) !== key) return item
        const next = { ...item, ...fields }
        for (const [k, v] of Object.entries(next)) if (v === '' || v == null) delete next[k]
        if (next.from === 'rental') delete next.from
        return next
    })
})

/** The list without one line. The line's show type stays (a lamp may still use it). */
export const withoutLine = (list, key) => ({ ...list, items: list.items.filter((item) => lineKey(item) !== key) })

/**
 * The list with a line added (or, when a line with its key exists, its quantity raised
 * by the new line's). A show type rides with it when given.
 */
export const withLine = (list, line, type = null) => {
    const base = list || emptyList()
    const key = lineKey(line)
    const existing = base.items.find((item) => lineKey(item) === key)
    const items = existing
        ? base.items.map((item) => (item === existing ? { ...item, ordered: item.ordered + line.ordered } : item))
        : [...base.items, line]
    const types = type && !(base.types || []).some((t) => t.id === type.id) ? [...(base.types || []), type] : base.types
    return { ...base, items, ...(types ? { types } : {}) }
}

/** The list with its rental days (and dates) set. */
export const withDays = (list, { days = null, from = '', to = '' } = {}) => {
    const next = { ...(list || emptyList()) }
    const span = from && to ? daysBetween(from, to) : null
    const d = span ?? (Number.isInteger(days) && days >= 1 ? days : null)
    if (d) next.days = d
    else delete next.days
    if (from || to) next.dates = { from, to }
    else delete next.dates
    if (!next.rule) next.rule = { extraDay: DAY_RULE.extraDay, source: DAY_RULE.source }
    return next
}

/** A line for a code on the rental house's price list, with its cells. */
export const catalogueLine = (entry, { ordered = 1, kind = 'fixture', file = 'the price list' } = {}) => ({
    code: entry.code,
    type: typeIdOf(entry.code),
    ordered,
    ...(kind === 'item' ? { kind: 'item', category: entry.category === 'Control & power' ? 'control' : 'other' } : {}),
    ...(entry.stock != null ? { stock: entry.stock } : {}),
    ...(entry.rate != null ? { rate: entry.rate } : {}),
    label: entry.label,
    source: `${file}${entry.cells ? ` ${entry.cells}` : ''} · added from the price list`
})

// ---- what an edit does to the lamps already placed -------------------------------

/**
 * Lowering a line below what is placed (or deleting a placed type): which lamps are
 * above the new count. `last` are the last placed — the lamps latest in the document,
 * which is the order they were placed in. Nothing is removed here; the caller asks.
 */
export const reduction = ({ entities = [], type, to }) => {
    const lamps = entities.filter((e) => isLamp(e) && e.components.fixture.type === type)
    const over = Math.max(0, lamps.length - Math.max(0, to))
    return {
        type,
        placed: lamps.length,
        to: Math.max(0, to),
        over,
        last: over ? lamps.slice(lamps.length - over).map((e) => e.id) : [],
        lamps: lamps.map((e) => {
            const f = e.components.fixture
            return {
                id: e.id,
                name: e.name || '',
                position: f.position || '',
                unit: f.unit ?? null,
                index: f.index ?? null,
                patch: f.universe != null && f.address != null ? `U${f.universe}.${String(f.address).padStart(3, '0')}` : ''
            }
        })
    }
}

/**
 * Which lamps of each type are OVER the list: the last placed, past the line's count
 * (or every lamp of a type the list does not carry, when there is a list at all).
 * @returns {Map<string, 'over-order'|'not-on-list'>} entity id → flag
 */
export const orderFlags = (entities = []) => {
    const out = new Map()
    const { list } = rentalOf(entities)
    if (!list) return out
    const ordered = new Map()
    for (const item of list.items || []) if (!isItemLine(item)) ordered.set(item.type, (ordered.get(item.type) || 0) + item.ordered)
    const byType = new Map()
    for (const e of entities) {
        if (!isLamp(e)) continue
        const t = e.components.fixture.type
        if (!byType.has(t)) byType.set(t, [])
        byType.get(t).push(e.id)
    }
    for (const [t, ids] of byType) {
        if (!ordered.has(t)) { for (const id of ids) out.set(id, 'not-on-list'); continue }
        const n = ordered.get(t)
        for (const id of ids.slice(n)) out.set(id, 'over-order')
    }
    return out
}

// ---- export ----------------------------------------------------------------------

export const EQUIPMENT_COLUMNS = [
    { label: 'code', value: (l) => l.code },
    { label: 'item', value: (l) => l.label },
    { label: 'kind', value: (l) => (l.kind === 'item' ? `item (${l.category})` : 'fixture') },
    { label: 'from', value: (l) => (l.from ? `${FROM_WORDS[l.from]}${l.supplier ? `: ${l.supplier}` : ''}` : 'not on the list') },
    { label: 'qty', value: (l) => l.ordered },
    { label: 'stock', value: (l) => l.stock ?? '' },
    { label: 'placed', value: (l) => l.placed ?? '' },
    { label: 'mode', value: (l) => (l.kind === 'item' ? '' : l.modeOwed ? 'owed' : `${l.mode} (${l.footprint} ch)`) },
    { label: 'W each', value: (l) => l.watts ?? '' },
    { label: 'rate/day', value: (l) => l.rate ?? '' },
    { label: 'line total', value: (l) => l.cost ?? '' },
    { label: 'source', value: (l) => l.source || '' },
    { label: 'note', value: (l) => l.note || '' },
    { label: 'flags', value: (l) => l.flags.join('; ') }
]

/** The list as CSV (RFC 4180, via the sheet's writer). */
export const equipmentCsv = (model) => toCsv(model.lines, EQUIPMENT_COLUMNS)

export const FLAG_WORDS = {
    'over-stock': 'above the house\'s stock',
    'over-order': 'more placed than ordered',
    'not-on-list': 'placed, not on the list',
    'mode-owed': 'DMX mode owed',
    'channels-owed': 'channel list owed',
    'type-unknown': 'no fixture type',
    'rate-unknown': 'price private (not in the public repo)'
}
