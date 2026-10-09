// epic-build.mjs (2026-10-08): MOXIR v1.0 loaded into a scratch copy as ops. Pure parts only (no server): the rig file's
// units become entities (every laser beam its own narrow spotLight, nothing hazer-like left), each unit is its own named
// look group whose key the schema keeps (<= 40 chars, <= 100 groups per look), the looks name only ash / ember colours,
// the cue list plays every look, and the rotation maths gives the beam direction moxir_v1.py aimed.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RIG_FILE, dirOfRotation, v1Entities, v1Looks, v1Cues, v1Views, v1RenderOps } from './epic-build.mjs'

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
