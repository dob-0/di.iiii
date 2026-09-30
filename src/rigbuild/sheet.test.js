import { describe, expect, it } from 'vitest'
import library from './types/moxir.json'
import { assignCircuits, circuitLimitW, groupFlags, patchCsv, plotData, powerCsv, renderSheetBody, renderSheetHtml, sheetModel, toCsv } from './sheet.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'

const lamp = (id, fixture, extra = {}) => ({ id, type: 'spotLight', name: id, components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, fixture, ...extra } })

describe('the sheet model', () => {
    const entities = [
        lamp('a', { index: 1, type: 'up-b380f', mode: '16ch', universe: 1, address: 1, position: 'truss', unit: 1, circuit: 'C1' }),
        lamp('b', { index: 2, type: 'up-b380f', mode: '16ch', universe: 1, address: 10, position: 'truss', unit: 2, circuit: 'C1' }),
        lamp('c', { index: 3, type: 'up-250bsw', universe: 2, address: 500, position: 'floor', unit: 1 }),
        lamp('d', { type: 'up-q108s', position: 'floor', unit: 2, circuit: 'C2' }),
        lamp('e', { index: 3, type: 'up-yh600f', mode: '2ch', position: 'floor', unit: 3, circuit: 'C2' }),
        { id: 'box', type: 'box', components: {} }
    ]
    const model = sheetModel({ entities, library })
    const row = (id) => model.rows.find((r) => r.id === id)

    it('has one row per lamp, and the default mode where none was chosen', () => {
        expect(model.rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
        expect(row('c').mode).toBe('24ch')
        expect(row('c').last).toBe(523)
    })

    it('flags, in words, what a crew must know — and invents nothing', () => {
        expect(row('a').flags).toEqual(['channels-owed', 'overlap'])
        expect(row('a').notes[0]).toMatch(/overlaps #2 UP-B380F at U1\.010/)
        expect(row('c').flags).toEqual(expect.arrayContaining(['off-the-end', 'no-circuit']))
        expect(row('d').flags).toEqual(['mode-unknown'])
        expect(row('d').universe).toBe(null)
        expect(row('e').flags).toEqual(['not-patched', 'index-duplicate'])
        expect(row('c').flags).toContain('index-duplicate')
    })

    it('says when a lamp\'s watts are ASSUMED (no datasheet figure)', () => {
        // Since 2026-09-29 no MOXIR type has an assumed wattage (UP-PL5403's 162 W is the maker's);
        // the flag is still owed wherever a type's power basis says ASSUMED.
        const lib = { types: library.types.map((t) => (t.id === 'up-b380f' ? { ...t, power_w: { value: 500, basis: 'ASSUMED' } } : t)) }
        const m = sheetModel({ entities: [lamp('x', { type: 'up-b380f', mode: '16ch', circuit: 'C1' })], library: lib })
        expect(m.rows[0].flags).toContain('power-assumed')
    })

    it('sums a universe as merged ranges', () => {
        expect(model.universes[0]).toMatchObject({ universe: 1, lamps: 2, channels: 25, free: 487, ranges: [[1, 25]] })
    })

    it('adds up power per circuit against the stated limit', () => {
        expect(circuitLimitW()).toBe(2944)
        const c1 = model.power.circuits.find((c) => c.circuit === 'C1')
        expect(c1).toMatchObject({ lamps: 2, watts: 1000, pct: 34, over: false })
        expect(model.power.unassigned).toEqual({ lamps: 1, watts: 280 })
        expect(model.power.totalW).toBe(500 + 500 + 280 + 20 + 500)
    })

    it('orders the hookup by universe and address, unpatched last', () => {
        expect(model.hookup.map((r) => r.id)).toEqual(['a', 'b', 'c', 'e', 'd'])
    })

    it('compares with the desk when one is here', () => {
        const withDesk = sheetModel({ entities, library, projectId: 'p', desk: [{ key: 'p:a', universe: 1, address: 1 }, { key: 'p:b', universe: 1, address: 17 }] })
        expect(withDesk.rows.find((r) => r.id === 'b').flags).toContain('desk-differs')
        expect(withDesk.rows.find((r) => r.id === 'c').flags).toContain('not-on-desk')
        expect(withDesk.rows.find((r) => r.id === 'a').flags).not.toContain('desk-differs')
    })
})

describe('circuits', () => {
    it('fill position by position, never mixing positions, never over the limit', () => {
        const entities = [
            ...Array.from({ length: 7 }, (_, i) => lamp(`b${i}`, { type: 'up-b380f', position: 'truss', unit: i + 1 })),
            lamp('s1', { type: 'up-yz31p', position: 'floor', unit: 1 }),
            lamp('s2', { type: 'up-yz31p', position: 'floor', unit: 2, circuit: 'X9' })
        ]
        const ops = assignCircuits({ entities, library })
        const got = Object.fromEntries(ops.map((o) => [o.payload.entityId, o.payload.patch.circuit]))
        expect(got).toEqual({ s1: 'C1', b0: 'C2', b1: 'C2', b2: 'C2', b3: 'C2', b4: 'C2', b5: 'C3', b6: 'C3' })
        const doc = applyProjectOps(normalizeProjectDocument({ entities }), ops)
        const model = sheetModel({ entities: doc.entities, library })
        expect(model.power.circuits.every((c) => !c.over)).toBe(true)
    })
})

describe('CSV and HTML', () => {
    it('writes RFC 4180 CSV: quotes doubled, CRLF', () => {
        expect(toCsv([{ a: 'x,"y"', b: 2 }], [{ label: 'A', value: (r) => r.a }, { label: 'B', value: (r) => r.b }])).toBe('A,B\r\n"x,""y""",2\r\n')
        const model = sheetModel({ entities: [lamp('a', { index: 1, type: 'up-b380f', universe: 1, address: 1, circuit: 'C1' })], library })
        expect(patchCsv(model).split('\r\n')[1]).toBe('1,UP-B380F,"UPlight Stage Equipment (Guangzhou) Co., Ltd.",16ch,,,1,1,16,C1,500,EXACT,channel list owed,a')
        expect(powerCsv(model).split('\r\n')[1]).toBe('C1,1,500,2944,17,,0')
    })

    it('escapes everything it prints', () => {
        const model = sheetModel({ entities: [lamp('a', { type: 'up-b380f', position: '<img src=x onerror=alert(1)>' })], library })
        const html = renderSheetBody(model, { title: '<script>x</script>' })
        expect(html).not.toMatch(/<img|<script>/)
        expect(html).toMatch(/&lt;img/)
        expect(renderSheetHtml(model)).toMatch(/^<!doctype html>/)
        expect(renderSheetHtml(model)).toMatch(/@page \{ size: A4 portrait/)
        // #603: the desk sends Universe 1 as sACN 1, not the reserved 0 — the sheet says so.
        expect(renderSheetHtml(model)).toMatch(/sACN \(E1\.31\) universe 1/)
        expect(renderSheetHtml(model)).not.toMatch(/E1\.31 reserves/)
    })
})

describe('plot data', () => {
    it('gives each lamp its mount (from the lens) and each piece its size', () => {
        const entities = [
            // A spot's rest aim is straight down (SPOT_LOCAL_FORWARD): a hung head at home.
            lamp('a', { type: 'up-b380f', hung: true }, { transform: { position: [0, 5.302, 0], rotation: [0, 0, 0] } }),
            { id: 't', type: 'group', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, piece: { kind: 'truss-2m' } } }
        ]
        const plot = plotData({ entities, library })
        expect(plot.pieces).toEqual([{ id: 't', kind: 'truss-2m', category: 'truss', size: [2, 0.29, 0.29], position: [0, 6, 0], yaw: 0 }])
        expect(plot.lamps[0].hung).toBe(true)
        plot.lamps[0].mount.forEach((v, i) => expect(v).toBeCloseTo([0, 6, 0][i], 3))
    })
})

describe('the sheet says what each warning is, by cause', () => {
    const at = (id, extra) => lamp(id, { type: 'up-b380f', mode: '16ch', position: 'booth', ...extra })
    const model = sheetModel({ entities: [at('a', { index: 1, universe: 1, address: 1 }), at('b', { index: 2, universe: 1, address: 10 }), at('c', { index: 3 })], library })

    it('groups the flags: to decide, not addressed, owed — each with one line of what to do', () => {
        const groups = groupFlags(model.flagCounts)
        const of = (id) => groups.find((g) => g.id === id)
        expect(of('decide').items.map((i) => [i.code, i.n])).toEqual([['overlap', 2]])
        expect(of('decide').items[0].todo).toMatch(/next free address.*separate desk/)
        expect(of('unaddressed').items[0]).toMatchObject({ code: 'not-patched', n: 1 })
        expect(of('owed').items[0].code).toBe('channels-owed')
        expect(groups.map((g) => g.id).indexOf('decide')).toBeLessThan(groups.map((g) => g.id).indexOf('owed'))
    })
    it('prints the groups on the sheet', () => {
        const html = renderSheetBody(model, {})
        expect(html).toMatch(/id="flags-decide">To decide/)
        expect(html).toMatch(/overlap<\/span> — 2 fixtures\. two fixtures claim the same channels/)
        expect(html).toMatch(/id="flags-unaddressed">Not addressed yet/)
    })
    it('never lets a desk code through as a bare code', () => {
        const [g] = groupFlags({ 'no-room': 1, 'made-up': 2 })
        expect(g.items[0].word).toBe('no universe had room')
        expect(groupFlags({ 'made-up': 2 }).at(-1)).toMatchObject({ id: 'other', n: 2 })
    })
    it('labels an assumed channel list as assumed in the patch table and the type table', () => {
        const assumed = library.types.flatMap((t) => (t.modes || []).filter((m) => m.assumed || m.basis === 'ASSUMED').map((m) => ({ type: t.id, mode: m.name })))[0]
        expect(assumed).toBeTruthy()
        const m = sheetModel({ entities: [lamp('x', { type: assumed.type, mode: assumed.mode, index: 1, universe: 1, address: 1, position: 'p' })], library })
        expect(m.rows[0].modeAssumed).toBe(true)
        const html = renderSheetBody(m, {})
        const shown = assumed.mode.toLowerCase().includes('assumed') ? assumed.mode : `${assumed.mode} (assumed)`
        expect(html.split(shown).length - 1).toBeGreaterThanOrEqual(2)
    })
})

describe('sheetModel reads the desk (owner install 2026-09-30: "36 (0 patched)" vs "29 of 36 addressed")', () => {
    const project = 'p1'
    const entities = Array.from({ length: 36 }, (_, i) => lamp(`l${i}`, { index: i + 1, type: 'up-b380f', mode: '16ch', circuit: 'C1', position: 'truss', unit: i + 1 }))
    const desk = entities.slice(0, 29).map((e, i) => ({ key: `${project}:${e.id}`, universe: 1 + Math.floor(i / 16), address: 1 + (i % 16) * 16 }))
    it('takes counts, universes and unpatched flags from the desk', () => {
        const m = sheetModel({ entities, library, desk, projectId: project })
        expect(m.source).toBe('desk')
        expect(m.totals).toMatchObject({ lamps: 36, patched: 29, universes: 2 })
        expect(m.rows.filter((r) => r.flags.includes('not-patched'))).toHaveLength(7)
        expect(m.rows.find((r) => r.id === 'l16')).toMatchObject({ universe: 2, address: 1 })
    })
    it('without a desk it is the document alone and says so', () => {
        const m = sheetModel({ entities, library, desk: null, projectId: project })
        expect(m.source).toBe('none')
        expect(m.totals).toMatchObject({ lamps: 36, patched: 0, universes: 0 })
    })
    it('a desk holding none of this project keeps the document addresses', () => {
        const withAddr = entities.map((e, i) => (i < 2 ? lamp(e.id, { ...e.components.fixture, universe: 1, address: 1 + i * 16 }) : e))
        const m = sheetModel({ entities: withAddr, library, desk: [], projectId: project })
        expect(m.source).toBe('document')
        expect(m.totals.patched).toBe(2)
    })
    it('flags a lamp the document addressed but the desk does not hold', () => {
        const withAddr = entities.map((e, i) => (i === 35 ? lamp(e.id, { ...e.components.fixture, universe: 3, address: 1 }) : e))
        const m = sheetModel({ entities: withAddr, library, desk, projectId: project })
        expect(m.rows.find((r) => r.id === 'l35').flags).toContain('not-on-desk')
        expect(m.totals.patched).toBe(29)
    })
})

describe('sheetModel uses the desk\'s kept refusals and overlaps (served by GET /light/api/rig)', () => {
    const project = 'p1'
    const entities = Array.from({ length: 6 }, (_, i) => lamp(`l${i}`, { index: i + 1, type: 'up-b380f', mode: '16ch', circuit: 'C1', position: 'truss', unit: i + 1 }))
    const desk = entities.slice(0, 4).map((e, i) => ({ key: `${project}:${e.id}`, universe: 1, address: 1 + i * 16 }))
    const deskFlags = [{ key: `${project}:l4`, code: 'no-room', message: 'no universe has room' }, { key: `${project}:l5`, code: 'profile-clash' }, { key: 'other:l4', code: 'group-split' }]
    it('puts each refusal on its lamp, in the To decide group, and leaves other projects alone', () => {
        const m = sheetModel({ entities, library, desk, projectId: project, deskFlags })
        expect(m.rows.find((r) => r.id === 'l4').flags).toEqual(expect.arrayContaining(['no-room', 'not-patched']))
        expect(m.flagCounts['no-room']).toBe(1)
        expect(m.flagCounts['profile-clash']).toBe(1)
        expect(m.flagCounts['group-split']).toBeUndefined()
        const decide = groupFlags(m.flagCounts).find((g) => g.id === 'decide')
        expect(decide.items.map((i) => i.code)).toEqual(expect.arrayContaining(['no-room', 'profile-clash']))
    })
    it('an older desk (no flags, no conflictsWith) behaves as before', () => {
        const m = sheetModel({ entities, library, desk, projectId: project })
        expect(m.flagCounts['no-room']).toBeUndefined()
        expect(m.conflictsWith).toEqual([])
    })
    it('says who it overlaps, by name, and prints it on the sheet', () => {
        const conflictsWith = [{ universe: 1, from: 1, to: 64, fixtures: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `Studio ${i + 1}` })) }]
        const m = sheetModel({ entities, library, desk, projectId: project, conflictsWith })
        expect(m.conflictsWith).toHaveLength(1)
        const html = renderSheetBody(m, {})
        expect(html).toContain('overlaps 12 other fixtures on U1 1-64')
        expect(html).toContain('Studio 1, Studio 2')
    })
})
