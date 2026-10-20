// laser_frames.py (2026-10-15): a show's per-scene laser design compiled into the cube lines' frames. The test builds a small
// synthetic rig (two cubes, two lines each, on a girder at 8.8 m looking along +z) and holds what the report claims: a valid
// design writes 256 frames a line over the loop and passes; a fan into the lantern band, a level over the 0.16 cap, hits
// over 3 a second and a ray past the cube's field each FAIL; the field point is the exact inverse of fieldDirection.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import json'], { encoding: 'utf8' }).status === 0

const R = [-1.5795, 0, 0]   // three.js Euler XYZ: local -Y to +z, 0.5 deg up
const rig = {
    fixtures: [-2, 2].map((x, i) => ({
        id: `cube-${i + 1}`, type: 'ext-lc-ultra-mk2', p: [x, 8.8, -40],
        laser: { beams: [{ id: `${i + 1}a`, r: [R[0], 0, -0.01] }, { id: `${i + 1}b`, r: [R[0], 0, 0.01] }] }
    }))
}
// the hall record's dims (heights for the column lines) and its dims.shell (laser_frames.py reads the surfaces from it, 2026-10-20): a deck at 13.3
// with the lantern opening |x| <= 6 and a lantern roof at 16.4 over it, glazed lantern sides, long walls at x -36.4 / 60.4 and end walls at z +-53.8
const slab = (id, surface, x, y, z) => ({ id, surface, x_m: x, y_m: y, z_m: z })
const shell = [
    slab('deck-up-1', 'deck (deck)', [-36.4, -6], [13.35, 13.5], [-53.8, 53.8]), slab('deck-up-2', 'deck (deck)', [6, 60.4], [13.35, 13.5], [-53.8, 53.8]),
    slab('lantern-up-1', 'lantern roof', [-6.1, 6.1], [16.4, 16.5], [-53.8, 53.8]),
    slab('lantern-west-1', 'lantern glazing', [-6.1, -5.9], [13.5, 16.4], [-53.8, 53.8]), slab('lantern-east-1', 'lantern glazing', [5.9, 6.1], [13.5, 16.4], [-53.8, 53.8]),
    slab('long-wall-west-1', 'long wall (block)', [-36.6, -36.4], [0, 13.5], [-53.8, 53.8]), slab('long-wall-east-1', 'long wall (block)', [60.4, 60.6], [0, 13.5], [-53.8, 53.8]),
    slab('end-wall-entry-1', 'end wall (block)', [-36.6, 60.6], [0, 13.5], [53.8, 54.0]), slab('end-wall-far-1', 'end wall (block)', [-36.6, 60.6], [0, 13.5], [-54.0, -53.8])
]
const hall = { dims: { span_m: 24, truss_bottom_h_m: 10.8, truss_top_h_m: 13.3, ridge_h_m: 16.5, lantern_w_m: 12, shell } }
const base = { cubes: 'all', colour: '#00ff00', level: 0.16, tempo: { clock: 'master', bpm: 120, beats: 8 }, phase: 'mirror', pitch_deg: 0, yaw_deg: 0, spread_deg: 0, amplitude_deg: 0, breathe: null, hits: null }
const scenes = (laser) => ({ scenes: [{ id: 'a', cue: { fade_s: 2, hold_s: 30 }, laser }, { id: 'b', cue: { fade_s: 2, hold_s: 30 }, laser: null }] })

const run = (laser, extra = []) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-frames-'))
    const f = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p }
    const out = path.join(dir, 'out.json')
    const r = spawnSync('python3', ['-I', path.join(here, 'laser_frames.py'), '--scenes', f('s.json', scenes(laser)), '--rig', f('r.json', rig),
        '--hall', f('h.json', hall), '--out', out, ...extra], { encoding: 'utf8' })
    const summary = JSON.parse(r.stdout)
    const written = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null
    fs.rmSync(dir, { recursive: true, force: true })
    return { status: r.status, summary, written }
}

describe.skipIf(!hasPython)('laser_frames.py', () => {
    it('compiles a valid up-fan into 256 frames a line over the loop, every ray on the roof deck', () => {
        const { status, summary, written } = run({ ...base, pattern: 'fan-sweep', pitch_deg: 4, yaw_deg: 9, spread_deg: 2, amplitude_deg: 1.5 })
        expect(status).toBe(0)
        expect(summary.ok).toBe(true)
        expect(summary.loop_s).toBe(60)            // showClock.js: a cue lasts its hold
        const beam = written.fixtures[0].laser.beams[0]
        expect(beam.frames.period).toBe(60)
        expect(beam.frames.list).toHaveLength(256)
        expect(beam.frames.list.flat().every((p) => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1)).toBe(true)
        expect(beam.frames.list[200]).toEqual([[0, 0, 0, 0, 0]])   // scene b is dark
    })
    it('fails a fan that lands in the lantern band (light leaving through the glazing) and writes nothing', () => {
        const { status, summary, written } = run({ ...base, pattern: 'fan', pitch_deg: 8, yaw_deg: 0, spread_deg: 2 })
        expect(status).toBe(1)
        expect(JSON.stringify(summary.fails)).toContain('lantern glazing')
        expect(written).toBe(null)
    })
    it('refuses a level over the 0.16 cap, hits over 3 a second and a ray past the field', () => {
        expect(run({ ...base, pattern: 'comb', level: 0.2 }).summary.schema_errors.join()).toContain('level')
        expect(JSON.stringify(run({ ...base, pattern: 'comb', tempo: { clock: 'master', bpm: 132, beats: 4 }, hits: { per_beat: 2, duty: 0.5 } }).summary.fails)).toContain('flashes/s')
        expect(JSON.stringify(run({ ...base, pattern: 'fan', pitch_deg: 4, yaw_deg: 22, spread_deg: 2 }).summary.fails)).toContain('field')
    })
    it('blanks the move between the poses of a sheet: every lit segment joins two points of one pose', async () => {
        const { scanLines } = await import('../../src/objectComponents/laserLine.js')
        const { status, written } = run({ ...base, pattern: 'sky', phase: 'unison', pitch_deg: 4, yaw_deg: 9, spread_deg: 3, amplitude_deg: 0.75, tempo: { clock: 'master', bpm: 33, beats: 16 } })
        expect(status).toBe(0)
        const frames = written.fixtures[0].laser.beams[0].frames.list.filter((f) => f.length > 5)
        expect(frames.length).toBeGreaterThan(0)
        for (const f of frames) {
            // a pose = a blank point then its lit points; the blank sits on the pose's first point (no lit jump into it)
            const starts = f.flatMap((p, i) => (p[2] === 0 ? [i] : []))
            expect(starts[0]).toBe(0)
            for (const i of starts) expect(f[i + 1].slice(0, 2)).toEqual(f[i].slice(0, 2))
            // the room's reading: no lit sub-ray wider than one pose's own segments (a lit retrace would span the sheet)
            const lit = scanLines(f, { fieldHalfDeg: 18.5 })
            expect(lit.length).toBeGreaterThan(0)
            for (let i = 0; i < f.length; i += 1) {
                const a = f[i]; const b = f[(i + 1) % f.length]
                if (b[2] > 0 && a[2] > 0) expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(0.2)
            }
        }
    })
    it('inverts fieldDirection exactly', () => {
        const code = 'import importlib.util as u,sys;s=u.spec_from_file_location("m",sys.argv[1]);m=u.module_from_spec(s);s.loader.exec_module(m)\n' +
            'r=[-1.5795,0.02,-0.03];w=m.world_of_field(0.31,-0.12,r,18.5);x,y=m.field_point(w,r,18.5);print(abs(x-0.31)+abs(y+0.12))'
        const r = spawnSync('python3', ['-I', '-c', code, path.join(here, 'laser_frames.py')], { encoding: 'utf8' })
        expect(Number(r.stdout)).toBeLessThan(1e-9)
    })
})

// The single-beam DMX lasers (2026-10-15, laser-40w N852): a scene's `laser_lines` drives the UP-LA40WF units' one beam each.
const lineRig = {
    fixtures: [...rig.fixtures, ...[-4, 4].map((x, i) => ({
        id: `line-${i + 1}`, type: 'up-la40wf', p: [x, 6.4, 50],
        laser: { beams: [{ id: `4${i + 1}`, r: [1.62, 0, x < 0 ? 0.03 : -0.03] }] }
    }))]
}
const lineBase = { units: 'all', colour: '#ffffff', level: 0.1, tempo: { clock: 'master', bpm: 66, beats: 8 }, phase: 'mirror', amplitude_deg: 0, breathe: null, hits: null }
const runLines = (lines, laser = null) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-lines-'))
    const f = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p }
    const out = path.join(dir, 'out.json')
    const sc = { scenes: [{ id: 'a', cue: { fade_s: 2, hold_s: 30 }, laser: laser || { ...base, pattern: 'comb' }, laser_lines: lines }, { id: 'b', cue: { fade_s: 2, hold_s: 30 }, laser: null, laser_lines: null }] }
    const r = spawnSync('python3', ['-I', path.join(here, 'laser_frames.py'), '--scenes', f('s.json', sc), '--rig', f('r.json', lineRig),
        '--hall', f('h.json', hall), '--out', out], { encoding: 'utf8' })
    const summary = JSON.parse(r.stdout)
    const written = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null
    fs.rmSync(dir, { recursive: true, force: true })
    return { status: r.status, summary, written }
}

describe.skipIf(!hasPython)('laser_frames.py: laser_lines (single-beam DMX lasers)', () => {
    it('a still X and a sweep compile into 256 frames on each 40 W beam; the cubes keep theirs', () => {
        for (const lines of [{ ...lineBase, pattern: 'still' }, { ...lineBase, pattern: 'sweep', amplitude_deg: 4, base_lift_deg: 0.5 }]) {
            const { status, summary, written } = runLines(lines)
            expect(summary.fails).toEqual([])
            expect(status).toBe(0)
            expect(summary.line_units).toEqual(['line-1', 'line-2'])
            const beams = written.fixtures.filter((x) => x.type === 'up-la40wf').map((x) => x.laser.beams[0])
            expect(beams.every((b) => b.frames.list.length === 256)).toBe(true)
            expect(written.fixtures.filter((x) => x.type === 'ext-lc-ultra-mk2').every((x) => x.laser.beams.every((b) => b.frames.list.length === 256))).toBe(true)
        }
    })
    it('refuses a colour the unit cannot make, a downward base and an unknown pattern', () => {
        expect(runLines({ ...lineBase, pattern: 'still', colour: '#eefdfd' }).summary.schema_errors.join(' ')).toMatch(/not one the unit makes/)
        expect(runLines({ ...lineBase, pattern: 'still', base_lift_deg: -1 }).summary.schema_errors.join(' ')).toMatch(/up only/)
        expect(runLines({ ...lineBase, pattern: 'fan' }).summary.schema_errors.join(' ')).toMatch(/lines pattern/)
    })
    it('a swing wide enough to leave the bay fails the physics, nothing written', () => {
        const { status, summary, written } = runLines({ ...lineBase, pattern: 'sweep', amplitude_deg: 18 })
        expect(status).toBe(1)
        expect(JSON.stringify(summary.fails)).toMatch(/lines/)
        expect(written).toBe(null)
    })
})

describe.skipIf(!hasPython)('laser_frames.py: beams, segments, keyframes (2026-10-17, the owner at the wall: "more robust scenes")', () => {
    it('beams > the lines puts several rays on a line, each lit after a blank move to its own spot', () => {
        const { status, summary, written } = run({ ...base, pattern: 'fan', pitch_deg: 4, yaw_deg: 9, spread_deg: 2, beams: 6 })
        expect(status).toBe(0)
        expect(summary.ok).toBe(true)
        const beam = written.fixtures[0].laser.beams[0]
        const lit = beam.frames.list.filter((f) => f.some((p) => p[2] > 0))
        expect(lit.length).toBeGreaterThan(0)
        for (const f of lit) {
            expect(f.filter((p) => p[2] > 0)).toHaveLength(3)                      // 6 beams on 2 lines: 3 rays a line
            for (let k = 0; k < f.length; k += 1) {
                if (f[k][2] <= 0) continue
                expect(f[k - 1][2]).toBe(0)                                          // a blank move first …
                expect(f[k - 1].slice(0, 2)).toEqual(f[k].slice(0, 2))              // … to the ray's own spot
            }
        }
    })
    it('segments makes a denser sky sheet', () => {
        const { status, written } = run({ ...base, pattern: 'sky', pitch_deg: 4, yaw_deg: 9, spread_deg: 2, amplitude_deg: 1, segments: 8 })
        expect(status).toBe(0)
        const f = written.fixtures[0].laser.beams[0].frames.list.find((fr) => fr.some((p) => p[2] > 0))
        let longest = 0, runLen = 0
        for (const p of f) { runLen = p[2] > 0 ? runLen + 1 : 0; longest = Math.max(longest, runLen) }
        expect(longest).toBe(8)                                                      // one pose of the sheet: 8 lit points in a row
    })
    it('--keyframes writes one pose a frame and marks the frames for blending', () => {
        const laser = { ...base, pattern: 'single-scan', pitch_deg: 4, yaw_deg: 9, amplitude_deg: 1.5 }
        const plain = run(laser).written.fixtures[0].laser.beams[0].frames
        const key = run(laser, ['--keyframes']).written.fixtures[0].laser.beams[0].frames
        expect(plain.tween).toBeUndefined()
        expect(plain.list.some((f) => f.filter((p) => p[2] > 0).length > 1)).toBe(true)   // the path within a frame
        expect(key.tween).toBe(true)
        expect(key.list.every((f) => f.filter((p) => p[2] > 0).length <= 1)).toBe(true)   // one pose a frame
    })
    it('beams and segments out of range are schema errors', () => {
        expect(run({ ...base, pattern: 'fan', pitch_deg: 4, yaw_deg: 9, spread_deg: 2, beams: 0 }).summary.schema_errors.join(' ')).toMatch(/beams/)
        expect(run({ ...base, pattern: 'sky', pitch_deg: 4, yaw_deg: 9, spread_deg: 2, segments: 1 }).summary.schema_errors.join(' ')).toMatch(/segments/)
    })
})

describe.skipIf(!hasPython)('laser_frames.py: surfaces from dims.shell (2026-10-20, no hand-copied planes)', () => {
    const runWith = (laser, hallRec, extra = []) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-shell-'))
        const f = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p }
        const r = spawnSync('python3', ['-I', path.join(here, 'laser_frames.py'), '--scenes', f('s.json', scenes(laser)), '--rig', f('r.json', rig),
            '--hall', f('h.json', hallRec), '--check', '--plan-out', path.join(dir, 'plan.json'), ...extra], { encoding: 'utf8' })
        const plan = fs.existsSync(path.join(dir, 'plan.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8')) : null
        fs.rmSync(dir, { recursive: true, force: true })
        return { status: r.status, stdout: r.stdout, stderr: r.stderr, plan }
    }
    it('REFUSES a hall record without dims.shell: exit 2, says what to run, checks nothing', () => {
        const r = runWith({ ...base, pattern: 'comb' }, { dims: { span_m: 24, truss_bottom_h_m: 10.8, truss_top_h_m: 13.3, ridge_h_m: 16.5, lantern_w_m: 12 } })
        expect(r.status).toBe(2)
        expect(r.stderr).toMatch(/no dims\.shell/)
        expect(r.stderr).toMatch(/hall_shell\.py/)
        expect(r.stdout).toBe('')
    })
    it('a fan inside the lantern band ends on the lantern roof, labelled and failing', () => {
        const { plan } = runWith({ ...base, pattern: 'fan', pitch_deg: 8, yaw_deg: 0, spread_deg: 2 }, hall)
        const ends = plan.scenes[0].ends
        expect(Object.keys(ends)).toEqual(['lantern glazing (roof)'])
        expect(plan.scenes[0].fail_count).toBeGreaterThan(0)
    })
    it('a ray off the lantern band ends on the roof deck at the model\'s deck underside (13.35, not the copied 13.3)', () => {
        const { plan } = runWith({ ...base, pattern: 'fan', pitch_deg: 4, yaw_deg: 9, spread_deg: 2 }, hall)
        expect(Object.keys(plan.scenes[0].ends)).toEqual(['roof deck'])
        expect(plan.scenes[0].ends['roof deck'].height_m[0]).toBeGreaterThanOrEqual(13.34)
        expect(plan.scenes[0].fail_count).toBe(0)
    })
    it('a ray through the gap in the end wall (a door opening) is open sky and fails', () => {
        const noEnd = { dims: { ...hall.dims, shell: shell.filter((m) => !m.id.startsWith('end-wall')) } }
        const { plan } = runWith({ ...base, pattern: 'comb' }, noEnd)   // the comb runs along the hall to the end wall; none there: nothing to stop it
        expect(Object.keys(plan.scenes[0].ends)).toContain('open sky')
        expect(JSON.stringify(plan.scenes[0].fails)).toContain('open sky')
    })
    it('a slab the rules do not know fails, never passes silently', () => {
        const odd = { dims: { ...hall.dims, shell: [...shell.filter((m) => !m.id.startsWith('deck')), slab('deck-up-1', 'mystery cladding', [-36.4, 60.4], [13.35, 13.5], [-53.8, 53.8])] } }
        const { plan } = runWith({ ...base, pattern: 'fan', pitch_deg: 4, yaw_deg: 9, spread_deg: 2 }, odd)
        expect(JSON.stringify(plan.scenes[0].fails)).toContain('unclassified shell surface')
    })
    it('the lantern kerb fails closed (not cleared as a stop) and names itself', () => {
        const kerb = { dims: { ...hall.dims, shell: shell.map((m) => (m.id === 'lantern-up-1' ? { ...m, surface: 'lantern kerb' } : m)) } }   // what the ray ends on is a kerb slab
        const { plan } = runWith({ ...base, pattern: 'fan', pitch_deg: 8, yaw_deg: 0, spread_deg: 2 }, kerb)
        expect(Object.keys(plan.scenes[0].ends)).toEqual(['lantern glazing (kerb)'])
        expect(JSON.stringify(plan.scenes[0].fails)).toMatch(/lantern glazing \(kerb\)/)
    })

    it('a ray that left by a gate and ends in "open sky (through <opening>)" is the rule "open sky" (physics_check bounds the floor to the hall)', () => {
        const py = 'import importlib.util, json, sys\nspec = importlib.util.spec_from_file_location("lf", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n' +
            'print(json.dumps([m.rule_label(n) for n in ("open sky (through end-wall-entry opening)", "none (open sky)", "floor")]))'
        const r = spawnSync('python3', ['-I', '-c', py, path.join(here, 'laser_frames.py')], { encoding: 'utf8' })
        expect(r.status, r.stderr).toBe(0)
        expect(JSON.parse(r.stdout)).toEqual([['open sky', true], ['open sky', true], ['floor', true]])
    })
})
