// hall-reach.mjs (2026-10-20): the first hall surface along a lamp's rest axis comes from the hall record's dims.shell, the one source
// physics_check.py reads; it no longer copies the walls, the deck and the ridge by hand. The cases: a fixture room (slab stop, the
// deck opening, floor, flush lamps, outside lamps), the refusal of a hall with no shell, and PARITY with physics_check.py: the same
// rays on the real v13 shell through both give the same distance and the same slab.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HALL_FILE, hallDimsOf, hallFirstHit, hallFirstSurface, lampFirstHit, lampFirstSurface, shellOf } from './hall-reach.mjs'
import { reachOf, v1Entities } from './epic-build.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const hasPython = spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0
const slab = (id, surface, x, y, z) => ({ id, surface, x_m: x, y_m: y, z_m: z })
// the same 20 x 20 m room as physics_check_test.py FIXTURE: walls at x, z = +-10, a deck at y 10 with a 4 x 4 m opening, a lantern roof at 14
const FIXTURE = { shell: [
    slab('wall-e', 'long wall', [10, 10.3], [0, 14], [-10.3, 10.3]), slab('wall-w', 'long wall', [-10.3, -10], [0, 14], [-10.3, 10.3]),
    slab('wall-n', 'end wall', [-10.3, 10.3], [0, 14], [10, 10.3]), slab('wall-s', 'end wall', [-10.3, 10.3], [0, 14], [-10.3, -10]),
    slab('deck-1', 'deck', [-10, -2], [10, 10.1], [-10, 10]), slab('deck-2', 'deck', [2, 10], [10, 10.1], [-10, 10]),
    slab('deck-3', 'deck', [-2, 2], [10, 10.1], [2, 10]), slab('deck-4', 'deck', [-2, 2], [10, 10.1], [-10, -2]),
    slab('lantern-roof', 'lantern roof', [-2.3, 2.3], [14, 14.2], [-2.3, 2.3])] }
// the same room with a gate in the north wall: x -1..1, y 0..3 (physics_check_test.py GATED)
const GATED = { shell: [...FIXTURE.shell.filter((m) => m.id !== 'wall-n'),
    slab('wall-n-1', 'end wall', [-10.3, -1], [0, 14], [10, 10.3]), slab('wall-n-2', 'end wall', [1, 10.3], [0, 14], [10, 10.3]),
    slab('wall-n-3', 'end wall', [-1, 1], [3, 14], [10, 10.3])] }
const UP = [0, 1, 0]
const DOWN = [0, -1, 0]
const EAST = [1, 0, 0]

describe('hall-reach.mjs reads dims.shell', () => {
    it('a beam stops at a slab, passes the opening and stops on the lantern roof', () => {
        expect(hallFirstHit([5, 1, 0], UP, FIXTURE)).toBeCloseTo(9, 9)
        expect(hallFirstHit([0, 1, 0], EAST, FIXTURE)).toBeCloseTo(10, 9)
        expect(hallFirstHit([0, 1, 0], UP, FIXTURE)).toBeCloseTo(13, 9)
        expect(hallFirstHit([2.5, 1, 0], UP, FIXTURE)).toBeCloseTo(9, 9)
        expect(hallFirstHit([0, 3, 0], DOWN, FIXTURE)).toBeCloseTo(3, 9)
    })
    it('a lamp flush on a face aimed away does not meet that slab; aimed into it, 0 m; inside a slab, 0 m', () => {
        expect(hallFirstHit([5, 10, 0], DOWN, FIXTURE)).toBeCloseTo(10, 9)
        expect(hallFirstHit([5, 10.1, 0], UP, FIXTURE)).toBeNull()
        expect(hallFirstHit([5, 10, 0], UP, FIXTURE)).toBe(0)
        expect(hallFirstHit([10.1, 5, 0], UP, FIXTURE)).toBe(0)
        expect(hallFirstHit([10, 5, 0], [-1, 0, 0], FIXTURE)).toBeCloseTo(20, 9)
    })
    it('a lamp at floor level aiming down meets the floor at 0 m, never open sky; aiming along it does not', () => {
        expect(hallFirstHit([0, 0, 0], DOWN, FIXTURE)).toBe(0)
        expect(hallFirstHit([0, 5e-7, 0], DOWN, FIXTURE)).toBeLessThan(1e-6)
        expect(hallFirstHit([0, 0, 0], EAST, FIXTURE)).toBeCloseTo(10, 9)
    })
    it('a lamp outside the walls meets the wall it stands behind; open sky is null (the caller falls back to the rig throw)', () => {
        expect(hallFirstHit([-12, 1, 0], EAST, FIXTURE)).toBeCloseTo(1.7, 9)
        expect(hallFirstHit([30, 20, 0], UP, FIXTURE)).toBeNull()
    })
    it('lampFirstHit turns the rest axis (three.js Euler XYZ) into the same cast', () => {
        expect(lampFirstHit({ p: [5, 1, 0], r: [Math.PI, 0, 0] }, FIXTURE)).toBeCloseTo(9, 9)
        expect(lampFirstHit({ p: [0, 9, 0], r: [0, 0, 0] }, FIXTURE)).toBeCloseTo(9, 9)
        expect(lampFirstHit({}, FIXTURE)).toBeNull()
    })
    it('the floor is the hall footprint: a ray out of a gate meets no floor outside the hall, it is open sky through the opening', () => {
        const unit = (v) => { const n = Math.hypot(...v); return v.map((c) => c / n) }
        const s = (p, d) => { const r = hallFirstSurface(p, d, GATED); return [r.t, r.name] }
        expect(s([0, 2, 0], unit([0, -0.1, 1]))).toEqual([Infinity, 'open sky (through wall-n opening)']) // the old plane: floor at z = 20, 20 m outside
        expect(s([0, 1, 0], [0, 0, 1])).toEqual([Infinity, 'open sky (through wall-n opening)'])
        expect(hallFirstHit([0, 2, 0], unit([0, -0.1, 1]), GATED)).toBeNull()
        expect(s([0, 3, 0], unit([0, -1, 1]))[1]).toBe('floor') // lands at z = 3, inside
        expect(s([0, 1, 9], unit([0, -1, 0.5]))[1]).toBe('floor') // z = 9.5, inside
        expect(s([20, 1, 0], DOWN)).toEqual([Infinity, 'none (open sky)']) // a lamp outside aiming at the ground outside
        expect(s([0, 2, 20], unit([0, -0.1, -1]))[1]).toBe('floor') // in at the gate, floor inside
        const noRoof = { shell: GATED.shell.filter((m) => !['deck', 'lantern roof'].includes(m.surface)) }
        expect(hallFirstSurface([0, 1, 0], UP, noRoof).name).toBe('open sky (through the roof)')
    })
    it('REFUSES a hall with no dims.shell and a slab with no extent (no copied planes)', () => {
        for (const dims of [{}, { shell: [] }, { truss_top_h_m: 13.3, ridge_h_m: 16.5, lantern_w_m: 12 }]) {
            expect(() => hallFirstHit([0, 1, 0], UP, dims)).toThrow(/no dims\.shell/)
            expect(() => hallFirstHit([0, 1, 0], UP, dims)).toThrow(/hall_shell\.py/)
        }
        expect(() => shellOf({ shell: [{ id: 'x' }] })).toThrow(/no x_m\/y_m\/z_m/)
    })
    it('the record the room draws has the shell and no hand-planes export is left', async () => {
        const dims = hallDimsOf(HALL_FILE, repo)
        expect(shellOf(dims).length).toBe(65)
        const mod = await import('./hall-reach.mjs')
        expect(mod.HALL_WALLS).toBeUndefined()
        const code = fs.readFileSync(path.join(repo, 'scripts/rigbuild/hall-reach.mjs'), 'utf8').split('\n').filter((l) => !l.startsWith('//')).join('\n')
        expect(code).not.toMatch(/-36\.4|60\.4|53\.8|-53\.6|truss_top_h_m|ridge_h_m|lantern_w_m|westX|eastX|entryZ|backZ/)   // no hand-copied plane or dims height is left
    })
})

describe('epic-build reachOf: a first hit of 0 m is a result, never the type\'s throw', () => {
    const inSlab = { type: 'up-b380f', p: [-5, 10.05, 0], r: [0, 0, 0], throw_m: 30 } // inside deck-1 (y 10..10.1)
    const onFloor = { type: 'up-b380f', p: [0, 0, 0], r: [0, 0, 0], throw_m: 30 } // at floor level aiming down
    const fine = { type: 'up-b380f', p: [5, 1, 0], r: [Math.PI, 0, 0], throw_m: 30 } // under the deck, 9 m
    it('reachOf is 0 for a lamp in a slab and for a lamp on the floor aiming down (it was 30 m: throw_m, or the type\'s 40 m)', () => {
        expect(reachOf(inSlab, FIXTURE)).toBe(0)
        expect(reachOf(onFloor, FIXTURE)).toBe(0)
        expect(reachOf({ ...inSlab, throw_m: null }, FIXTURE)).toBe(0)
        expect(reachOf({ ...onFloor, throw_m: undefined }, FIXTURE)).toBe(0)
        expect(reachOf(fine, FIXTURE)).toBeCloseTo(9, 3)
    })
    it('lampFirstSurface says why: inside_slab with the slab, or on_floor', () => {
        expect(lampFirstSurface(inSlab, FIXTURE)).toMatchObject({ t: 0, why: 'inside_slab' })
        expect(lampFirstSurface(inSlab, FIXTURE).name).toContain('deck-1')
        expect(lampFirstSurface(onFloor, FIXTURE)).toMatchObject({ t: 0, name: 'floor', why: 'on_floor' })
        expect(lampFirstSurface(fine, FIXTURE).why).toBeUndefined()
    })
    const rigOf = (...lamps) => ({ solids: [], fixtures: lamps.map((l, i) => ({ id: `lamp-${i}`, part: 'wash', status: 'new', colour: '#ffffff', angle_rad: 0.2, circuit: '', ...l })) })
    it('v1Entities writes no beam length for such a lamp (it draws none), reports it, and writes the others as before', () => {
        const report = []
        const ents = v1Entities(rigOf(inSlab, onFloor, fine), { hall: FIXTURE, report })
        const beam = (i) => ents.find((e) => e.id === `lamp-${i}`).components.beam
        expect(beam(0)).toMatchObject({ visible: false }); expect(beam(0).length).toBeUndefined()
        expect(beam(1)).toMatchObject({ visible: false }); expect(beam(1).length).toBeUndefined()
        expect(beam(2)).toMatchObject({ visible: true }); expect(beam(2).length).toBeCloseTo(9, 3)
        expect(report).toEqual([{ id: 'lamp-0', why: 'inside_slab', surface: expect.stringContaining('deck-1') }, { id: 'lamp-1', why: 'on_floor', surface: 'floor' }])
    })
})

describe.skipIf(!hasPython)('parity with physics_check.py on the real shell', () => {
    it('600 distinct rays from all 280 origins: same distance, same surface (slab id / label)', () => {
        const dims = hallDimsOf(HALL_FILE, repo)
        // a fixed lattice of origins and directions (no random: the run is the same every time); a ray k is origin k mod 280, direction k * 11 + k div 280 (mod 48)
        const origins = []
        for (const x of [-30, -6, 0, 6.5, 24, 45, 60.4, 70]) for (const y of [0, 1, 7, 12, 13.3, 15, 17]) for (const z of [-60, -5.5, 0, 20, 53.8]) origins.push([x, y, z])
        const dirs = []
        for (let i = 0; i < 12; i += 1) for (const el of [-0.9, 0, 0.6, 1.4]) dirs.push([Math.cos(el) * Math.cos(i * 0.5236 + 0.1), Math.sin(el), Math.cos(el) * Math.sin(i * 0.5236 + 0.1)])
        const rays = []
        for (let k = 0; k < 600; k += 1) rays.push([origins[k % origins.length], dirs[(k * 11 + Math.floor(k / origins.length)) % dirs.length]])
        expect(origins.length).toBe(280)
        expect(new Set(rays.map((r) => JSON.stringify(r))).size).toBe(600) // 600 rays, all different
        expect(new Set(rays.map((r) => JSON.stringify(r[0]))).size).toBe(280) // from every origin
        const py = `
import importlib.util, json, math, sys
spec = importlib.util.spec_from_file_location('pc', sys.argv[1]); pc = importlib.util.module_from_spec(spec); spec.loader.exec_module(pc)
shell = pc.shell_of(json.load(open(sys.argv[2]))['dims'])
out = []
for p, d in json.load(sys.stdin):
    L, name = pc.first_surface(p, d, shell)
    out.append([None if math.isinf(L) else L, name])
print(json.dumps(out))`
        const r = spawnSync('python3', ['-I', '-c', py, path.join(repo, 'scripts/place/physics_check.py'), path.join(repo, HALL_FILE)], { input: JSON.stringify(rays), encoding: 'utf8' })
        expect(r.status, r.stderr).toBe(0)
        const want = JSON.parse(r.stdout)
        const kinds = { slab: 0, floor: 0, sky: 0, through: 0 }
        rays.forEach(([p, d], k) => {
            const got = hallFirstSurface(p, d, dims)
            const [t, name] = want[k]
            expect(got.name, `ray ${k}`).toBe(name) // the slab id and label, the floor, or the open-sky words: equal
            if (t == null) { expect(got.t, `ray ${k}`).toBe(Infinity); expect(hallFirstHit(p, d, dims), `ray ${k}`).toBeNull(); kinds.sky += 1; if (name.includes('through')) kinds.through += 1 }
            else { expect(got.t, `ray ${k}`).toBeCloseTo(t, 9); expect(hallFirstHit(p, d, dims), `ray ${k}`).toBeCloseTo(t, 9); if (name === 'floor') kinds.floor += 1; else kinds.slab += 1 }
        })
        // the lattice meets every kind of end (it is a test of agreement, not of emptiness); the floor is bounded to the footprint, so some rays are open sky
        expect(kinds.slab).toBeGreaterThan(150)
        expect(kinds.floor).toBeGreaterThan(20)
        expect(kinds.sky).toBeGreaterThan(20)
    })
})
