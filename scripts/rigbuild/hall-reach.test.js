// hall-reach.mjs (2026-10-20): the first hall surface along a lamp's rest axis comes from the hall record's dims.shell, the one source
// physics_check.py reads; it no longer copies the walls, the deck and the ridge by hand. The cases: a fixture room (slab stop, the
// deck opening, floor, flush lamps, outside lamps), the refusal of a hall with no shell, and PARITY with physics_check.py: the same
// rays on the real v13 shell through both give the same distance and the same slab.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HALL_FILE, hallDimsOf, hallFirstHit, lampFirstHit, shellOf } from './hall-reach.mjs'

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

describe.skipIf(!hasPython)('parity with physics_check.py on the real shell', () => {
    it('600 deterministic rays from inside, the roof, the floor and outside: same distance and same slab', () => {
        const dims = hallDimsOf(HALL_FILE, repo)
        // a fixed lattice of origins and directions (no random: the run is the same every time)
        const origins = []
        for (const x of [-30, -6, 0, 6.5, 24, 45, 60.4, 70]) for (const y of [0, 1, 7, 12, 13.3, 15, 17]) for (const z of [-60, -5.5, 0, 20, 53.8]) origins.push([x, y, z])
        const dirs = []
        for (let i = 0; i < 12; i += 1) for (const el of [-0.9, 0, 0.6, 1.4]) dirs.push([Math.cos(el) * Math.cos(i * 0.5236 + 0.1), Math.sin(el), Math.cos(el) * Math.sin(i * 0.5236 + 0.1)])
        const rays = []
        for (let k = 0; k < 600; k += 1) rays.push([origins[(k * 7) % origins.length], dirs[(k * 11) % dirs.length]])
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
        let hits = 0
        let floor = 0
        rays.forEach(([p, d], k) => {
            const got = hallFirstHit(p, d, dims)
            const [t, name] = want[k]
            if (t == null) expect(got, `ray ${k}`).toBeNull()
            else { expect(got, `ray ${k}`).toBeCloseTo(t, 9); hits += 1; if (name === 'floor') floor += 1 }
        })
        expect(hits).toBeGreaterThan(300) // the lattice meets something most of the time (it is a test of agreement, not of emptiness)
        expect(floor).toBeGreaterThan(20)
    })
})
