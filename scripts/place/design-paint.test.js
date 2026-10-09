// design_paint.py (2026-10-08): MOXIR beta v0.9 from the owner's painted plan — 6 lasers behind the stage, the
// building washed — checked against the hall model. The test runs --check (the model pass only; the photo and cloud
// audit needs the footage and runs with --out) and holds what the page claims: the inventory, every laser ray passing
// (no glass, nothing past the truss plane z 21, >= 3 m over floors), nothing blocked but the 2 kept vista PARs, no
// audience eye in any lamp's field, <= 3 layers per look, option A (the far crane as parked) chosen over z -33 on the
// numbers, and the mid pair's dependence on the near crane leaving z 4.8. survey_shots.py: the shot list lands in a
// COPY of the survey page, never the source.
// Skipped when python3/numpy or the hall GLB (built by hall.py, not in git) is missing.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const hasPython = spawnSync('python3', ['-c', 'import numpy, PIL'], { encoding: 'utf8' }).status === 0
const GLB = '/mnt/data/footage/place-moxir-hall-v8-show-back21-2026-10-07/hall.glb'
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }

describe.skipIf(!hasPython || !fs.existsSync(GLB))('design_paint.py --check', () => {
    let S, B
    beforeAll(() => {
        const run = spawnSync('python3', ['-I', path.join(here, 'design_paint.py'), '--repo', repo, '--check'], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 })
        if (run.status !== 0) throw new Error(run.stderr)
        const out = JSON.parse(run.stdout)
        S = out.summary
        B = out.beams
    }, 300000)

    it('places the beta\'s 84 fixtures once each, plus the order\'s 8 HK1915 and 12 UP-250BSW', () => {
        expect(S.counts).toEqual({ 'up-pl5403': 50, 'up-b380f': 18, 'up-yz31p': 4, 'ext-hazer': 6, 'ext-lc-ultra-mk2': 6, 'up-hk1915': 8, 'up-250bsw': 12 })
    })

    it('hangs all 6 lasers behind the stage, every ray on roof structure, never glass', () => {
        expect(S.lasers).toBe(6)
        expect(S.lasers_pass).toBe(6)
        expect(S.laser_rays).toBe(270)
        expect(S.laser_rays_in_glass).toBe(0)
        expect(S.laser_max_z).toBeLessThanOrEqual(21)
        expect(S.laser_min_over_floor_m).toBeGreaterThanOrEqual(3)
        expect(S.nohd_m).toBeGreaterThan(108)
    })

    it('blocks nothing but the 2 kept vista PARs, and puts no audience eye in any field', () => {
        expect(S.beams_blocked).toEqual(['rig-par-vista-05', 'rig-par-vista-06'])
        expect(B.filter(b => b.new).length).toBe(20)
        expect(S.eyes_in_any_field).toBe(0)
        expect(S.front_row_max_lux).toBe(0)
    })

    it('keeps every look to 3 layers or fewer', () => {
        expect(S.looks.length).toBe(4)
        for (const l of S.looks) {
            expect(l.n_layers, l.title).toBeLessThanOrEqual(3)
            expect(l.eyes_in_field).toBe(0)
        }
    })

    it('chooses the far crane as parked on the numbers', () => {
        const [a, b] = S.far_options
        expect(a.all_pass).toBe(true)
        expect(b.all_pass).toBe(false)
        expect(a.mean_seen).toBeGreaterThan(b.mean_seen)
    })

    it('says the mid pair needs the near crane moved off z 4.8 (where every photo shows it)', () => {
        const c = S.lasers_with_the_crane_as_photographed
        if (c == null) return // the as-photographed hall GLB is not on this machine
        expect(c.filter(x => !x.pass).map(x => x.name)).toEqual(['mid 1 (house left)', 'mid 2 (house right)'])
    })
})

describe.skipIf(!hasPython)('survey_shots.py', () => {
    it('adds the shots to a copy before "the list" and refuses to overwrite the source', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-shots-'))
        const src = path.join(dir, 'survey.html')
        fs.writeFileSync(src, '<main><h2>bring</h2><h2>the list</h2></main>')
        const shots = path.join(dir, 'shots.json')
        fs.writeFileSync(shots, JSON.stringify([{ for: 'wash: left span roof', fixtures: ['hk1915-01'], stand_m: [-24, 1.6, -32], point_yaw_deg: 0, point_pitch_deg: 30,
            aim_at_m: [-24, 6, -42], covers_x_m: [-26, -22], covers_z_m: [-44, -40], look_for: 'the roof <above>', how: 'wide' }]))
        const out = path.join(dir, 'out.html')
        const r = spawnSync('python3', ['-I', path.join(here, 'survey_shots.py'), '--survey', src, '--shots', shots, '--out', out], { encoding: 'utf8' })
        expect(r.status, r.stderr).toBe(0)
        const h = fs.readFileSync(out, 'utf8')
        expect(h.indexOf('L1 · wash: left span roof')).toBeGreaterThan(0)
        expect(h.indexOf('L1')).toBeLessThan(h.indexOf('<h2>the list</h2>'))
        expect(h).toContain('the roof &lt;above&gt;')
        expect(h).toContain('face the far gate, tilt 30° up')
        expect(fs.readFileSync(src, 'utf8')).toBe('<main><h2>bring</h2><h2>the list</h2></main>')
        const again = spawnSync('python3', ['-I', path.join(here, 'survey_shots.py'), '--survey', src, '--shots', shots, '--out', src], { encoding: 'utf8' })
        expect(again.status).not.toBe(0)
        fs.rmSync(dir, { recursive: true, force: true })
    })
})
