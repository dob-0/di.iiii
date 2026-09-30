import { describe, expect, it } from 'vitest'
import {
    billedDays, catalogueLine, daysBetween, equipmentCsv, equipmentModel, libraryWithShow, lineKey, listOps,
    oflType, orderFlags, reduction, universesNeeded, withDays, withLine, withLineFields, withoutLine, withQuantity
} from './equipment.js'
import { RIG_SHOW_ID, rentalCounts } from './rental.js'
import { hotbarSlots } from './hotbar.js'
import { plotModel } from './plotModel.js'
import { patchBars } from './patchBars.js'
import { TYPE_LIBRARY } from './types/index.js'
import rental from '../../scripts/rigbuild/rentals/moxir-2026-10-17.json'

const lamp = (id, type, extra = {}) => ({ id, type: 'spotLight', name: id, components: { transform: { position: [0, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, fixture: { type, ...extra } } })
const show = (list) => ({ id: RIG_SHOW_ID, type: 'group', components: { rentalList: list } })
const LIST = rental.rentalList

// The MDG ATMe hazer as the desk's describe() gives it (serverXR/src/lighting/library.js).
const ATME = {
    name: 'ATMe', manufacturerName: 'MDG', categories: ['Hazer'], lastModifyDate: '2026-01-23',
    physical: { power: 1400, weight: 16.8, dimensions: [180, 300, 685] },
    modes: [{ index: 0, name: '3-channel', shortName: '3ch', channels: 3, matrix: false, channelNames: ['Unit control', 'Haze output', 'Haze control'], roles: ['control', 'aux1', 'aux2'] }]
}

describe('the quote\'s day rule', () => {
    it('is the spreadsheet\'s own: its 2-day, 3-day and 1-week columns are rate × billedDays', () => {
        // "Price list" row 6, UP-B380F: E 20000 · F (2 days) 30000 · G (3 days) 40000 · H (1 week) 80000.
        expect(20000 * billedDays(1)).toBe(20000)
        expect(20000 * billedDays(2)).toBe(30000)
        expect(20000 * billedDays(3)).toBe(40000)
        expect(20000 * billedDays(7)).toBe(80000)
        // row 8, UP-HK1915 13500: 20250 · 27000 · 54000
        expect([2, 3, 7].map((d) => 13500 * billedDays(d))).toEqual([20250, 27000, 54000])
        expect(billedDays(0)).toBeNull()
        expect(billedDays(1.5)).toBeNull()
    })
    it('counts dates inclusively', () => {
        expect(daysBetween('2026-10-17', '2026-10-17')).toBe(1)
        expect(daysBetween('2026-10-16', '2026-10-18')).toBe(3)
        expect(daysBetween('2026-10-18', '2026-10-16')).toBeNull()
    })
})

describe('universes', () => {
    it('packs lamps in list order and never splits one across two universes', () => {
        expect(universesNeeded([{ count: 32, footprint: 16 }])).toBe(1)
        expect(universesNeeded([{ count: 33, footprint: 16 }])).toBe(2)
        // 21 × 24 = 504, the 22nd starts universe 2 (8 slots would be left)
        expect(universesNeeded([{ count: 22, footprint: 24 }])).toBe(2)
        expect(universesNeeded([{ count: 5, footprint: null }])).toBe(0)
    })
})

describe('the equipment model', () => {
    const entities = [
        show({ ...LIST, days: 2 }),
        ...Array.from({ length: 3 }, (_, i) => lamp(`b${i}`, 'up-b380f'))
    ]
    it('costs every line by the day rule and totals it', () => {
        const m = equipmentModel({ entities, library: TYPE_LIBRARY })
        const beam = m.lines.find((l) => l.code === 'UP-B380F')
        expect(beam).toMatchObject({ ordered: 18, stock: 18, rate: 20000, placed: 3, left: 15, footprint: 16, watts: 500, cost: 18 * 20000 * 1.5 })
        expect(m.totals.billed).toBe(1.5)
        expect(m.totals.cost).toBe(m.lines.reduce((s, l) => s + (l.cost || 0), 0))
        expect(m.totals.units).toBe(104)
        // one type's modes are owed: said, never assumed (UP-LA40WF's 32ch is the tested unit's)
        expect(m.totals.modesOwed).toEqual(['UP-Q108S ×6'])
        expect(m.owed).toContain('UP-Q108S: DMX mode')
        expect(m.owed).not.toContain('UP-PL5403 8ch: channel list') // the tested unit's list
        expect(m.owed).not.toContain('UP-B380F 16ch: channel list')
        expect(m.owed).toContain('UP-250BSW 24ch: channel list')
    })
    it('flags an order above the house\'s stock', () => {
        const list = withQuantity(LIST, 'up-hk1915', 20)
        const m = equipmentModel({ entities: [show(list)], library: TYPE_LIBRARY })
        expect(m.lines.find((l) => l.code === 'UP-HK1915').flags).toContain('over-stock')
        expect(m.owed).toContain('UP-HK1915: 20 ordered, the house lists 14')
    })
    it('counts and costs a non-DMX item, with no card, no slot and no patch', () => {
        const node = { code: 'Art-Net node', type: 'artnet-node', kind: 'item', ordered: 1, from: 'other', category: 'node', note: '4 universes', rate: 10000 }
        const list = withLine({ ...LIST, days: 1 }, node)
        const entities2 = [show(list)]
        const m = equipmentModel({ entities: entities2, library: TYPE_LIBRARY })
        const line = m.lines.find((l) => l.key === 'item:Art-Net node')
        expect(line).toMatchObject({ kind: 'item', from: 'other', ordered: 1, placed: null, cost: 10000, modeOwed: null })
        expect(m.totals.items).toBe(1)
        expect(m.totals.fixtures).toBe(104)
        const counts = rentalCounts({ entities: entities2, library: TYPE_LIBRARY, list })
        expect(counts.totals.ordered).toBe(104)
        expect(hotbarSlots({ entities: entities2, library: TYPE_LIBRARY }).slots.some((s) => s.code === 'Art-Net node')).toBe(false)
    })
})

describe('editing the list', () => {
    it('adds, merges, changes and deletes lines', () => {
        const a = withLine(LIST, { code: 'UP-B380F', type: 'up-b380f', ordered: 2 })
        expect(a.items.find((i) => i.type === 'up-b380f').ordered).toBe(20)
        const b = withQuantity(a, 'up-pl5403', 24)
        expect(b.items.find((i) => i.type === 'up-pl5403').ordered).toBe(24)
        const c = withoutLine(b, 'up-yz31p')
        expect(c.items.some((i) => i.type === 'up-yz31p')).toBe(false)
        expect(c.items).toHaveLength(7)
        const d = withLineFields(c, 'up-b380f', { from: 'own', note: 'ours' })
        expect(d.items.find((i) => i.type === 'up-b380f')).toMatchObject({ from: 'own', note: 'ours' })
        expect(withLineFields(d, 'up-b380f', { from: 'rental', note: '' }).items.find((i) => i.type === 'up-b380f').from).toBeUndefined()
    })
    it('writes the list as one op, creating the show entity when it is missing', () => {
        expect(listOps([show(LIST)], LIST)[0]).toMatchObject({ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rentalList' } })
        expect(listOps([], LIST)[0].type).toBe('createEntity')
    })
    it('sets the rental days from dates', () => {
        const l = withDays(LIST, { from: '2026-10-16', to: '2026-10-17' })
        expect(l.days).toBe(2)
        expect(l.rule.extraDay).toBe(0.5)
        expect(withDays(l, { days: 3 }).days).toBe(3)
    })
    it('adds a code from the rental house\'s price list with its cells', () => {
        const entry = LIST.catalogue.find((c) => c.code === 'UP-236')
        const line = catalogueLine(entry, { ordered: 2 })
        expect(line).toMatchObject({ code: 'UP-236', type: 'up-236', ordered: 2, stock: 2, rate: 14000 })
        expect(line.source).toMatch(/Price list!A24:E24/)
        expect(lineKey(catalogueLine(LIST.catalogue.find((c) => c.code === 'UP-PDU60B'), { kind: 'item' }))).toBe('item:UP-PDU60B')
    })
})

describe('a new type from the Open Fixture Library', () => {
    const type = oflType({ manufacturer: 'mdg', key: 'atme', described: ATME, fetchedAt: '2026-09-28T12:00:00Z', from: 'library' })
    it('keeps OFL\'s channels, physical data, provenance and licence', () => {
        expect(type).toMatchObject({ id: 'ofl-mdg-atme', code: 'MDG ATMe', category: 'hazer', defaultMode: '3ch', modesOwed: false, identified: 'OFL' })
        expect(type.modes[0]).toEqual({ name: '3ch', footprint: 3, channels: [{ role: 'control', label: 'Unit control' }, { role: 'aux1', label: 'Haze output' }, { role: 'aux2', label: 'Haze control' }] })
        expect(type.power_w).toEqual({ value: 1400, src: 'OFL', basis: 'OFL' })
        expect(type.sources.OFL).toMatchObject({ url: 'https://open-fixture-library.org/mdg/atme', licence: 'MIT (Open Fixture Library)', accessed: '2026-09-28' })
    })
    it('says a matrix mode is owed instead of guessing its footprint', () => {
        const t = oflType({ manufacturer: 'x', key: 'y', described: { name: 'Y', modes: [{ name: 'pixel', matrix: true, channelNames: null, roles: null }] } })
        expect(t.modesOwed).toBe(true)
        expect(t.note).toMatch(/pixel: matrix or no plain channel list — owed/)
    })
    it('joins the library of every view through the list, once', () => {
        const list = withLine(LIST, { code: type.code, type: type.id, ordered: 2, from: 'other' }, type)
        const lib = libraryWithShow(TYPE_LIBRARY, list)
        expect(lib.types.map((t) => t.id)).toContain('ofl-mdg-atme')
        expect(libraryWithShow(TYPE_LIBRARY, list)).toBe(lib)
        const entities = [show(list), lamp('h1', type.id)]
        // the hand offers it, the plot draws it with a mode and a footprint
        expect(hotbarSlots({ entities, library: TYPE_LIBRARY }).slots.find((s) => s.type === type.id)).toMatchObject({ ordered: 2, placed: 1, left: 1, effect: true })
        const row = plotModel({ entities, library: TYPE_LIBRARY }).sheet.rows.find((r) => r.id === 'h1')
        expect(row).toMatchObject({ mode: '3ch', footprint: 3 })
    })
})

describe('what an edit does to the lamps placed', () => {
    const entities = [show(LIST), ...Array.from({ length: 5 }, (_, i) => lamp(`p${i}`, 'up-pl5403', { position: 'column faces', unit: i + 1 }))]
    it('names the last placed above a lowered count', () => {
        const r = reduction({ entities, type: 'up-pl5403', to: 3 })
        expect(r).toMatchObject({ placed: 5, to: 3, over: 2, last: ['p3', 'p4'] })
        expect(r.lamps[0]).toMatchObject({ id: 'p0', position: 'column faces', unit: 1 })
    })
    it('flags lamps kept past the order, and a type the list no longer carries', () => {
        const lowered = [show(withQuantity(LIST, 'up-pl5403', 3)), ...entities.slice(1)]
        const flags = orderFlags(lowered)
        expect([...flags.entries()]).toEqual([['p3', 'over-order'], ['p4', 'over-order']])
        const gone = [show(withoutLine(LIST, 'up-pl5403')), ...entities.slice(1)]
        expect(orderFlags(gone).get('p0')).toBe('not-on-list')
        // no list at all: nothing is over anything
        expect(orderFlags(entities.slice(1)).size).toBe(0)
    })
    it('draws them as conflicts on the plot but never as a patch fault', () => {
        const lowered = [show(withQuantity(LIST, 'up-b380f', 1)), lamp('b1', 'up-b380f', { universe: 1, address: 1 }), lamp('b2', 'up-b380f', { universe: 1, address: 17 })]
        const model = plotModel({ entities: lowered, library: TYPE_LIBRARY })
        expect(model.lamps.find((l) => l.id === 'b2').conflicts).toEqual(['over-order'])
        expect(model.lamps.find((l) => l.id === 'b1').conflicts).toEqual([])
        const bars = patchBars({ model })
        expect(bars.conflicts).toEqual([])
        expect(bars.universes[0].segments.every((s) => !s.conflict)).toBe(true)
    })
})

describe('export', () => {
    it('writes RFC 4180 CSV with a header and one row per line', () => {
        const m = equipmentModel({ entities: [show({ ...LIST, days: 1 })], library: TYPE_LIBRARY })
        const csv = equipmentCsv(m)
        const rows = csv.trim().split('\r\n')
        expect(rows).toHaveLength(1 + 8)
        expect(rows[0]).toBe('code,item,kind,from,qty,stock,placed,mode,W each,rate/day,line total,source,note,flags')
        expect(rows[1]).toMatch(/^UP-B380F,380W beam moving head \(outdoor\),fixture,rental house,18,18,0,16ch \(16 ch\),500,20000,360000,"Price list!A6:E6 · ordered as ""18x UP-B380F"""/)
    })
})
