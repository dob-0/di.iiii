// epic_placement.py (2026-10-08): MOXIR epic plot, phase 1 (placement). The test runs --check (the model only) and holds
// what the page claims: every laser home passes 6 of 6 far beams and all 6 mid beams; the per-beam power model (6 W, 2 beams
// per cube) is lower than the old one-beam 10 W figure; the advised option of every group exists and was measured; the
// advised washes and beams put no eye in a field; the advised flash keeps the front row at 0 lux while 'front' does not;
// the advised haze feeds more of the far trio than today's; the goal post and the cut stay inside their load tables.
// Skipped when python3/numpy or the hall GLB (built by hall.py, not in git) is missing.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const hasPython = spawnSync('python3', ['-c', 'import numpy, PIL, matplotlib'], { encoding: 'utf8' }).status === 0
const GLB = '/mnt/data/footage/place-moxir-hall-v8-show-back21-2026-10-07/hall.glb'
const REC = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'moxir-epic-placement-2026-10-08.json'), 'utf8'))

describe('the epic placement record', () => {
    it('names an advised option that exists, for every group', () => {
        for (const g of REC.groups) expect(g.options.map(o => o.id), g.id).toContain(g.advice)
    })
    it('models laser power per beam honestly (2 beams per cube, duty <= 0.5) and keeps 10 W for safety', () => {
        expect(REC.laser_model.beams_per_cube).toBe(2)
        expect(REC.laser_model.duty_per_beam).toBeLessThanOrEqual(0.5)
        expect(REC.laser_model.safety_variant).toBe('10W')
        expect(REC.laser_model.visibility_variant).toBe('6W')
    })
})

describe.skipIf(!hasPython || !fs.existsSync(GLB))('epic_placement.py --check', () => {
    let S
    beforeAll(() => {
        const run = spawnSync('python3', ['-I', path.join(here, 'epic_placement.py'), '--repo', repo, '--check'],
            { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 256 * 1024 * 1024 })
        if (run.status !== 0) throw new Error(run.stderr)
        S = JSON.parse(run.stdout)
    }, 600000)

    it('passes every laser beam in every home, at a per-beam brightness below the old one-beam figure', () => {
        for (const k of ['a', 'b', 'c']) {
            const l = S.lasers[k]
            expect(l.far_pass, k).toBe(6)
            expect(l.mid_pass, k).toBe(6)
            expect(l.far_cd, k).toBeGreaterThan(1)
            expect(l.far_cd, k).toBeLessThan(l.far_cd_old_model)
        }
        expect(S.nohd.nohd_m).toBeGreaterThan(108)
    })

    it('measures every option of every group', () => {
        for (const g of REC.groups) for (const o of g.options) expect(S.groups[g.id][o.id], g.id + '/' + o.id).toBeTruthy()
    })

    it('keeps every eye out of the advised washes, beams and truss', () => {
        for (const g of ['columns', 'roof', 'farwall', 'beams']) expect(S.groups[g][REC.groups.find(x => x.id === g).advice].summary.eyes, g).toBe(0)
        expect(S.groups.truss.kept.summary.eyes).toBe(0)
        expect(S.groups.stagefloor.kept.summary.eyes).toBe(0)
    })

    it('advises a flash that blinds no one, and shows the crowd-facing one does', () => {
        expect(S.groups.flash.behind.summary.front_lux).toBe(0)
        expect(S.groups.flash.front.summary.front_lux).toBeGreaterThan(1000)
    })

    it('feeds the far trio better with the advised haze than today', () => {
        expect(S.groups.haze.plus2.summary.far_lasers_first_20m).toBeGreaterThan(S.groups.haze.now.summary.far_lasers_first_20m)
    })

    it('stays inside the load tables it cites', () => {
        expect(S.goalpost_load.with_far_wall_heads_kg).toBeLessThan(S.goalpost_load.allowable_third_points_kg)
        expect(S.flash_truss_load.per_m_kg).toBeLessThan(S.flash_truss_load.allowable_kg_per_m)
    })
})
