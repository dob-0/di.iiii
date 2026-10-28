// lights_beta_options.py (2026-10-07): the lights step for MOXIR beta v0.9 as three options drawn for the
// owner's look. The test runs the script's --check (no drawing) on the committed records and holds the
// claims the pictures make: the order's counts in every option, the laser planning rules, glare, the DJ,
// the ground-mover rule, and the floor fixtures the beta left inside machines or outside the hall.
// Skipped when python3 or numpy is missing.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const hasPython = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0

describe.skipIf(!hasPython)('lights_beta_options.py --check', () => {
    let S, C
    beforeAll(() => {
        const run = spawnSync('python3', ['-I', path.join(here, 'lights_beta_options.py'), '--repo', repo, '--check'], {
            encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 64 * 1024 * 1024
        })
        if (run.status !== 0) throw new Error(run.stderr)
        const out = JSON.parse(run.stdout)
        S = out.summary
        C = out.checks
    }, 120000)

    it('keeps the order in every option: 50 PARs, 18 beams, 6 lasers', () => {
        for (const id of ['today', 'A', 'B', 'C']) {
            expect(S.options[id].counts).toMatchObject({ 'up-pl5403': 50, 'up-b380f': 18, 'ext-lc-ultra-mk2': 6 })
        }
    })

    it('stores rotations that give back the aimed direction', () => {
        expect(S.aim_roundtrip_max_deg).toBeLessThan(0.01)
    })

    it('fails the as-built lasers: all six end in the glazed lantern, cube 6 is 0.27 m from hoist 3', () => {
        expect(S.options.today.laser_pass).toBe(false)
        expect(C.today.lasers.every((l) => l.ends_on.startsWith('lantern opening'))).toBe(true)
        expect(C.today.lasers[5].nearest_steel.m).toBeLessThan(0.3)
    })

    it('passes the laser planning rules in A, B and C, and keeps A and B off the audience', () => {
        for (const id of ['A', 'B', 'C']) {
            expect(S.options[id].laser_pass).toBe(true)
            expect(S.options[id].laser_min_over_floor_m).toBeGreaterThanOrEqual(3)
            expect(S.options[id].laser_min_steel_m).toBeGreaterThanOrEqual(0.3)
            for (const l of C[id].lasers) expect(l.ends_on).toBe('roof deck (solid)')
        }
        expect(S.options.A.laser_min_over_audience_m).toBeNull()
        expect(S.options.B.laser_min_over_audience_m).toBeNull()
        expect(S.options.C.laser_min_over_audience_m).toBeGreaterThanOrEqual(3)
        expect(S.nohd_m).toBeGreaterThan(108) // longer than the hall: no beam may reach an eye
    })

    it("puts no lamp face in the crowd's eyes in A and B, and names the cost of the wash in C", () => {
        for (const id of ['today', 'A', 'B']) {
            expect(S.options[id].truss_pars_glaring).toEqual([])
            expect(S.options[id].beams_into_eyes).toEqual([])
        }
        expect(S.options.C.truss_pars_glaring.length).toBe(10)
        expect(S.options.C.max_eye_lux_truss).toBeGreaterThan(0)
        expect(S.options.C.beams_into_eyes).toEqual([])
    })

    it('sends no narrow beam through the DJ and no ground mover under 2.5 m in the dance zone', () => {
        for (const id of ['today', 'A', 'B', 'C']) {
            expect(S.options[id].dj_narrow).toEqual([])
            expect(S.options[id].mover_eye_zone).toEqual([])
        }
    })

    it('finds the floor fixtures the beta left inside machines or outside the hall', () => {
        const g = Object.fromEntries(S.floor.map((r) => [r.group, r]))
        expect(g['par-press-cut'].inside_a_machine.length).toBeGreaterThan(0)
        expect(g['par-press-sides'].inside_a_machine.length).toBe(2)
        expect(g['hazer-back'].inside_a_machine).toContain('rig-hazer-back-02')
        expect(g['beam380-columns'].inside_a_machine).toContain('rig-beam380-columns-02')
        expect(g['hazer-hall'].outside_the_hall).toContain('rig-hazer-hall-04')
        expect(g.smoke.outside_the_hall).toContain('rig-smoke-04')
    })
})
