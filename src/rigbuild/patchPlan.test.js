import { describe, expect, it } from 'vitest'
import library from './types/moxir.json'
import minimalPlan from '../../scripts/place/rigs/moxir-2026-10-17-minimal.patch.json'
import { addressSetting, artnetOf, footprintOfName, planPatch, resolveMode, selectorTest } from './patchPlan.js'
import { typeById } from './fixtureTypes.js'

const lamp = (id, type, x, z = 0, extra = {}) => ({ id, type: 'spotLight', name: id, components: { transform: { position: [x, 6, z], rotation: [0, 0, 0] }, fixture: { type, ...extra } } })

const basePlan = () => ({
    sides: { L: { x: '<0' }, R: { x: '>0' } },
    modes: { 'up-b380f': { crew: '16ch' }, 'up-pl5403': { crew: '4ch', pitch: 8 }, 'ext-hazer': { crew: '2ch' } },
    minSpare: 256,
    universes: [
        { universe: 1, port: 'A', blocks: [
            { group: 'rig-beam', start: 1, fixture: 101, order: 'x-asc', position: 'truss top' },
            { group: 'rig-par', start: 101, fixture: 111, order: 'x-asc', position: 'truss top' }
        ] },
        { universe: 2, port: 'B', blocks: [
            { group: 'rig-col', side: 'L', start: 1, fixture: 201, order: 'z-asc', position: 'column L' },
            { group: 'rig-col', side: 'R', start: 101, fixture: 211, order: 'z-asc', position: 'column R' }
        ] }
    ]
})

const room = () => [
    lamp('rig-beam-02', 'up-b380f', 1), lamp('rig-beam-01', 'up-b380f', -1),
    lamp('rig-par-01', 'up-pl5403', -2), lamp('rig-par-02', 'up-pl5403', 2),
    lamp('rig-col-01', 'up-b380f', -10, 12), lamp('rig-col-02', 'up-b380f', 10, 12), lamp('rig-col-03', 'up-b380f', -10, 6),
    { id: 'box', type: 'box', components: {} }
]

describe('the patch plan', () => {
    it('lays each block from its round start, in walking order, with its fixture numbers', () => {
        const r = planPatch({ entities: room(), library, plan: basePlan() })
        expect(r.errors).toEqual([])
        const at = Object.fromEntries(r.assignments.map((a) => [a.entityId, `${a.index} U${a.universe}.${a.address} ${a.mode}/${a.crewMode} u${a.unit}`]))
        expect(at).toEqual({
            'rig-beam-01': '101 U1.1 16ch/16ch u1',
            'rig-beam-02': '102 U1.17 16ch/16ch u2',
            'rig-par-01': '111 U1.101 4ch-assumed/4ch u1',
            'rig-par-02': '112 U1.109 4ch-assumed/4ch u2', // spaced 8 apart: room for the 8ch mode
            'rig-col-03': '201 U2.1 16ch/16ch u1', // z 6 before z 12
            'rig-col-01': '202 U2.17 16ch/16ch u2',
            'rig-col-02': '211 U2.101 16ch/16ch u1'
        })
        expect(r.universes.map((u) => [u.universe, u.used, u.free])).toEqual([[1, 40, 472], [2, 48, 464]])
    })

    it('writes only the fields that change, as updateComponent ops', () => {
        const entities = room()
        const first = planPatch({ entities, library, plan: basePlan() })
        expect(first.ops).toHaveLength(7)
        const byId = new Map(entities.map((e) => [e.id, e]))
        for (const op of first.ops) Object.assign(byId.get(op.payload.entityId).components.fixture, op.payload.patch)
        expect(planPatch({ entities, library, plan: basePlan() }).ops).toEqual([])
    })

    it('reads a missing `hung` as standing (the schema keeps only true), so a re-run writes nothing', () => {
        const entities = room()
        const first = planPatch({ entities, library, plan: basePlan() })
        const byId = new Map(entities.map((e) => [e.id, e]))
        for (const op of first.ops) {
            const { hung, ...rest } = op.payload.patch
            Object.assign(byId.get(op.payload.entityId).components.fixture, rest, hung ? { hung } : {})
        }
        expect(planPatch({ entities, library, plan: basePlan() }).ops).toEqual([])
    })

    it('refuses what does not fit, never moves a lamp somewhere free', () => {
        const plan = basePlan()
        plan.universes[0].blocks[1].start = 20 // inside the beams' block
        const r = planPatch({ entities: room(), library, plan })
        expect(r.errors.join('\n')).toMatch(/overlaps/)
        const plan2 = basePlan()
        plan2.universes[0].blocks[0].start = 490 // 2 × 16 from 490 runs past 512
        expect(planPatch({ entities: room(), library, plan: plan2 }).errors.join('\n')).toMatch(/past 512/)
    })

    it('says which lamps no block claims, and a fixture number given twice', () => {
        const plan = basePlan()
        plan.universes[1].blocks.pop()
        plan.universes[0].blocks[1].fixture = 102
        const r = planPatch({ entities: room(), library, plan })
        expect(r.errors).toEqual(expect.arrayContaining([
            expect.stringMatching(/rig-col-02 .* in no block/),
            expect.stringMatching(/fixture 102 is given twice/)
        ]))
    })

    it('warns when a universe keeps less spare than the plan asks', () => {
        const plan = basePlan()
        plan.minSpare = 480
        expect(planPatch({ entities: room(), library, plan }).warnings.join('\n')).toMatch(/U1: only 472 channels spare/)
    })
})

describe('selecting from the document, so a re-hang re-runs', () => {
    const air = (id, type, x, y, position) => ({ id, type: 'spotLight', name: id, components: { transform: { position: [x, y, 5], rotation: [0, 0, 0] }, fixture: { type, position } } })
    it('takes lamps by type and height, whatever the truss is called, and keeps the document\'s position', () => {
        // the owner's D2 hang: an X over the DJ, a pendulum on the left, a broken line on the right
        const entities = [
            air('rig-x-01', 'up-b380f', -1, 6.5, 'X'), air('rig-x-02', 'up-b380f', 1, 6.5, 'X'),
            air('rig-pendulum-01', 'up-b380f', -6, 3.9, 'pendulum'), air('rig-broken-01', 'up-b380f', 6, 6.4, 'broken line'),
            air('rig-col-01', 'up-b380f', -11, 0.7, 'column bases')
        ]
        const plan = { modes: { 'up-b380f': { crew: '16ch' } }, sides: { L: { x: '<0' } }, universes: [
            { universe: 1, blocks: [{ select: { type: 'up-b380f', y: '>3' }, start: 1, fixture: 101, order: 'x-asc' }] },
            { universe: 2, blocks: [{ select: { type: 'up-b380f', y: '<3', xAbs: '>8' }, side: 'L', start: 1, fixture: 201, order: 'z-asc', position: 'column bases HL' }] }
        ] }
        const r = planPatch({ entities, library, plan })
        expect(r.errors).toEqual([])
        expect(r.assignments.map((a) => `${a.index} ${a.entityId} ${a.position}`)).toEqual([
            '101 rig-pendulum-01 pendulum', '102 rig-x-01 X', '103 rig-x-02 X', '104 rig-broken-01 broken line', '201 rig-col-01 column bases HL'
        ])
        expect(r.ops.find((o) => o.payload.entityId === 'rig-x-01').payload.patch.position).toBeUndefined()
    })
    it('refuses an unknown criterion or a comparison it cannot read', () => {
        expect(() => selectorTest({ colour: 'red' })).toThrow(/unknown criterion/)
        expect(() => selectorTest({ y: 'high' })).toThrow(/cannot read/)
    })
})

describe('modes', () => {
    it('runs the maker\'s list when known, else the assumed list of the same footprint', () => {
        expect(footprintOfName('8ch-assumed')).toBe(8)
        expect(resolveMode(typeById(library, 'up-b380f'), '16ch')).toMatchObject({ desk: '16ch', footprint: 16, assumed: false }) // the tested unit's list
        expect(resolveMode(typeById(library, 'up-hk1915'), '21ch')).toMatchObject({ desk: '21ch-assumed', footprint: 21, assumed: true })
        expect(resolveMode(typeById(library, 'up-pl5403'), '4ch')).toMatchObject({ desk: '4ch-assumed', footprint: 4 })
        expect(resolveMode(typeById(library, 'up-yh600f'), '2ch')).toMatchObject({ desk: '2ch', assumed: false })
        expect(resolveMode(typeById(library, 'up-250bsw'), '30ch')).toBe(null) // no list of that width at all
    })
})

describe('the wire and the unit', () => {
    it('numbers Art-Net from 0 (U1 = 0.0.0) as the node and a console count it', () => {
        expect(artnetOf(1).text).toBe('0.0.0')
        expect(artnetOf(4)).toMatchObject({ portAddress: 3, text: '0.0.3' })
        expect(artnetOf(17).text).toBe('0.1.0')
    })
    it('prints the display or DIP setting only where the manual gives the method', () => {
        expect(addressSetting(null, 17)).toBe(null)
        expect(addressSetting({ method: 'display', prefix: 'A' }, 17)).toBe('A017')
        expect(addressSetting({ method: 'dip', switches: 9 }, 101)).toBe('DIP ON 1,3,6,7')
    })
})

describe('the MOXIR Minimal plan', () => {
    const plan = minimalPlan
    it('keeps every block inside 512, on round starts, and half of every universe spare', () => {
        for (const u of plan.universes) for (const b of u.blocks) expect([1, 101, 201, 301, 401]).toContain(b.start)
        expect(plan.minSpare).toBeGreaterThanOrEqual(256)
        expect(new Set(plan.universes.map((u) => u.port)).size).toBe(plan.universes.length)
        // no block names a truss: the plan survives a re-hang of the crane rig
        for (const u of plan.universes) for (const b of u.blocks) expect(b.group).toBeUndefined()
    })
})
