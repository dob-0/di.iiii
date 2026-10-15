// epic-build.mjs (2026-10-08): MOXIR v1.0 loaded into a scratch copy as ops. Pure parts only (no server): the rig file's
// units become entities (every laser beam its own narrow spotLight, nothing hazer-like left), each unit is its own named
// look group whose key the schema keeps (<= 40 chars, <= 100 groups per look), the looks name only ash / ember colours,
// the cue list plays every look, and the rotation maths gives the beam direction moxir_v1.py aimed.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isSteelEntity } from '../../src/objectComponents/steelOccluder.js'
import { RIG_FILE, isSteelSolid, steelTagOps, dirOfRotation, v1Entities, v1Looks, restAim, v1Cues, v1Views, v1RenderOps, dmxOf, patchOps } from './epic-build.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const rig = JSON.parse(fs.readFileSync(path.join(repo, RIG_FILE), 'utf8'))
const ctx = { axis: 0.13, stage: { front: 24.5, into: 1 } }

describe('epic-build: MOXIR v1.0 as entities, looks and cues', () => {
    const ents = v1Entities(rig)
    const looks = v1Looks(rig, ents, ctx)

    it('makes 12 laser beams, each a narrow spotLight from its cube to the ash wall', () => {
        const lasers = ents.filter((e) => e.id.startsWith('rig-laser-'))
        expect(lasers.length).toBe(12)
        for (const e of lasers) {
            expect(e.components.light.angle).toBeLessThanOrEqual(0.0105)
            expect(e.components.fixture.dmx).toBe(false)
            const d = dirOfRotation(e.components.transform.rotation)
            const p = e.components.transform.position
            const end = p.map((v, i) => v + d[i] * e.components.light.distance)
            expect(end[2]).toBeGreaterThan(19.9)
            expect(end[2]).toBeLessThan(20.3)
        }
    })

    it('keeps every look inside the schema: <= 100 groups, keys <= 40 chars, 0..1 levels, ash/ember colours', () => {
        const ok = new Set(['#e8e4dc', '#9c978d', '#ff3a12', '#a3200c'])
        expect(looks.looks.length).toBeGreaterThan(5)
        for (const l of looks.looks) {
            expect(Object.keys(l.aims).length).toBeLessThanOrEqual(100)
            for (const k of Object.keys(l.aims)) expect(k).toMatch(/^[\w:.-]{1,40}\/[\w.-]{1,40}$/)
            for (const [k, v] of Object.entries(l.levels)) {
                expect(v).toBeGreaterThanOrEqual(0)
                expect(v).toBeLessThanOrEqual(1)
                if (v > 0) expect(ok.has(l.colours[k]), `${l.id} ${k} ${l.colours[k]}`).toBe(true)
            }
        }
        const black = looks.looks.find((l) => l.id === 'black')
        expect(Object.values(black.levels).every((v) => v === 0)).toBe(true)
    })

    it('plays every look from the cue list and aims the four views', () => {
        const ids = new Set(looks.looks.map((l) => `rig-${l.id}`))
        for (const c of v1Cues()) expect(ids.has(c.lightLook), c.lightLook).toBe(true)
        expect(v1Views().viewPresets.map((v) => v.id)).toEqual(['floor', 'foh', 'dj', 'top'])
    })

    it('turns a rotation into the beam direction (three.js XYZ, the spot points -Y)', () => {
        const d = dirOfRotation([Math.PI, 0, 0])
        expect(d[1]).toBeCloseTo(1, 6)
        const e = dirOfRotation([0, 0, 0])
        expect(e[1]).toBeCloseTo(-1, 6)
    })
})

// MOXIR v2 true look (2026-10-09): the rooms epic-build makes follow the physics branch — no cutoff, the smoke machine
// blows where its rig file turns it, and a rig file's own atmosphere (the one machine's two-zone haze) is what the room draws.
describe('epic-build: no cutoff, the fan direction and the rig\'s own air', () => {
    const v2 = {
        fixtures: [
            { id: 'rig-beam-x-01', type: 'up-b380f', part: 'plane 1', status: 'used', p: [-8.5, 0.7, -5], r: [-2.9, 0, -0.75], colour: '#ff3a12', angle_rad: 0.0157, throw_m: 17.864 },
            { id: 'rig-smoke-x', type: 'up-yz31p', position: 'on a 1 m case', p: [-4.75, 1, -6.5], r: [0, Math.PI, 0], angle_rad: null }
        ],
        solids: []
    }
    const ents = v1Entities(v2)
    it('a lamp has distance 0 (inverse square only) and its drawn beam its own length, the cast throw', () => {
        const lamp = ents.find((e) => e.id === 'rig-beam-x-01')
        expect(lamp.components.light.distance).toBe(0)
        expect(lamp.components.beam.length).toBe(17.864)
    })
    it('the smoke machine keeps the rig file\'s rotation (its fan direction)', () => {
        expect(ents.find((e) => e.id === 'rig-smoke-x').components.transform.rotation).toEqual([0, Math.PI, 0])
        const old = v1Entities({ fixtures: [{ ...v2.fixtures[1], r: undefined }], solids: [] })
        expect(old[0].components.transform.rotation).toEqual([0, 0, 0])
    })
    it('draws the rig\'s own atmosphere when it states one, else v1.0\'s uniform sigma', () => {
        const atmosphere = { anisotropy: 0.74, anisotropyWhy: 'a note', haze: { model: 'nf-ff', volume_m3: 186890, dries: false } }
        const own = v1RenderOps({ atmosphere })[0].payload.patch.atmosphere
        expect(own).toEqual({ anisotropy: 0.74, haze: { model: 'nf-ff', volume_m3: 186890, dries: false } })
        expect(v1RenderOps()[0].payload.patch.atmosphere).toEqual({ scattering: 0.0169, anisotropy: 0.7, haze: null })
    })
})

describe('epic-build: a solid an earlier rig file laid is not left behind (MOXIR v2 cranes, 2026-10-10)', () => {
    it('takes out the #844 laser bar and the far-crane boxes (and every rig lamp), keeps the hall, the truss and the riser', async () => {
        const { oldEntities } = await import('./epic-build.mjs')
        const doc = { entities: [{ id: 'place-hall', type: 'model' }, { id: 'rig-line-1', type: 'model' }, { id: 'rig-deck-1', type: 'model' }, { id: 'rig-crowd-barrier', type: 'box' },
            { id: 'rig-crane-bar', type: 'box' }, { id: 'rig-far-crane-z-12-girder-a', type: 'box' }, { id: 'rig-par-cut-01', type: 'spotLight' }, { id: 'rig-hoist-1', type: 'box' }] }
        expect(oldEntities(doc).map((e) => e.id).sort()).toEqual(['rig-crane-bar', 'rig-far-crane-z-12-girder-a', 'rig-par-cut-01'])
    })
})

describe('epic-build: a moving look keeps its motion on the way to the project (MOXIR v2.9 scenes, 2026-10-13)', () => {
    it('carries `motion` from the rig file through v1Looks and the schema; a still look stays still', async () => {
        const { normalizeRigLooks } = await import('../../src/shared/projectSchema.js')
        const file = 'scripts/place/rigs/moxir-v2-8-matrix-2026-10-13.json'
        const v28 = JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'))
        const out = normalizeRigLooks(v1Looks(v28, v1Entities(v28), ctx, file))
        const byId = new Map(out.looks.map((l) => [l.id, l]))
        expect(byId.get('run').motion).toEqual({ mode: 'chase', bpm: 128, depth: 255, spatial: 'y-', kinds: ['up-b380f'], still: 0.35 })
        expect(byId.get('lasers-breathe').motion.kinds).toEqual(['ext-lc-ultra-mk2', 'up-la40wf'])
        expect(byId.get('flash').motion.mode).toBe('strobe')
        expect(byId.get('ice-fire').motion).toBeUndefined()
        expect(byId.get('tent').motion).toBeUndefined()
        expect(out.looks.filter((l) => l.motion).map((l) => l.id)).toEqual(['red-wave', 'embers', 'ice-rings', 'run', 'left-right', 'flash', 'lasers-breathe'])
    })
})

describe('epic-build: every laser beam a line source from the maker\'s diodes (MOXIR v2.9, ledger N559, 2026-10-13)', () => {
    const file = 'scripts/place/rigs/moxir-v2-8-matrix-2026-10-13.json'
    const v28 = JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'))
    const beams = v1Entities(v28).filter((e) => e.id.startsWith('rig-laser-'))
    const unitOf = (e) => v28.fixtures.find((f) => (f.laser?.beams || []).some((b) => `rig-laser-${b.id}` === e.id))
    const beamOf = (e) => unitOf(e).laser.beams.find((b) => `rig-laser-${b.id}` === e.id)

    it('gives each of the 38 beams a beam.laser the renderer draws: the cube\'s lumens x duty / 6 per line, within 1 %', async () => {
        const { laserOf, laserColourFlux, CUBE_NM } = await import('../../src/objectComponents/laserLine.js')
        const { cubeVariant } = await import('./epic-build.mjs')
        expect(beams.length).toBe(38)
        const cube = cubeVariant()
        const cubeLm = laserColourFlux({ mW: CUBE_NM.map((nm) => cube[`${nm}nm`]) }).lumens
        expect(cubeLm).toBeGreaterThan(1405)                           // 7.5 W at full white: 131 + 1084 + 196 = 1410 lm (fixtures.json)
        expect(cubeLm).toBeLessThan(1415)
        const la40Lm = laserColourFlux({ mW: [16000, 15000, 10000] }).lumens
        let cubes = 0
        for (const e of beams) {
            const l = laserOf(e.components.beam)
            expect(l).not.toBe(null)
            expect(l.frame).toBe(null)                                  // one static line down the entity's -Y
            expect(l.nm).toEqual([455, 525, 638])
            expect(l.sceneScale).toBe(0.02)                             // the rig's one exposure number, as every lamp
            const f = unitOf(e)
            const duty = beamOf(e).duty ?? f.laser.duty ?? 0.45
            const lm = laserColourFlux({ mW: l.mW, nm: l.nm }).lumens
            if (f.type === 'ext-lc-ultra-mk2') {
                cubes += 1
                expect(f.laser.beams.filter((b) => !b.off).length).toBe(6)
                expect(Math.abs(lm / ((cubeLm * duty) / 6) - 1)).toBeLessThan(0.01)
                expect(l).toMatchObject({ diameter_mm: 4, divergence_mrad: 1 })      // Guide v1.2 pp. 11-12
            } else {
                expect(f.type).toBe('up-la40wf')
                expect(Math.abs(lm / la40Lm - 1)).toBeLessThan(0.01)                 // one beam, duty 1: the whole 40 W
                expect(e.components.beam.laser.diameter_mm).toBeUndefined()          // none published: laserOf's 4 mm default
                expect(l.divergence_mrad).toBe(1.3)                                  // Blue Sea BLLO-RGB40 '< 1.3 mrad'
            }
        }
        expect(cubes).toBe(36)
    })

    it('--laser-lines-only sends one merge patch { laser } on `beam` per beam the project has, and the schema keeps it', async () => {
        const { laserOf } = await import('../../src/objectComponents/laserLine.js')
        const { laserLineOps } = await import('./epic-build.mjs')
        const { applyProjectOps, normalizeProjectDocument } = await import('../../src/shared/projectSchema.js')
        // the live v2-9 shape: the beams without beam.laser, a hand-moved lamp, a hand-set haze on one beam
        const strip = (e) => ({ ...e, components: { ...e.components, beam: { visible: true, haze: 1, aperture: 0.002 } } })
        const lamp = { id: 'rig-par-planes-12', type: 'spotLight', components: { transform: { position: [25.55, 0.264, -10.94], rotation: [0, 0, 0], scale: [1, 1, 1] }, light: { color: '#ff3a12', intensity: 5 } } }
        const ents = [...beams.map(strip), lamp]
        ents[0] = { ...ents[0], components: { ...ents[0].components, beam: { ...ents[0].components.beam, haze: 0.6 } } }
        const doc = normalizeProjectDocument({ entities: ents })
        const { ops, unmatched, absent } = laserLineOps(doc, v28)
        expect(unmatched).toEqual([])
        expect(absent).toEqual([])
        expect(ops.length).toBe(38)
        for (const op of ops) {
            expect(op.type).toBe('updateComponent')
            expect(op.payload.component).toBe('beam')
            expect(Object.keys(op.payload.patch)).toEqual(['laser'])
            expect(op.payload.entityId.startsWith('rig-laser-')).toBe(true)
        }
        const after = applyProjectOps(doc, ops)
        expect(after.entities.length).toBe(doc.entities.length)
        const was = new Map(doc.entities.map((e) => [e.id, e]))
        for (const e of after.entities) {
            if (!e.id.startsWith('rig-laser-')) { expect(e).toEqual(was.get(e.id)); continue }
            expect(laserOf(e.components.beam)).not.toBe(null)
            const { laser, ...rest } = e.components.beam
            expect(laser.mW.length).toBe(3)
            expect(rest).toEqual(was.get(e.id).components.beam)                 // visible, haze (the hand-set 0.6 too), aperture kept
            expect({ ...e, components: { ...e.components, beam: rest } }).toEqual(was.get(e.id))
        }
        // a beam the rig file does not know is reported, and the tool then writes nothing
        const extra = normalizeProjectDocument({ entities: [...ents, { ...strip(beams[0]), id: 'rig-laser-zz-hand' }] })
        expect(laserLineOps(extra, v28).unmatched).toEqual(['rig-laser-zz-hand'])
    })
})

describe('epic-build: the laser colour rule reaches the looks (MOXIR v2.9, ledger N559, 2026-10-13)', () => {
    it('lasers / matrix / storm / lasers-breathe: every line green; peak, white and every other lamp exactly as before', () => {
        const file = 'scripts/place/rigs/moxir-v2-8-matrix-2026-10-13.json'
        const v28 = JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'))
        const ents = v1Entities(v28)
        const now = new Map(v1Looks(v28, ents, ctx, file).looks.map((l) => [l.id, l]))
        // the same rig with the rule taken out: what v1Looks gave before (each cube its own colour)
        const bare = { ...v28, looks: v28.looks.map(({ laser_colour: _drop, ...l }) => l) }
        const was = new Map(v1Looks(bare, ents, ctx, file).looks.map((l) => [l.id, l]))
        const isLaser = (k) => k.startsWith('named-v1-laser-')
        expect([...now.values()].filter((l) => v28.looks.find((r) => r.id === l.id)?.laser_colour).map((l) => l.id)).toEqual(['lasers', 'matrix', 'storm', 'lasers-breathe'])
        for (const [id, l] of now) {
            const lasers = Object.keys(l.colours).filter(isLaser)
            expect(lasers.length).toBe(38)
            const green = ['lasers', 'matrix', 'storm', 'lasers-breathe'].includes(id)
            for (const k of Object.keys(l.colours)) expect(l.colours[k]).toBe(green && isLaser(k) ? '#00ff00' : was.get(id).colours[k])
            expect(l.levels).toEqual(was.get(id).levels)
            expect(l.aims).toEqual(was.get(id).aims)
        }
        // peak and white keep each cube's own colour: 26 ash lines (cubes 1-3, 6 and the 40 W pair), 12 ember (cubes 4, 5)
        const own = Object.entries(now.get('peak').colours).filter(([k]) => isLaser(k)).map(([, c]) => c)
        expect(own.filter((c) => c === '#e8e4dc').length).toBe(26)
        expect(own.filter((c) => c === '#ff3a12').length).toBe(12)
    })
})

describe('epic-build: solid steel stops a beam (2026-10-14)', () => {
    const solids = [
        { id: 'rig-far-crane-z-12-girder-a', kind: 'box' }, { id: 'rig-crane-bar', kind: 'box' }, { id: 'rig-hoist-1-steel', kind: 'box' },
        { id: 'rig-tower-cube6', kind: 'tower' }, { id: 'rig-line-1', kind: 'truss-3m' }, { id: 'x', kind: 'box', steel: true },
        { id: 'rig-pa-l', kind: 'box' }, { id: 'rig-deck-1', kind: 'deck-2x1' }, { id: 'rig-crowd-barrier', kind: 'box' }, { id: 'rig-hoist-1-chain', kind: 'box' }
    ]
    it('what counts as steel: by kind, flag or structural word; a speaker, deck, barrier and chain are not', () => {
        expect(solids.filter(isSteelSolid).map((s) => s.id)).toEqual(['rig-far-crane-z-12-girder-a', 'rig-crane-bar', 'rig-hoist-1-steel', 'rig-tower-cube6', 'rig-line-1', 'x'])
    })
    it('a new build flags its steel boxes and only those', () => {
        const rig = { fixtures: [], solids: solids.map((s) => ({ ...s, p: [0, 0, 0], s: [1, 1, 1], name: s.id })) }
        const out = v1Entities(rig)
        const flagged = out.filter(isSteelEntity).map((e) => e.id)
        expect(flagged).toEqual(['rig-far-crane-z-12-girder-a', 'rig-crane-bar', 'rig-hoist-1-steel', 'rig-tower-cube6', 'rig-line-1', 'x'])
    })
    it('--tag-steel-only: updateComponent on existing, unflagged steel only; nothing created or deleted', () => {
        const rig = { solids }
        const doc = { entities: [
            { id: 'rig-crane-bar', components: {} }, { id: 'rig-far-crane-z-12-girder-a', components: { occluder: { kind: 'steel' } } },
            { id: 'rig-pa-l', components: {} }, { id: 'rig-line-1', components: { piece: { kind: 'truss-3m' } } }
        ] }
        const { ops, already, absent } = steelTagOps(doc, rig)
        expect(ops).toEqual([{ type: 'updateComponent', payload: { entityId: 'rig-crane-bar', component: 'occluder', patch: { kind: 'steel' } } }])
        expect(already.sort()).toEqual(['rig-far-crane-z-12-girder-a', 'rig-line-1'])
        expect(absent).toEqual(['rig-hoist-1-steel', 'rig-tower-cube6', 'x'])
    })
    it('the real rig file: every flagged solid is structural', () => {
        const rig = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../..', RIG_FILE), 'utf8'))
        const ids = (rig.solids || []).filter(isSteelSolid).map((s) => s.id)
        expect(ids.every((id) => !/-pa-|barrier|foh|deck|shell|out-|ash-wall|dj-table/.test(id))).toBe(true)
    })
})

describe('the rig file\'s planned addresses (2026-10-15, laser-40w N852)', () => {
    const rig = { fixtures: [
        { id: 'l1', type: 'up-la40wf', p: [0, 6, 50], dmx: { universe: 1, address: 401, footprint: 32, mode: '32ch' }, laser: { colour: 'ash white', beams: [{ id: '41', r: [1.62, 0, 0], length_m: 60 }] } },
        { id: 'cube', type: 'ext-lc-ultra-mk2', p: [0, 8, -40], laser: { beams: [{ id: '1a', r: [1.6, 0, 0], length_m: 60 }] } },
        { id: 'smoke', type: 'up-yz31p', p: [0, 0, -30], dmx: { universe: 1, address: 501, footprint: 1, mode: '1ch' } }
    ] }
    it('a laser or smoke unit with a dmx block is on DMX at its address; a LaserCube stays off DMX', () => {
        expect(dmxOf(rig.fixtures[0])).toEqual({ universe: 1, address: 401, mode: '32ch' })
        expect(dmxOf(rig.fixtures[1])).toEqual({ dmx: false })
        expect(dmxOf(rig.fixtures[2])).toEqual({ universe: 1, address: 501, mode: '1ch' })
    })
    it('--patch-only: fixture ops only where the document differs, putting off-DMX units on DMX', () => {
        const doc = { entities: [
            { id: 'rig-laser-41', components: { fixture: { type: 'up-la40wf', dmx: false } } },
            { id: 'rig-laser-1a', components: { fixture: { type: 'ext-lc-ultra-mk2', dmx: false } } },
            { id: 'smoke', components: { fixture: { type: 'up-yz31p', universe: 1, address: 501, mode: '1ch' } } }
        ] }
        const { ops, absent } = patchOps(doc, rig)
        expect(absent).toEqual([])
        expect(ops).toEqual([{ type: 'updateComponent', payload: { entityId: 'rig-laser-41', component: 'fixture', patch: { universe: 1, address: 401, mode: '32ch', dmx: null } } }])
    })
})

describe('restAim (the scenes rest_aims, 2026-10-15)', () => {
    it('keeps the own hang of the lamp with no rest, and gives a shared group the fan the design chose', () => {
        expect(restAim(0, null)).toEqual({ rule: 'vertical', in_deg: 0 })
        expect(restAim(0, { lean_deg: -24 })).toEqual({ rule: 'vertical', in_deg: 0, lean_deg: -24 })
        expect(restAim(0, { in_deg: 30 })).toEqual({ rule: 'vertical', in_deg: 30 })
    })
})
