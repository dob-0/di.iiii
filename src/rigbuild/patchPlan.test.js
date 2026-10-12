import { describe, expect, it } from 'vitest'
import library from './types/moxir.json'
import minimalPlan from '../../scripts/place/rigs/moxir-2026-10-17-minimal.patch.json'
import { addressSetting, artnetOf, expectedRoom, footprintOfName, naturalCompare, planPatch, resolveMode, selectorTest } from './patchPlan.js'
import { typeById } from './fixtureTypes.js'
import { mergePatch, normalizeFixture } from '../shared/projectSchema.js'

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

describe('what a plan may ask of its lamps: ids, counts, lamps kept off DMX (MOXIR v2 patch, owner N460.2)', () => {
    const lamps = (type, ids, x = (i) => i, extra = {}) => ids.map((id, i) => lamp(id, type, x(i), 0, extra))

    it('walks a block in unit-id order when asked, whatever the positions: the addresses stay with the unit if its place changes', () => {
        const plan = { modes: { 'up-b380f': { crew: '16ch' } }, universes: [{ universe: 1, blocks: [{ select: { type: 'up-b380f' }, start: 1, fixture: 101, order: 'id-asc' }] }] }
        // unit 10 stands left of unit 2 and unit 1: an x walk would put it first; ids are compared as numbers (2 before 10)
        const entities = [lamp('rig-laser-10', 'up-b380f', -5), lamp('rig-laser-2', 'up-b380f', 4), lamp('rig-laser-1', 'up-b380f', 9)]
        const r = planPatch({ entities, library, plan })
        expect(r.errors).toEqual([])
        expect(r.assignments.map((a) => `${a.index} ${a.entityId} U1.${a.address}`)).toEqual(['101 rig-laser-1 U1.1', '102 rig-laser-2 U1.17', '103 rig-laser-10 U1.33'])
        plan.universes[0].blocks[0].order = 'id-desc'
        expect(planPatch({ entities, library, plan }).assignments.map((a) => a.entityId)).toEqual(['rig-laser-10', 'rig-laser-2', 'rig-laser-1'])
    })

    it('leaves a lamp the document keeps off DMX alone: it takes no address and its absence from every block is no error', () => {
        const plan = { modes: { 'up-b380f': { crew: '16ch' } }, universes: [{ universe: 1, blocks: [{ select: { type: 'up-b380f' }, start: 1, fixture: 101 }] }] }
        const cube = lamp('rig-laser-1a', 'ext-lc-ultra-mk2', 0, 0, { dmx: false })
        const r = planPatch({ entities: [lamp('b-1', 'up-b380f', 0), cube], library, plan })
        expect(r.errors).toEqual([])
        expect(r.assignments.map((a) => a.entityId)).toEqual(['b-1'])
        expect(r.offDmx).toEqual(['rig-laser-1a'])
        expect(r.ops.map((o) => o.payload.entityId)).toEqual(['b-1'])
        // the same cube WITHOUT the flag is still a lamp no block claims: said, not skipped
        const loose = planPatch({ entities: [lamp('b-1', 'up-b380f', 0), lamp('rig-laser-1a', 'ext-lc-ultra-mk2', 0)], library, plan })
        expect(loose.errors.join('\n')).toMatch(/rig-laser-1a .* in no block/)
    })

    it('puts a lamp on DMX when a block names it, clears its off-DMX flag in the same op, says so, and a re-run writes nothing', () => {
        const plan = { modes: { 'up-yz31p': { crew: '1ch' } }, universes: [{ universe: 1, blocks: [{ select: { type: 'up-yz31p' }, start: 501, fixture: 141 }] }] }
        const entities = [lamp('rig-smoke-planes', 'up-yz31p', 0, 0, { dmx: false })]
        const r = planPatch({ entities, library, plan })
        expect(r.errors).toEqual([])
        expect(r.warnings.join('\n')).toMatch(/rig-smoke-planes .*off DMX in the document.*U1\.501/)
        expect(r.ops).toHaveLength(1)
        expect(r.ops[0].payload.patch).toMatchObject({ index: 141, universe: 1, address: 501, dmx: null })
        // applied the way the document applies an updateComponent: merge patch, then the schema's own normalisation
        const after = normalizeFixture(mergePatch(entities[0].components.fixture, r.ops[0].payload.patch))
        expect(after).toMatchObject({ type: 'up-yz31p', index: 141, universe: 1, address: 501, mode: '1ch-assumed' })
        expect(after.dmx).toBeUndefined()
        entities[0].components.fixture = after
        expect(planPatch({ entities, library, plan }).ops).toEqual([])
        expect(planPatch({ entities, library, plan }).offDmx).toEqual([])
    })

    it('holds a block to the number of lamps it expects, so a missing or extra unit is said before anything is written', () => {
        const plan = { modes: { 'up-b380f': { crew: '16ch' } }, universes: [{ universe: 1, blocks: [{ select: { type: 'up-b380f' }, start: 1, fixture: 101, units: 3 }] }] }
        expect(planPatch({ entities: lamps('up-b380f', ['a', 'b', 'c']), library, plan }).errors).toEqual([])
        const short = planPatch({ entities: lamps('up-b380f', ['a', 'b']), library, plan })
        expect(short.errors.join('\n')).toMatch(/expects 3 lamps, the document has 2/)
        const extra = planPatch({ entities: lamps('up-b380f', ['a', 'b', 'c', 'd']), library, plan })
        expect(extra.errors.join('\n')).toMatch(/expects 3 lamps, the document has 4/)
    })
})

describe('the room a plan expects (stand-in lamps, for a crew table or a check when no project is at hand)', () => {
    const plan = () => ({
        modes: { 'up-b380f': { crew: '16ch' }, 'up-pl5403': { crew: '8ch' } },
        universes: [
            { universe: 1, blocks: [{ select: { type: 'up-b380f' }, start: 1, fixture: 101, order: 'id-asc', units: 3 }] },
            { universe: 2, blocks: [
                { select: { group: 'rig-par-cut', type: 'up-pl5403' }, start: 1, fixture: 201, order: 'id-asc', units: 2 },
                { select: { group: 'rig-par-planes', type: 'up-pl5403' }, start: 101, fixture: 221, order: 'id-asc', units: 4 }
            ] }
        ],
        offDmx: [{ type: 'ext-lc-ultra-mk2', units: 6 }]
    })
    it('makes one lamp per expected unit, named so the block that expects it selects it, plus the lamps kept off DMX', () => {
        const room = expectedRoom(plan())
        expect(room.filter((e) => e.components.fixture.dmx !== false).map((e) => e.id)).toEqual([
            'up-b380f-01', 'up-b380f-02', 'up-b380f-03', 'rig-par-cut-01', 'rig-par-cut-02', 'rig-par-planes-01', 'rig-par-planes-02', 'rig-par-planes-03', 'rig-par-planes-04'
        ])
        expect(room.filter((e) => e.components.fixture.dmx === false)).toHaveLength(6)
        const r = planPatch({ entities: room, library, plan: plan() })
        expect(r.errors).toEqual([])
        expect(r.offDmx).toHaveLength(6)
        expect(r.assignments.map((a) => `U${a.universe}.${a.address} #${a.index}`).slice(0, 4)).toEqual(['U1.1 #101', 'U1.17 #102', 'U1.33 #103', 'U2.1 #201'])
    })
    it('cannot make lamps for a block it cannot describe, and says so', () => {
        const noUnits = plan()
        delete noUnits.universes[0].blocks[0].units
        expect(() => expectedRoom(noUnits)).toThrow(/states no units/)
        const byHeight = plan()
        byHeight.universes[0].blocks[0].select.y = '>3'
        expect(() => expectedRoom(byHeight)).toThrow(/geometry/)
    })
    it('counts ids the way a person does', () => {
        expect(['rig-par-10', 'rig-par-2', 'rig-par-1'].sort(naturalCompare)).toEqual(['rig-par-1', 'rig-par-2', 'rig-par-10'])
        expect(['b-02', 'b-1', 'a-9'].sort(naturalCompare)).toEqual(['a-9', 'b-1', 'b-02'])
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
