// group-identify.mjs (2026-10-17): light one group of lamps, each in its own colour, for a photo audit of the rig.
// The pure helpers (selector, place order, colours, laser rule, the channels) on the real type library, and the command
// itself against a stand-in desk that behaves as serverXR/src/lighting/desk.js does for POST /api/raw (value < 0 releases,
// the answer carries the whole raw map). Nothing here touches a live desk.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { loadLibrary } from './library.mjs'
import { typeById } from '../../src/rigbuild/fixtureTypes.js'
import { deskProfileName } from '../../src/rigbuild/dmxPose.js'
import { decodeDmx, encodeDmx } from '../../src/rigbuild/dmxDecode.js'
import {
    COLOURS, MIN_APART, addressLabel, alikeClusters, colourOf, darkCells, deltaE, describeSelector, formatPlan, heldList, holdPlan,
    inGroup, isNeverLit, lampsOnDesk, orderByPlace, overlapsOf, planGroup, readHeld, readOnly, releaseOf, run, selectLamps, selectorOf, valuesOf, verifyRaw
} from './group-identify.mjs'

const library = loadLibrary()
const typeOf = (id) => typeById(library, id)

// ---- a desk with lamps on it ---------------------------------------------------------------------------------------

/** specs: { id, name, type, mode, u (1-based), a, pos } → the document's entities, the desk's rig and state. */
const deskOf = (specs, others = [], project = 'demo') => {
    const entities = []
    const rig = []
    const fixtures = []
    const profiles = {}
    specs.forEach((s, i) => {
        const type = typeOf(s.type)
        const mode = type.modes.find((m) => m.name === s.mode)
        const profile = deskProfileName(type.code, mode.name)
        profiles[profile] = { channels: mode.channels.map((c) => c.role) }
        entities.push({ id: s.id, name: s.name, components: { transform: { position: s.pos }, fixture: { type: s.type, mode: s.mode } } })
        rig.push({ key: `${project}:${s.id}`, id: `fx${i}`, profile, universe: s.u, address: s.a })
        fixtures.push({ id: `fx${i}`, name: s.name, universe: s.u - 1, address: s.a, profile })
    })
    for (const o of others) {   // fixtures of another project: only the desk knows them
        profiles[o.profile] = { channels: o.roles }
        fixtures.push({ id: o.id, name: o.name || o.id, universe: o.u - 1, address: o.a, profile: o.profile })
    }
    return { entities, rig, fixtures, profiles }
}

const PAR = (id, a, pos, over = {}) => ({ id, name: `UP-PL5403 ${id}`, type: 'up-pl5403', mode: '8ch', u: 1, a, pos, ...over })
const OTHERS = [
    { id: 'o-dim', u: 1, a: 200, profile: 'dimmer', roles: ['dimmer'] },
    { id: 'o-rgb', u: 1, a: 210, profile: 'rgb', roles: ['r', 'g', 'b'] },
    { id: 'o-smoke', u: 1, a: 220, profile: 'fogonly', roles: ['aux1'], name: 'a fog machine' },
    { id: 'o-u2', u: 2, a: 20, profile: 'dimmer', roles: ['dimmer'] }
]
// four PARs in a row along z (listed out of order), a wheel beam, a 40 W laser, and fixtures of other projects.
// deskOf names the desk fixtures fx0, fx1, … in this order: fx4 is the beam, fx5 the laser.
const RIG_A = [
    PAR('par-a', 17, [0, 3, 30]), PAR('par-b', 25, [0, 3, 10]), PAR('par-c', 33, [0, 3, 20]), PAR('par-d', 41, [0, 3, 0]),
    { id: 'beam-1', name: 'UP-B380F beam-1', type: 'up-b380f', mode: '16ch', u: 1, a: 57, pos: [0, 0.7, 15] },
    { id: 'laser-1', name: 'UP-LA40WF laser-1', type: 'up-la40wf', mode: '32ch', u: 1, a: 100, pos: [0, 6, 5] },
    PAR('par-u2', 1, [4, 3, 0], { u: 2 })
]
const sceneA = () => {
    const d = deskOf(RIG_A, OTHERS)
    const lamps = lampsOnDesk({ ...d, library })
    return { ...d, lamps, plan: (selector, extra = {}) => planGroup({ lamps, selector, fixtures: d.fixtures, profiles: d.profiles, ...extra }) }
}
const sel = (over) => selectorOf({ ...over })

// ---- the colours ---------------------------------------------------------------------------------------------------

describe('colours: a fixed list, well separated, repeated with a mark', () => {
    it('the ten colours come in the briefed order', () => {
        expect(COLOURS.map((c) => c.name)).toEqual(['red', 'green', 'blue', 'yellow', 'magenta', 'cyan', 'white', 'orange', 'violet', 'lime'])
        expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => colourOf(i).name)).toEqual(COLOURS.map((c) => c.name))
    })

    it('the eleventh lamp starts the list again and the name carries the round', () => {
        expect(colourOf(10)).toEqual({ name: 'red #2', hex: '#ff0000', round: 2 })
        expect(colourOf(19).name).toBe('lime #2')
        expect(colourOf(20).name).toBe('red #3')
        expect(colourOf(0)).toEqual({ name: 'red', hex: '#ff0000', round: 1 })
    })

    it('no two lamps share a name, however many', () => {
        const names = Array.from({ length: 300 }, (_, i) => colourOf(i).name)
        expect(new Set(names).size).toBe(300)
    })

    it('"well separated" is a number: the closest pair of the list is more than 26 ΔE apart (measured 27.0, CIE76)', () => {
        let min = Infinity
        for (let i = 0; i < COLOURS.length; i++) for (let j = i + 1; j < COLOURS.length; j++) min = Math.min(min, deltaE(COLOURS[i].hex, COLOURS[j].hex))
        expect(min).toBeGreaterThan(26)
        expect(min).toBeGreaterThan(MIN_APART)
    })

    it('and why violet and lime are not the plain #8000ff / #80ff00: those sit only 17-19 ΔE from blue and green', () => {
        expect(deltaE('#0000ff', '#8000ff')).toBeLessThan(MIN_APART)
        expect(deltaE('#00ff00', '#80ff00')).toBeLessThan(MIN_APART)
    })

    it('the lamps NEXT to each other in the list differ most (no neighbours under 45 ΔE)', () => {
        for (let i = 0; i < COLOURS.length; i++) expect(deltaE(COLOURS[i].hex, COLOURS[(i + 1) % COLOURS.length].hex)).toBeGreaterThan(45)
    })
})

// ---- the selector --------------------------------------------------------------------------------------------------

describe('selector: --universe --from --to --type --name, combinable', () => {
    it('reads the flags (strings, as parseArgs gives them)', () => {
        expect(selectorOf({ universe: '1', from: '17', to: '96' })).toEqual({ universe: 1, from: 17, to: 96, type: null, name: null, label: null })
        expect(selectorOf({ type: ' UP-PL5403 ' })).toMatchObject({ type: 'up-pl5403' })
        expect(selectorOf({ name: 'line R', group: 'floor washes' })).toMatchObject({ name: 'line R', label: 'floor washes' })
        expect(selectorOf({ from: '20' })).toMatchObject({ from: 20, to: null })
        expect(describeSelector(selectorOf({ universe: '2', type: 'up-pl5403', name: 'line R' }))).toBe('universe 2, type up-pl5403, name contains "line R"')
        expect(describeSelector(selectorOf({ from: '20' }))).toBe('first channel 20-512')
    })

    it('refuses to pick the whole rig, and refuses what it cannot read', () => {
        expect(() => selectorOf({})).toThrow(/say which lamps/)
        expect(() => selectorOf({ group: 'only a label' })).toThrow(/say which lamps/)
        expect(() => selectorOf({ from: '96', to: '17' })).toThrow(/after --to/)
        expect(() => selectorOf({ universe: '0' })).toThrow(/--universe/)
        expect(() => selectorOf({ universe: 'two' })).toThrow(/--universe/)
        expect(() => selectorOf({ universe: true })).toThrow(/nothing/)
        expect(() => selectorOf({ from: '600' })).toThrow(/--from/)
        expect(() => selectorOf({ type: true })).toThrow(/--type/)
        expect(() => selectorOf({ name: true })).toThrow(/--name/)
        expect(() => selectorOf({ name: '' })).toThrow(/--name/)
    })
})

describe('selector: which lamps are in the group', () => {
    const lamp = (over) => ({ id: 'a', name: 'UP-PL5403 line R (used)', typeId: 'up-pl5403', universe: 1, address: 81, ...over })

    it('--universe is 1-based on the flag and 0-based on the lamp', () => {
        expect(inGroup(lamp({ universe: 0 }), sel({ universe: '1' }))).toBe(true)
        expect(inGroup(lamp({ universe: 0 }), sel({ universe: '2' }))).toBe(false)
        expect(inGroup(lamp({ universe: 1 }), sel({ universe: '2' }))).toBe(true)
    })

    it('--from/--to run over the lamp\'s FIRST channel, both ends inclusive, either alone', () => {
        const s = sel({ from: '17', to: '96' })
        expect([16, 17, 89, 96, 97].map((address) => inGroup(lamp({ address }), s))).toEqual([false, true, true, true, false])
        expect([10, 20, 500].map((address) => inGroup(lamp({ address }), sel({ from: '20' })))).toEqual([false, true, true])
        expect([10, 20, 500].map((address) => inGroup(lamp({ address }), sel({ to: '20' })))).toEqual([true, true, false])
    })

    it('--type is the exact type id (case and spaces aside), not a part of it', () => {
        expect(inGroup(lamp(), sel({ type: 'up-pl5403' }))).toBe(true)
        expect(inGroup(lamp(), sel({ type: 'UP-PL5403' }))).toBe(true)
        expect(inGroup(lamp(), sel({ type: 'pl5403' }))).toBe(false)
        expect(inGroup(lamp({ typeId: 'up-pl54031' }), sel({ type: 'up-pl5403' }))).toBe(false)
        expect(inGroup(lamp({ typeId: null }), sel({ type: 'up-pl5403' }))).toBe(false)
    })

    it('--name is a substring of the entity name, exactly as written: "line R" is the R washes, not "side line right"', () => {
        const s = sel({ name: 'line R' })
        expect(inGroup(lamp({ name: 'UP-PL5403 line R (used)' }), s)).toBe(true)
        expect(inGroup(lamp({ name: 'UP-PL5403 line R (U2, placed by hand)' }), s)).toBe(true)
        expect(inGroup(lamp({ name: 'UP-B380F side line right (used)' }), s)).toBe(false)
        expect(inGroup(lamp({ name: 'UP-PL5403 line B (used)' }), s)).toBe(false)
        expect(inGroup(lamp({ name: undefined }), s)).toBe(false)
    })

    it('the flags together are AND', () => {
        const s = sel({ universe: '1', from: '17', to: '96', type: 'up-pl5403' })
        const lamps = [lamp({ id: '1' }), lamp({ id: '2', universe: 1 }), lamp({ id: '3', address: 120 }), lamp({ id: '4', typeId: 'up-b380f' })]
        expect(selectLamps(lamps, s).map((l) => l.id)).toEqual([])
        expect(selectLamps(lamps, sel({ universe: '2', from: '17', to: '96', type: 'up-pl5403' })).map((l) => l.id)).toEqual(['1', '2'])
    })
})

// ---- the order -----------------------------------------------------------------------------------------------------

describe('place order: along the longer extent of the x/z spread', () => {
    const at = (id, x, z, extra = {}) => ({ id, universe: 0, address: 1, position: [x, 3, z], ...extra })

    it('a row along x is ordered by x, lowest first', () => {
        const input = [at('c', 5, 1), at('a', -9, 2), at('b', 0, 0)]
        const o = orderByPlace(input)
        expect(o.axis).toBe('x')
        expect(o.lamps.map((l) => l.id)).toEqual(['a', 'b', 'c'])
        expect(o.spread).toEqual({ x: 14, z: 2 })
        expect(input.map((l) => l.id)).toEqual(['c', 'a', 'b'])   // the input is not reordered
    })

    it('a row along z is ordered by z', () => {
        const o = orderByPlace([at('c', 1, 40), at('a', 0, -3), at('b', 2, 12)])
        expect(o.axis).toBe('z')
        expect(o.lamps.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    })

    it('equal spreads go to x; one lamp, or lamps stacked on one spot, never fail', () => {
        expect(orderByPlace([at('a', 0, 0), at('b', 3, 3)]).axis).toBe('x')
        expect(orderByPlace([at('a', 0, 0)]).lamps.map((l) => l.id)).toEqual(['a'])
        expect(orderByPlace([]).lamps).toEqual([])
        const stacked = orderByPlace([at('b', 1, 1, { address: 9, position: [1, 5, 1] }), at('a', 1, 1, { address: 3, position: [1, 3, 1] })])
        expect(stacked.lamps.map((l) => l.id)).toEqual(['a', 'b'])   // same x and z: lower first, then address
    })

    it('ties along the axis are broken by the other axis, then height, then address, then id', () => {
        const o = orderByPlace([
            at('d', 10, 9), at('c', 10, 2), at('b', 10, 2, { position: [10, 5, 2] }), at('a1', 10, 2, { address: 5, position: [10, 4, 2] }), at('a0', 10, 2, { address: 4, position: [10, 4, 2] }),
            at('far', 40, 0)
        ])
        expect(o.axis).toBe('x')
        expect(o.lamps.map((l) => l.id)).toEqual(['c', 'a0', 'a1', 'b', 'd', 'far'])
    })

    it('a centimetre of float noise never reorders two lamps', () => {
        const o = orderByPlace([at('a', 1.0, 5), at('b', 1.004, 2), at('far', 30, 0)])
        expect(o.lamps.map((l) => l.id)).toEqual(['b', 'a', 'far'])   // 1.000 and 1.004 are the same centimetre: z decides, not the noise
    })

    it('a lamp with no place goes last, in address order, and is counted', () => {
        const o = orderByPlace([{ id: 'n2', universe: 0, address: 30, position: null }, at('a', 4, 0), { id: 'n1', universe: 0, address: 10 }, at('b', -4, 0)])
        expect(o.lamps.map((l) => l.id)).toEqual(['b', 'a', 'n1', 'n2'])
        expect(o.unplaced).toBe(2)
    })
})

// ---- never lit -----------------------------------------------------------------------------------------------------

describe('lasers, hazers and machines that put something but light into the air are never lit', () => {
    it('by the type\'s category', () => {
        for (const id of ['up-la40wf', 'ext-lc-ultra-mk2', 'ext-hazer', 'up-yz31p', 'up-q108s', 'up-yh600f']) expect(isNeverLit(typeOf(id)), id).toBe(true)
        for (const id of ['up-pl5403', 'up-b380f', 'up-250bsw', 'up-hk1915', 'ext-strobe', 'ext-blinder', 'up-cob200']) expect(isNeverLit(typeOf(id)), id).toBe(false)
    })

    it('and by name for a show\'s own type that has no category yet; an unknown type is not guessed', () => {
        expect(isNeverLit({ id: 'rental-fogger', code: 'FOGGER' })).toBe(true)
        expect(isNeverLit({ id: 'x-1', code: 'X-1', category: 'par' })).toBe(false)
        expect(isNeverLit(null)).toBe(false)
    })
})

// ---- the lamps on the desk -----------------------------------------------------------------------------------------

describe('lampsOnDesk: the document, the rig and the desk\'s live patch joined', () => {
    it('takes address and universe from the desk\'s live fixture, the place and name from the document', () => {
        const d = deskOf([PAR('par-a', 17, [1, 2, 3])])
        const [l] = lampsOnDesk({ ...d, library })
        expect(l).toMatchObject({ id: 'par-a', name: 'UP-PL5403 par-a', typeId: 'up-pl5403', universe: 0, address: 17, position: [1, 2, 3], profile: 'UP-PL5403 8ch' })
        expect(l.mode.channels.map((c) => c.role)).toEqual(l.roles)
    })

    it('a lamp the desk does not carry is not there; the desk\'s address wins over the document\'s', () => {
        const d = deskOf([PAR('par-a', 17, [0, 0, 0]), PAR('par-b', 25, [0, 0, 1])])
        d.entities[0].components.fixture.address = 999
        d.fixtures.splice(1, 1)
        const lamps = lampsOnDesk({ ...d, library })
        expect(lamps.map((l) => [l.id, l.address])).toEqual([['par-a', 17]])
    })

    it('a lamp whose entity is gone, or whose type the library does not know, is still on the desk, with no mode', () => {
        const d = deskOf([PAR('par-a', 17, [0, 0, 0]), PAR('par-b', 25, [0, 0, 1])])
        d.entities.splice(0, 1)
        d.entities[0].components.fixture.type = 'not-in-the-library'
        const lamps = lampsOnDesk({ ...d, library })
        expect(lamps.map((l) => [l.id, l.type, l.mode])).toEqual([['par-a', null, null], ['par-b', null, null]])
        expect(lamps[0].name).toBe('par-a')
    })
})

// ---- the plan ------------------------------------------------------------------------------------------------------

describe('plan: a group in place order, each lit lamp in its own colour, the rest dark', () => {
    it('orders the whole of U1 along z and gives colours to the lamps that can be lit, in that order', () => {
        const { plan } = sceneA()
        const p = plan(sel({ universe: '1', from: '1', to: '199' }))
        expect(p.axis).toBe('z')
        expect(p.rows.map((r) => r.lamp.id)).toEqual(['par-d', 'laser-1', 'par-b', 'beam-1', 'par-c', 'par-a'])
        expect(p.rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6])
        expect(p.rows.map((r) => r.label)).toEqual(['U1.041', 'U1.100', 'U1.025', 'U1.057', 'U1.033', 'U1.017'])
        expect(p.rows.map((r) => r.colour?.name ?? null)).toEqual(['red', null, 'green', 'blue', 'yellow', 'magenta'])   // the laser takes none, and no colour is skipped for it
        expect(p.universes).toEqual([0])
    })

    it('encodes exactly as a scene does: encodeDmx with the running mode, dimmer full, RGBW mixed, the wheel on its nearest slot', () => {
        const { plan, lamps } = sceneA()
        const p = plan(sel({ type: 'up-pl5403', universe: '1' }))
        for (const r of p.rows) {
            const direct = encodeDmx(r.lamp.mode.channels, { level: 1, colour: r.colour.hex }, r.lamp.type)
            expect(r.values).toEqual(direct)
            expect(r.values.dimmer).toBe(255)
        }
        expect(p.rows[0].values).toMatchObject({ r: 255, g: 0, b: 0, w: 0, dimmer: 255 })   // red on RGBW: the red emitter alone
        expect(p.rows[3].values).toMatchObject({ r: 255, g: 255, b: 0, w: 0 })              // yellow: red + green
        const beam = lamps.find((l) => l.id === 'beam-1')
        const wheel = valuesOf(beam, colourOf(2))   // blue on the wheel lamp
        expect(Object.keys(wheel).sort()).toEqual(['color', 'dimmer', 'strobe'])   // a slot, full dimmer, shutter open: no r/g/b on a wheel lamp
        expect(wheel).toEqual(encodeDmx(beam.mode.channels, { level: 1, colour: '#0000ff' }, beam.type))
        expect(wheel.dimmer).toBe(255)
    })

    it('holds the lit lamps\' channels at the desk addresses (1-based channel, 0-based universe), speaking only of the channels that matter', () => {
        const { plan } = sceneA()
        const p = plan(sel({ type: 'up-pl5403', universe: '1', to: '30' }))   // par-a at 17 (z 30) and par-b at 25 (z 10): par-b is place 1
        const lit = (id) => p.cells.filter((c) => c.kind === 'lit' && c.by === id).map((c) => [c.universe, c.channel, c.value])
        expect(lit('par-b')).toEqual([[0, 25, 255], [0, 26, 255], [0, 27, 0], [0, 28, 0], [0, 29, 0]])   // red: dimmer, r, g, b, w
        expect(lit('par-a')).toEqual([[0, 17, 255], [0, 18, 0], [0, 19, 255], [0, 20, 0], [0, 21, 0]])   // green; the strobe and function channels are left to the show
    })

    it('never writes pan or tilt', () => {
        const { plan } = sceneA()
        const p = plan(sel({ type: 'up-b380f' }))
        const beam = p.rows[0].lamp
        const roles = beam.mode.channels.map((c) => c.role)
        const posed = p.cells.filter((c) => c.by === 'beam-1').map((c) => roles[c.channel - beam.address])
        expect(posed.length).toBeGreaterThan(0)
        expect(posed.filter((r) => /^(pan|tilt|panFine|tiltFine)$/.test(r))).toEqual([])
    })

    it('a laser in the group is never lit: every channel of it held at 0, it takes no colour, and the output says so', () => {
        const { plan } = sceneA()
        const p = plan(sel({ type: 'up-la40wf' }))
        expect(p.rows).toHaveLength(1)
        expect(p.rows[0]).toMatchObject({ status: 'zero', colour: null, values: null })
        const mine = p.cells.filter((c) => c.by === 'laser-1')
        expect(mine).toHaveLength(32)
        expect(mine.every((c) => c.value === 0 && c.kind === 'zero' && c.universe === 0)).toBe(true)
        expect(mine.map((c) => c.channel)).toEqual(Array.from({ length: 32 }, (_, i) => 100 + i))
        const text = formatPlan(p, { project: 'demo' }).join('\n')
        expect(text).toMatch(/NEVER LIT/)
        expect(text).toMatch(/every channel of them held at 0/)
        expect(text).toMatch(/held at 0 \(laser\)/)
    })

    it('a hazer or smoke machine picked with the group is held at 0 as well', () => {
        const d = deskOf([{ id: 'smoke-1', name: 'a smoke machine', type: 'up-yz31p', mode: '1ch-assumed', u: 1, a: 300, pos: [0, 1, 0] }, PAR('par-a', 17, [0, 3, 3])])
        const lamps = lampsOnDesk({ ...d, library })
        const p = planGroup({ lamps, selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        const smoke = p.rows.find((r) => r.lamp.id === 'smoke-1')
        expect(smoke.status).toBe('zero')
        expect(p.cells.filter((c) => c.by === 'smoke-1')).toEqual([{ universe: 0, channel: 300, value: 0, kind: 'zero', by: 'smoke-1' }])
        expect(p.rows.find((r) => r.lamp.id === 'par-a').colour.name).toBe('red')   // the machine took no colour
    })

    it('everything else of the group\'s universes is held dark: a dimmer at 0, else the emitters at 0, else it is named', () => {
        const { plan } = sceneA()
        const p = plan(sel({ type: 'up-pl5403', universe: '1', to: '40' }))   // 3 PARs; the rest of U1 goes dark
        const dark = p.cells.filter((c) => c.kind === 'dark')
        const at = (u, ch) => dark.find((c) => c.universe === u && c.channel === ch)
        expect(at(0, 200)).toMatchObject({ value: 0, by: 'o-dim' })                               // another project's dimmer
        expect([210, 211, 212].map((ch) => at(0, ch)?.value)).toEqual([0, 0, 0])                // a dimmer-less RGB lamp: its emitters
        expect(dark.find((c) => c.by === 'o-smoke')).toBeUndefined()                            // nothing to darken on a fog-only profile
        expect(p.dark.left).toEqual([{ id: 'o-smoke', name: 'a fog machine', label: 'U1.220' }])
        const beam = dark.filter((c) => c.by === 'fx4')   // the wheel beam: only its dimmer
        expect(beam).toHaveLength(1)
        expect(beam[0].channel).toBe(57 + 7)               // dimmer is the 8th channel of the 16ch list
        expect(dark.filter((c) => c.by === 'fx5').map((c) => c.channel)).toEqual([100])   // a laser that was not picked: its output channel only
        expect(p.cells.some((c) => c.universe === 1)).toBe(false)   // U2 is not this group's: untouched
        expect(p.cells.filter((c) => c.by === 'fx0' || c.by === 'fx1' || c.by === 'fx2').every((c) => c.kind === 'lit')).toBe(true)   // the picked lamps are not darkened
    })

    it('one value per channel: the cells never repeat an address', () => {
        const { plan } = sceneA()
        const p = plan(sel({ universe: '1' }))
        const keys = p.cells.map((c) => `${c.universe}:${c.channel}`)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('the dark fixtures of a universe are those of EVERY project; another universe stays alone', () => {
        const { plan } = sceneA()
        const p = plan(sel({ universe: '2' }))
        expect(p.universes).toEqual([1])
        expect(p.rows.map((r) => r.lamp.id)).toEqual(['par-u2'])
        expect(p.cells.filter((c) => c.kind === 'dark').map((c) => [c.universe, c.channel])).toEqual([[1, 20]])
        expect(p.cells.every((c) => c.universe === 1)).toBe(true)
    })

    it('lamps beyond the tenth repeat the list, marked, and the output says where; the repeats are not "alike"', () => {
        const rig = Array.from({ length: 12 }, (_, i) => PAR(`p${i + 1}`, 1 + i * 8, [i * 2, 3, 0]))
        const d = deskOf(rig)
        const p = planGroup({ lamps: lampsOnDesk({ ...d, library }), selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        expect(p.rows.map((r) => r.colour.name).slice(8)).toEqual(['violet', 'lime', 'red #2', 'green #2'])
        expect(p.warnings.find((w) => /colours repeat/.test(w))).toMatch(/from place 11 the colours repeat/)
        expect(p.warnings.some((w) => /hard to tell apart/.test(w))).toBe(false)
    })

    it('what the room draws is checked: a wheel lamp has fewer slots than the list has colours, and the lamps that come out alike are named', () => {
        const rig = Array.from({ length: 10 }, (_, i) => ({ id: `b${i + 1}`, name: `UP-B380F b${i + 1}`, type: 'up-b380f', mode: '16ch', u: 1, a: 1 + i * 16, pos: [i, 0.7, 0] }))
        const d = deskOf(rig)
        const p = planGroup({ lamps: lampsOnDesk({ ...d, library }), selector: sel({ type: 'up-b380f' }), fixtures: d.fixtures, profiles: d.profiles })
        const drawn = p.rows.map((r) => r.drawn)
        expect(new Set(drawn).size).toBeLessThan(10)   // measured 2026-10-17: ten colours land on fewer wheel slots
        const w = p.warnings.filter((x) => /hard to tell apart/.test(x))
        expect(w.length).toBeGreaterThan(0)
        expect(w.join(' ')).toMatch(/place \d+ \w+/)
        // every lamp named in a warning really is within MIN_APART of another named in the same warning
        for (const g of alikeClusters(p.rows)) for (const r of g) expect(g.some((o) => o !== r && o.colour.hex !== r.colour.hex && deltaE(o.drawn, r.drawn) < MIN_APART)).toBe(true)
    })

    it('RGBW lamps draw the colours they were given, so a PAR group is never "alike"', () => {
        const { plan } = sceneA()
        const p = plan(sel({ type: 'up-pl5403', universe: '1' }))
        expect(p.rows.map((r) => [r.colour.name, r.drawn])).toEqual([['red', '#ff0000'], ['green', '#00ff00'], ['blue', '#0000ff'], ['yellow', '#ffff00']])
        expect(p.warnings.filter((w) => /hard to tell apart/.test(w))).toEqual([])
    })

    it('the draws column is the room\'s own decode of the held values', () => {
        const { plan } = sceneA()
        const p = plan(sel({ universe: '1', from: '1', to: '99' }))
        for (const r of p.rows.filter((x) => x.status === 'lit')) {
            const d = decodeDmx(r.lamp.mode.channels, r.lamp.mode.channels.map((c) => r.values[c.role] ?? 0), r.lamp.type)
            expect(r.drawn).toBe(d.colour)
        }
    })

    it('says so when the DMX output of the desk is off: the rig gets nothing', () => {
        const { plan } = sceneA()
        expect(plan(sel({ type: 'up-pl5403' }), { desk: { outputEnabled: false } }).warnings.join(' ')).toMatch(/DMX output is OFF/)
        expect(plan(sel({ type: 'up-pl5403' }), { desk: { outputEnabled: true } }).warnings).toEqual([])
    })

    it('says so when the desk would not show the colours: blackout, or a master below full', () => {
        const { plan } = sceneA()
        const s = sel({ type: 'up-pl5403' })
        expect(plan(s).warnings).toEqual([])
        expect(plan(s, { desk: { blackout: true, master: 255 } }).warnings.join(' ')).toMatch(/BLACKOUT/)
        expect(plan(s, { desk: { blackout: false, master: 200 } }).warnings.join(' ')).toMatch(/master is at 200\/255/)
        expect(plan(s, { desk: { master: NaN } }).warnings).toEqual([])
    })

    it('two lamps patched on the same channels are named: that is a patch fault, and the audit exists to find it', () => {
        const d = deskOf([PAR('p1', 17, [0, 3, 0]), PAR('p2', 20, [0, 3, 5])])
        const p = planGroup({ lamps: lampsOnDesk({ ...d, library }), selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        expect(p.warnings.filter((x) => /^overlap/.test(x))).toEqual(['overlap: p1 (U1.017-024) and p2 (U1.020-027) share U1.020-024; check the patch'])
        const keys = p.cells.map((c) => `${c.universe}:${c.channel}`)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('overlaps are footprints, not just written channels, and only count when a picked lamp is one of the two', () => {
        // picked p1 (U1.017-024) beside a fixture of another project at U1.024: the picked lamp is one of the two, so it is named
        const d = deskOf([PAR('p1', 17, [0, 3, 0])], [{ id: 'x1', u: 1, a: 24, profile: 'dimmer', roles: ['dimmer'], name: 'someone else' }, { id: 'x2', u: 1, a: 300, profile: 'dimmer', roles: ['dimmer', 'r'] }, { id: 'x3', u: 1, a: 301, profile: 'rgb', roles: ['r', 'g', 'b'] }, { id: 'x4', u: 2, a: 17, profile: 'dimmer', roles: ['dimmer'] }])
        const lamps = lampsOnDesk({ ...d, library })
        const p = planGroup({ lamps, selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        expect(p.warnings.filter((w) => /^overlap/.test(w))).toEqual(['overlap: p1 (U1.017-024) and someone else (U1.024) share U1.024; check the patch'])   // x2/x3 overlap each other: not this group's business; x4 is on U2
        expect(overlapsOf([], {}, new Set())).toEqual([])
    })

    it('a lamp that runs past channel 512 cannot be held there and says so, once per lamp', () => {
        const run512 = (a) => {
            const d = deskOf([PAR('late', a, [0, 3, 0])])
            return planGroup({ lamps: lampsOnDesk({ ...d, library }), selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        }
        const one = run512(509)   // dimmer r g b w sit on 509-513
        expect(one.warnings).toContain('late: channel 513 of U1 is outside 1-512, the desk cannot hold it')
        expect(Math.max(...one.cells.map((c) => c.channel))).toBe(512)
        const three = run512(511)   // 511-515
        expect(three.warnings).toContain('late: channels 513-515 of U1 are outside 1-512, the desk cannot hold them')
        expect(three.warnings.filter((w) => /outside 1-512/.test(w))).toHaveLength(1)
    })

    it('a desk profile that does not match the chart is named: the colours would be wrong', () => {
        const d = deskOf([PAR('p1', 17, [0, 3, 0])])
        d.profiles['UP-PL5403 8ch'].channels = ['dimmer', 'r', 'g', 'b']
        const p = planGroup({ lamps: lampsOnDesk({ ...d, library }), selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        expect(p.warnings.join(' ')).toMatch(/desk profile "UP-PL5403 8ch" has other channels than the chart/)
    })

    it('a lamp with no channel list cannot be lit, takes no colour, and is darkened by the desk\'s own profile', () => {
        const d = deskOf([PAR('p1', 17, [0, 3, 0]), PAR('p2', 25, [0, 3, 5]), PAR('p3', 33, [0, 3, 9])])
        d.entities[1].components.fixture.type = 'up-250bsw'   // channels owed
        d.entities[1].components.fixture.mode = '24ch'
        const lamps = lampsOnDesk({ ...d, library })
        expect(lamps[1].mode).toBeNull()
        const p = planGroup({ lamps, selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        expect(p.rows.map((r) => [r.lamp.id, r.status, r.colour?.name ?? null])).toEqual([['p1', 'lit', 'red'], ['p2', 'unlit', null], ['p3', 'lit', 'green']])
        expect(p.rows[1].note).toBe('no channel list')
        expect(p.warnings.join(' ')).toMatch(/place 2 U1\.025 p2 cannot be lit: no channel list for up-250bsw 24ch/)
        expect(p.cells.filter((c) => c.by === 'fx1')).toEqual([{ universe: 0, channel: 25, value: 0, kind: 'dark', by: 'fx1' }])
    })

    it('a lamp with no place in the document comes last and is counted', () => {
        const d = deskOf([PAR('p1', 17, [0, 3, 9]), PAR('p2', 25, [0, 3, 1])])
        d.entities[1].components.transform = {}
        const p = planGroup({ lamps: lampsOnDesk({ ...d, library }), selector: sel({ universe: '1' }), fixtures: d.fixtures, profiles: d.profiles })
        expect(p.rows.map((r) => r.lamp.id)).toEqual(['p1', 'p2'])
        expect(p.warnings.join(' ')).toMatch(/1 lamp has no place/)
    })

    it('a group that matches nothing is an error that says what the desk does carry', () => {
        const { plan } = sceneA()
        expect(() => plan(sel({ universe: '3' }))).toThrow(/no lamp of the project that is on the desk matches \(universe 3\)\. Lamps on the desk: U1: 6, U2: 1\./)
        expect(() => plan(sel({ name: 'nothing like this' }))).toThrow(/name contains "nothing like this"/)
    })

    it('darkCells: dimmer and fine, else emitters, else nothing', () => {
        const f = { universe: 1, address: 10 }
        expect(darkCells(f, ['pan', 'dimmer', 'r', 'dimmerFine'])).toEqual([{ universe: 1, channel: 11, value: 0 }, { universe: 1, channel: 13, value: 0 }])
        expect(darkCells(f, ['r', 'g', 'b', 'w', 'strobe'])).toEqual([10, 11, 12, 13].map((channel) => ({ universe: 1, channel, value: 0 })))
        expect(darkCells(f, ['warm', 'cool'])).toHaveLength(2)
        expect(darkCells(f, ['aux1'])).toEqual([])
        expect(darkCells(f, [])).toEqual([])
    })
})

// ---- the table -----------------------------------------------------------------------------------------------------

describe('the table', () => {
    it('prints place, address, entity, name, colour and what it draws, in place order', () => {
        const { plan } = sceneA()
        const p = plan(sel({ type: 'up-pl5403', universe: '1', group: 'truss washes' }))
        const lines = formatPlan(p, { project: 'demo', desk: 'http://desk.test/light' })
        expect(lines[0]).toBe('group "truss washes" — project demo, universe 1, type up-pl5403 — desk http://desk.test/light')
        expect(lines[1]).toBe('4 lamps on U1, in place order along z (lowest first, z 0.00 -> 30.00 m; spread x 0.00 m, z 30.00 m)')
        expect(lines[2].replace(/\s+/g, ' ')).toBe('place address entity name colour draws')
        expect(lines[3].replace(/\s+/g, ' ').trim()).toBe('1 U1.041 par-d UP-PL5403 par-d red #ff0000')
        expect(lines[4].replace(/\s+/g, ' ').trim()).toBe('2 U1.025 par-b UP-PL5403 par-b green #00ff00')
        expect(lines[6].replace(/\s+/g, ' ').trim()).toBe('4 U1.017 par-a UP-PL5403 par-a yellow #ffff00')
        expect(lines.some((l) => /^4 lit, dimmer full$/.test(l))).toBe(true)
        expect(lines.some((l) => /^dark: \d+ other fixtures on U1 held at dimmer 0/.test(l))).toBe(true)
    })

    it('a dry run adds the channel values, the same ones that would be held', () => {
        const { plan } = sceneA()
        const p = plan(sel({ type: 'up-pl5403', universe: '1' }))
        const lines = formatPlan(p, { dry: true })
        expect(lines).toContain('channel values (U<universe>.<first channel> role=value):')
        expect(lines).toContain('  U1.041 par-d: dimmer=255 r=255 g=0 b=0 w=0')
        expect(lines.some((l) => /^ {2}dark U1\.\d+=0/.test(l))).toBe(true)
        expect(formatPlan(p).some((l) => /channel values/.test(l))).toBe(false)
    })

    it('addressLabel is the crew\'s U1.017', () => {
        expect(addressLabel(0, 17)).toBe('U1.017')
        expect(addressLabel(1, 481)).toBe('U2.481')
    })
})

// ---- holding and releasing -----------------------------------------------------------------------------------------

describe('what is held, remembered and given back', () => {
    const cell = (universe, channel, value) => ({ universe, channel, value })

    it('remembers what the desk held there before, and is silent about channels that were free', () => {
        const r = holdPlan([cell(0, 17, 255), cell(0, 18, 0), cell(1, 5, 0)], { raw: { '0:18': 7 } })
        expect(r.hold).toEqual([cell(0, 17, 255), { ...cell(0, 18, 0), was: 7 }, cell(1, 5, 0)])
        expect(r.heldByOthers).toEqual([{ ...cell(0, 18, 0), was: 7 }])
        expect(r.drop).toEqual([])
    })

    it('a new group replaces the last: its other channels are given back in the same request, and "before" is the first run\'s', () => {
        const previous = [{ universe: 0, channel: 17 }, { universe: 0, channel: 18, was: 5 }, { universe: 0, channel: 99 }, { universe: 0, channel: 100, was: 40 }]
        const raw = { '0:17': 255, '0:18': 0, '0:99': 0, '0:100': 0 }   // the desk now holds the earlier group's values
        const r = holdPlan([cell(0, 17, 0), cell(0, 18, 255), cell(0, 30, 0)], { raw, previous })
        expect(r.hold).toEqual([cell(0, 17, 0), { ...cell(0, 18, 255), was: 5 }, cell(0, 30, 0)])   // 17 was free before the first run; its 255 is the first run's own
        expect(r.drop).toEqual([cell(0, 99, -1), cell(0, 100, 40)])
        expect(r.heldByOthers).toEqual([])   // 18 is held by this tool's earlier run, not by something else
    })

    it('the held list keeps where and was, not the value; release puts back the old hold or lets the show have it', () => {
        const { hold } = holdPlan([cell(0, 17, 255), cell(0, 18, 0)], { raw: { '0:18': 7 } })
        expect(heldList(hold)).toEqual([{ universe: 0, channel: 17 }, { universe: 0, channel: 18, was: 7 }])
        expect(releaseOf(heldList(hold))).toEqual([cell(0, 17, -1), cell(0, 18, 7)])
        expect(releaseOf([{ universe: 0, channel: 3, was: 0 }])).toEqual([cell(0, 3, 0)])   // a hold at 0 is a hold: not released to the show
    })

    it('verifyRaw: held channels must carry the value, released ones must be gone', () => {
        const raw = { '0:17': 255, '0:18': 3 }
        expect(verifyRaw(raw, [cell(0, 17, 255), cell(0, 19, -1)])).toEqual([])
        expect(verifyRaw(raw, [cell(0, 18, 0)])).toEqual(['U1.018 wanted 0, the desk has 3'])
        expect(verifyRaw(raw, [cell(0, 17, -1)])).toEqual(['U1.017 wanted released, the desk has 255'])
        expect(verifyRaw({}, [cell(0, 20, 9)])).toEqual(['U1.020 wanted 9, the desk has nothing held'])
    })

    describe('the held file', () => {
        let dir
        beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-identify-held-')) })
        afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })
        const write = (text) => { const f = path.join(dir, 'held.json'); fs.writeFileSync(f, text); return f }

        it('no file is null; a list is read back; anything else is refused and left alone', () => {
            expect(readHeld(path.join(dir, 'none.json'))).toBeNull()
            expect(readHeld(write('[{"universe":0,"channel":17},{"universe":1,"channel":512,"was":0}]'))).toEqual([{ universe: 0, channel: 17 }, { universe: 1, channel: 512, was: 0 }])
            expect(readHeld(write('[]'))).toEqual([])
            for (const bad of ['not json', '{}', '[{"universe":0}]', '[{"universe":0,"channel":0}]', '[{"universe":0,"channel":513}]', '[{"universe":-1,"channel":3}]', '[{"universe":0,"channel":3,"was":300}]', '[{"universe":0,"channel":3.5}]', '[null]']) {
                const f = write(bad)
                expect(() => readHeld(f), bad).toThrow(/not left alone or overwritten/)
                expect(fs.readFileSync(f, 'utf8')).toBe(bad)
            }
        })

        it('reads the list all-colour.mjs writes (so either command can release the other)', () => {
            expect(readHeld(write('[{"universe":0,"channel":1},{"universe":0,"channel":2}]'))).toHaveLength(2)
        })
    })
})

// ---- the command, against a stand-in desk --------------------------------------------------------------------------

/** A desk that answers as desk.js does: GET rig/state, POST raw (value < 0 or null releases; the answer carries the raw map). */
const standInDesk = ({ rig, fixtures, profiles, raw = {}, blackout = false, master = 255, holds = true, down = false }) => {
    const calls = []
    const state = { fixtures, profiles, raw: { ...raw }, blackout, master }
    const fetch = async (url, init = {}) => {
        if (down) throw new Error('connect ECONNREFUSED')
        const u = new URL(url)
        const method = init.method || 'GET'
        calls.push({ method, path: u.pathname + u.search, body: init.body ? JSON.parse(init.body) : null })
        const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
        if (method === 'GET' && u.pathname === '/light/api/rig') return reply({ fixtures: rig })
        if (method === 'GET' && u.pathname === '/light/api/state') return reply(state)
        if (method === 'POST' && u.pathname === '/light/api/raw') {
            if (holds) for (const c of JSON.parse(init.body).channels) { if (c.value == null || c.value < 0) delete state.raw[`${c.universe}:${c.channel}`]; else state.raw[`${c.universe}:${c.channel}`] = Math.max(0, Math.min(255, c.value | 0)) }
            return reply({ ok: true, raw: state.raw })
        }
        return reply({}, 404)
    }
    return { fetch, calls, state }
}

describe('the command', () => {
    let dir
    let held
    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-identify-run-')); held = path.join(dir, 'held.json') })
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

    const setup = (deskOver = {}) => {
        const d = deskOf(RIG_A, OTHERS)
        const desk = standInDesk({ rig: d.rig, fixtures: d.fixtures, profiles: d.profiles, ...deskOver })
        const lines = []
        const go = (argv, io = {}) => run(argv, { fetch: desk.fetch, say: (...p) => lines.push(p.join(' ')), env: { PROJECT: 'demo', TMPDIR: dir }, getEntities: async () => d.entities, ...io })
        return { d, desk, lines, go }
    }

    it('--dry prints the table and the channel values, and only ever GETs; nothing is held or written', async () => {
        const { desk, lines, go } = setup()
        const code = await go(['--type', 'up-pl5403', '--universe', '1', '--dry', '--held-file', held])
        expect(code).toBe(0)
        expect(desk.calls.map((c) => c.method)).toEqual(['GET', 'GET'])
        expect(desk.calls.map((c) => c.path).sort()).toEqual(['/light/api/rig?project=demo', '/light/api/state'])
        expect(Object.keys(desk.state.raw)).toEqual([])
        expect(fs.existsSync(held)).toBe(false)
        const text = lines.join('\n')
        expect(text).toMatch(/place {2}address {2}entity/)
        expect(text).toMatch(/U1\.041 +par-d/)
        expect(text).toMatch(/channel values/)
        expect(text).toMatch(/dry run: \d+ channels would be held; nothing was posted or written/)
    })

    it('a live run holds the group in ONE post, reads the desk\'s answer back, and writes the held list', async () => {
        const { desk, lines, go } = setup()
        await go(['--type', 'up-pl5403', '--universe', '1', '--held-file', held])
        const posts = desk.calls.filter((c) => c.method === 'POST')
        expect(posts).toHaveLength(1)
        expect(posts[0].path).toBe('/light/api/raw')
        const body = posts[0].body.channels
        expect(body.every((c) => Number.isInteger(c.universe) && Number.isInteger(c.channel) && Number.isInteger(c.value) && c.value >= 0 && c.value <= 255)).toBe(true)
        expect(body).toContainEqual({ universe: 0, channel: 41, value: 255 })   // par-d, place 1: red, dimmer at its first channel
        expect(body).toContainEqual({ universe: 0, channel: 200, value: 0 })    // another project's dimmer, held dark
        expect(body.some((c) => c.universe === 1)).toBe(false)                  // U2 untouched
        expect(Object.keys(desk.state.raw)).toHaveLength(body.length)
        const list = JSON.parse(fs.readFileSync(held, 'utf8'))
        expect(list).toHaveLength(body.length)
        expect(list.every((h) => h.value === undefined)).toBe(true)
        expect(lines.join('\n')).toMatch(new RegExp(`holding ${body.length} channels on the desk`))
        expect(lines.join('\n')).toMatch(/--release --held-file /)
    })

    it('--release posts -1 for exactly the held channels, removes the file, and leaves the desk as it was', async () => {
        const { desk, lines, go } = setup()
        await go(['--type', 'up-pl5403', '--universe', '1', '--held-file', held])
        const list = JSON.parse(fs.readFileSync(held, 'utf8'))
        desk.calls.length = 0
        const code = await go(['--release', '--held-file', held])
        expect(code).toBe(0)
        const post = desk.calls.find((c) => c.method === 'POST')
        expect(post.body.channels).toEqual(list.map(({ universe, channel }) => ({ universe, channel, value: -1 })))
        expect(Object.keys(desk.state.raw)).toEqual([])
        expect(fs.existsSync(held)).toBe(false)
        expect(lines.join('\n')).toMatch(/released \d+ channels: \d+ to the show, 0 back to what the desk held before/)
    })

    it('a channel the desk already held goes back to that value, not to the show (leave it as found)', async () => {
        const { desk, lines, go } = setup({ raw: { '0:200': 0, '0:41': 9 } })   // someone holds another project\'s dimmer at 0, and par-d\'s first channel at 9
        await go(['--type', 'up-pl5403', '--universe', '1', '--held-file', held])
        expect(desk.state.raw['0:41']).toBe(255)
        expect(lines.join('\n')).toMatch(/WARNING: 2 of these channels are already held on the desk by something else/)
        expect(JSON.parse(fs.readFileSync(held, 'utf8')).filter((h) => h.was !== undefined)).toEqual(expect.arrayContaining([{ universe: 0, channel: 200, was: 0 }, { universe: 0, channel: 41, was: 9 }]))
        await go(['--release', '--held-file', held])
        expect(desk.state.raw).toEqual({ '0:200': 0, '0:41': 9 })
    })

    it('a second group replaces the first: no colour is left on a lamp, and one --release gives back everything', async () => {
        const { desk, go } = setup()
        await go(['--type', 'up-pl5403', '--universe', '1', '--held-file', held])
        const first = new Set(Object.keys(desk.state.raw))
        desk.calls.length = 0
        await go(['--universe', '2', '--held-file', held])   // U2 now: the first group's U1 cells are given back in the same post
        const post = desk.calls.find((c) => c.method === 'POST').body.channels
        const gone = post.filter((c) => c.value === -1)
        expect(gone).toHaveLength(first.size)
        expect(gone.every((c) => first.has(`${c.universe}:${c.channel}`))).toBe(true)
        expect(Object.keys(desk.state.raw).every((k) => k.startsWith('1:'))).toBe(true)   // only U2 is held now
        expect(JSON.parse(fs.readFileSync(held, 'utf8')).every((h) => h.universe === 1)).toBe(true)
        await go(['--release', '--held-file', held])
        expect(desk.state.raw).toEqual({})
    })

    it('if the desk does not hold what was asked it stops with an error, and the held list is kept so --release still works', async () => {
        const { go } = setup({ holds: false })
        await expect(go(['--type', 'up-pl5403', '--universe', '1', '--held-file', held])).rejects.toThrow(/channels are not as asked/)
        expect(readHeld(held).length).toBeGreaterThan(0)
    })

    it('a desk that cannot be reached is an error that names it, before anything is written', async () => {
        const { go } = setup({ down: true })
        await expect(go(['--universe', '1', '--held-file', held])).rejects.toThrow(/cannot reach http:\/\/diiii\.localhost\/light\/api\/(rig|state)/)
        expect(fs.existsSync(held)).toBe(false)
    })

    it('readOnly lets a GET through and refuses everything else, so a dry run cannot write even by mistake', async () => {
        const seen = []
        const f = readOnly(async (url, init) => { seen.push([url, init?.method || 'GET']); return 'ok' })
        expect(await f('http://desk.test/api/state')).toBe('ok')
        expect(await f('http://desk.test/api/state', { method: 'GET' })).toBe('ok')
        expect(() => f('http://desk.test/api/raw', { method: 'POST', body: '{}' })).toThrow(/dry run must not write/)
        expect(() => f('http://desk.test/api/raw', { method: 'DELETE' })).toThrow(/dry run must not write/)
        expect(seen).toHaveLength(2)
    })

    it('--release with no held file is an error, not a quiet success; --release --dry posts nothing', async () => {
        const { desk, lines, go } = setup()
        await expect(go(['--release', '--held-file', held])).rejects.toThrow(/nothing released/)
        fs.writeFileSync(held, '[{"universe":0,"channel":17},{"universe":0,"channel":18,"was":3}]')
        await go(['--release', '--held-file', held, '--dry'])
        expect(desk.calls).toEqual([])
        expect(lines.join('\n')).toMatch(/dry run: would give back 2 channels \(1 to the show, 1 to what the desk held before\)/)
        expect(fs.existsSync(held)).toBe(true)
    })

    it('asks for what it needs: a project, a group, a file it can read', async () => {
        const { go } = setup()
        await expect(go(['--universe', '1', '--project'], { env: { TMPDIR: dir } })).rejects.toThrow(/PROJECT/)   // --project with no value is no project
        await expect(go(['--universe', '1', '--api', 'not a url'])).rejects.toThrow(/--api not a url is not a URL/)
        await expect(go(['--universe', '1'], { env: { TMPDIR: dir } })).rejects.toThrow(/PROJECT/)
        await expect(go(['--dry'])).rejects.toThrow(/say which lamps/)
        await expect(go(['--release'], { env: { TMPDIR: dir } })).rejects.toThrow(/--release needs --held-file/)
        fs.writeFileSync(held, 'garbage')
        await expect(go(['--universe', '1', '--dry', '--held-file', held])).rejects.toThrow(/not JSON/)
        await expect(go(['--universe', '1', '--held-file'])).rejects.toThrow(/--held-file needs a path/)
    })

    it('the default held file is named for the project and sits in $TMPDIR', async () => {
        const { go } = setup()
        await go(['--type', 'up-pl5403', '--universe', '1'])
        expect(fs.existsSync(path.join(dir, 'group-identify-demo.held.json'))).toBe(true)
        await go(['--release'])
        expect(fs.existsSync(path.join(dir, 'group-identify-demo.held.json'))).toBe(false)
    })

    it('only the project\'s own rig entries are used, even if the desk answers with another project\'s', async () => {
        const d = deskOf(RIG_A, OTHERS)
        d.rig.push({ key: 'other-project:par-a', id: 'fxZ', profile: 'UP-PL5403 8ch', universe: 1, address: 400 })   // an entity id that this project has too
        d.fixtures.push({ id: 'fxZ', name: 'a foreign PAR', universe: 0, address: 400, profile: 'UP-PL5403 8ch' })
        const desk = standInDesk({ rig: d.rig, fixtures: d.fixtures, profiles: d.profiles })
        const lines = []
        await run(['--universe', '1', '--dry', '--held-file', held], { fetch: desk.fetch, say: (...p) => lines.push(p.join(' ')), env: { PROJECT: 'demo' }, getEntities: async () => d.entities })
        expect(lines.join('\n')).toMatch(/6 lamps on U1/)   // not 7: the foreign entry is not joined to par-a
        expect(lines.filter((l) => /^ +\d+ +U1\.400/.test(l))).toEqual([])
    })

    it('the default held file name is safe whatever the project id holds', async () => {
        const d = deskOf(RIG_A, OTHERS, 'a/b c')
        const desk = standInDesk({ rig: d.rig, fixtures: d.fixtures, profiles: d.profiles })
        await run(['--type', 'up-pl5403', '--universe', '1'], { fetch: desk.fetch, say: () => {}, env: { PROJECT: 'a/b c', TMPDIR: dir }, getEntities: async () => d.entities })
        expect(fs.readdirSync(dir)).toEqual(['group-identify-a_b_c.held.json'])
    })

    it('--help prints the usage and touches nothing', async () => {
        const { desk, lines, go } = setup()
        expect(await go(['--help'])).toBe(0)
        expect(desk.calls).toEqual([])
        expect(lines.join('\n')).toMatch(/--release --held-file/)
    })
})

// ---- the command against the REAL desk code ------------------------------------------------------------------------
// serverXR/src/lighting/desk.js itself, in this process, on an ephemeral loopback port, with no Art-Net socket and a
// throwaway data folder (the way serverXR/src/lighting/tests/test-http.js starts one). What the stand-in above only claims
// about POST /api/raw, GET /api/rig and GET /api/state is checked here against the code that answers them, and the DMX
// frame the desk would put on the wire (GET /api/dmx) is read back.

const { createDesk } = createRequire(import.meta.url)('../../serverXR/src/lighting/desk.js')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

describe('the command against the real desk code', () => {
    let dir
    let desk
    let server
    let base
    let held
    let entities
    const json = async (route, body) => {
        const res = await fetch(`${base}${route}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        return res.json()
    }
    const wire = async () => { await sleep(120); return (await json('/api/dmx')).dmx[0] }
    const go = (argv) => run([...argv, '--desk', base, '--held-file', held], { say: () => {}, env: { PROJECT: 'demo' }, getEntities: async () => entities })

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-identify-desk-'))
        held = path.join(dir, 'held.json')
        desk = createDesk({ dataDir: path.join(dir, 'data'), offline: true, log: () => {} })
        server = http.createServer((q, r) => desk.handle(q, r))
        await new Promise((r) => server.listen(0, '127.0.0.1', r))
        base = `http://127.0.0.1:${server.address().port}`
        const d = deskOf(RIG_A, [])
        entities = d.entities
        const lamps = RIG_A.map((s) => {
            const type = typeOf(s.type)
            const mode = type.modes.find((m) => m.name === s.mode)
            return { key: `demo:${s.id}`, name: s.name, code: type.code, type: s.type, mode: s.mode, footprint: mode.channels.length, channels: mode.channels, universe: s.u, address: s.a }
        })
        const patched = await json('/api/rig/patch', { project: 'demo', lamps })
        expect(patched.flags || []).toEqual([])
        await json('/api/fixtures/add', { profile: 'dimmer', universe: 0, address: 200 })   // a fixture of no project
        await json('/api/fixtures/add', { profile: 'rgb', universe: 0, address: 210 })      // and a dimmer-less RGB one
    })

    afterAll(async () => {
        desk?.close()
        server?.closeAllConnections?.()
        await new Promise((r) => (server ? server.close(r) : r()))
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('the desk answers the way the command reads it: the project\'s rig, 1-based there and 0-based in the live state', async () => {
        const rig = (await json('/api/rig?project=demo')).fixtures
        expect(rig).toHaveLength(RIG_A.length)
        const par = rig.find((f) => f.key === 'demo:par-d')
        expect(par).toMatchObject({ universe: 1, address: 41, profile: 'UP-PL5403 8ch' })
        const live = (await json('/api/state')).fixtures.find((f) => f.id === par.id)
        expect(live).toMatchObject({ universe: 0, address: 41 })
    })

    it('holds a group: the DMX frame carries each lamp\'s colour, the rest of the universe is dark, another universe is untouched', async () => {
        const before = await wire()
        const u2 = (await json('/api/dmx')).dmx[1]
        await go(['--type', 'up-pl5403', '--universe', '1'])
        const during = await wire()
        // U1 in z order: par-d (41) red, par-b (25) green, par-c (33) blue, par-a (17) yellow — dimmer, r, g, b, w
        expect(during.slice(40, 45)).toEqual([255, 255, 0, 0, 0])
        expect(during.slice(24, 29)).toEqual([255, 0, 255, 0, 0])
        expect(during.slice(32, 37)).toEqual([255, 0, 0, 255, 0])
        expect(during.slice(16, 21)).toEqual([255, 255, 255, 0, 0])
        expect(during[63]).toBe(0)    // the wheel beam's dimmer (57 + 7)
        expect(during[199]).toBe(0)   // another project's dimmer
        expect([209, 210, 211].map((i) => during[i])).toEqual([0, 0, 0])   // and a dimmer-less RGB lamp, dark by its emitters
        expect((await json('/api/dmx')).dmx[1]).toEqual(u2)   // U2 untouched
        expect(Object.keys((await json('/api/state')).raw).every((k) => k.startsWith('0:'))).toBe(true)
        expect(before).toBeTruthy()
    })

    it('a second group replaces the first on the real desk, and --release leaves the desk as it was found', async () => {
        const quiet = (await json('/api/state')).raw
        await go(['--universe', '2'])   // the U2 PAR now; U1\'s holds are given back in the same request
        const state = await json('/api/state')
        expect(Object.keys(state.raw).every((k) => k.startsWith('1:'))).toBe(true)
        expect(Object.keys(state.raw).length).toBeGreaterThan(0)
        await go(['--release'])
        expect((await json('/api/state')).raw).toEqual({})
        expect(fs.existsSync(held)).toBe(false)
        expect(quiet).toBeTruthy()
    })

    it('what the desk already held comes back as it was, not freed', async () => {
        await json('/api/raw', { channels: [{ universe: 0, channel: 200, value: 0 }, { universe: 0, channel: 41, value: 9 }] })   // someone else\'s holds
        await go(['--type', 'up-pl5403', '--universe', '1'])
        expect((await json('/api/state')).raw['0:41']).toBe(255)
        await go(['--release'])
        expect((await json('/api/state')).raw).toEqual({ '0:200': 0, '0:41': 9 })
        await json('/api/raw', { channels: [{ universe: 0, channel: 200, value: -1 }, { universe: 0, channel: 41, value: -1 }] })
        expect((await json('/api/state')).raw).toEqual({})
    })

    it('a lasers\' every channel goes to 0 on the wire, and its rest comes back on release', async () => {
        await go(['--type', 'up-la40wf'])
        const during = await wire()
        expect(during.slice(99, 131)).toEqual(Array(32).fill(0))
        await go(['--release'])
        expect((await json('/api/state')).raw).toEqual({})
    })

    it('a dry run against the real desk changes nothing', async () => {
        const before = JSON.stringify((await json('/api/state')).raw)
        await go(['--universe', '1', '--dry'])
        expect(JSON.stringify((await json('/api/state')).raw)).toBe(before)
        expect(fs.existsSync(held)).toBe(false)
    })
})
