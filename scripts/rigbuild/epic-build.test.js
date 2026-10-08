// epic-build.mjs (2026-10-08): MOXIR v1.0 loaded into a scratch copy as ops. Pure parts only (no server): the rig file's
// units become entities (every laser beam its own narrow spotLight, nothing hazer-like left), each unit is its own named
// look group whose key the schema keeps (<= 40 chars, <= 100 groups per look), the looks name only ash / ember colours,
// the cue list plays every look, and the rotation maths gives the beam direction moxir_v1.py aimed.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RIG_FILE, dirOfRotation, v1Entities, v1Looks, v1Cues, v1Views } from './epic-build.mjs'

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
