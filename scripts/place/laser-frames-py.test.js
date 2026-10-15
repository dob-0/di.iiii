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
const hall = { dims: { span_m: 24, truss_bottom_h_m: 10.8, truss_top_h_m: 13.3, ridge_h_m: 16.5, lantern_w_m: 12 } }
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
