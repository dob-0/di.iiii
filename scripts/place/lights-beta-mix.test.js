// lights_beta_mix.py (2026-10-08): MOXIR beta v0.9's ONE mixed light plot, every fixture re-placed, drawn for the
// owner's look. The test runs the script's --check (no drawing) on the committed records and holds the claims the
// page makes: the order kept, no laser on the truss, every laser ray on solid roof (never glass) and over the 3 m
// rule, no eye in a lamp's cone (front row included), nothing in a machine or outside the hall, the pipe racks clear,
// and no look over 3 layers. Skipped when python3 or numpy is missing.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const hasPython = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0

describe.skipIf(!hasPython)('lights_beta_mix.py --check', () => {
    let S, Lz, C
    beforeAll(() => {
        const run = spawnSync('python3', ['-I', path.join(here, 'lights_beta_mix.py'), '--repo', repo, '--check'], {
            encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 64 * 1024 * 1024
        })
        if (run.status !== 0) throw new Error(run.stderr)
        const out = JSON.parse(run.stdout)
        S = out.summary
        Lz = out.lasers
        C = out.checks
    }, 120000)

    it('places every fixture of the order once, and no other', () => {
        expect(S.counts).toEqual({ 'up-pl5403': 50, 'up-b380f': 18, 'ext-lc-ultra-mk2': 6, 'ext-hazer': 6, 'up-yz31p': 4 })
        expect(S.fixtures).toBe(84)
    })

    it('hangs no laser on the truss: 4 hung, 2 in the case', () => {
        expect(S.on_truss_lasers).toEqual([])
        expect(S.hung_lasers).toBe(4)
        expect(S.spare_lasers).toBe(2)
    })

    it('ends every ray of every laser field on the solid roof deck, over the 3 m rule, clear of steel', () => {
        expect(S.laser_pass).toBe(true)
        expect(S.laser_ends).toEqual(['roof deck (solid)'])
        expect(S.laser_min_over_floor_m).toBeGreaterThanOrEqual(3)
        expect(S.laser_min_over_audience_m).toBeGreaterThanOrEqual(3)
        expect(S.laser_min_steel_m).toBeGreaterThanOrEqual(0.3)
        for (const l of Lz) {
            expect(l.rays).toBe(15)
            expect(l.errors).toEqual([])
        }
        expect(S.nohd_m).toBeGreaterThan(108) // longer than the hall: no beam may reach an eye
    })

    it('puts no audience eye in any lamp cone and no lamp light on a front-row eye', () => {
        expect(S.eyes_in_any_cone).toBe(0)
        expect(S.front_row_in_cone).toEqual([])
        expect(S.front_row_max_lux).toBe(0)
        expect(S.dj_narrow).toEqual([])
        expect(S.mover_eye_zone).toEqual([])
    })

    it('fixes the placement problems of today: machines, the entry wall, the pipe racks', () => {
        expect(Object.keys(S.today_inside_or_outside).length).toBe(8) // 4 press PARs, a hazer and a column beam inside machinery, 2 outside the entry wall
        expect(S.inside_or_outside).toEqual({})
        expect(S.today_ends_on_pipe_racks.length).toBeGreaterThan(0)
        expect(S.ends_on_pipe_racks).toEqual([])
        expect(S.blocked_by_machine).toEqual([])
    })

    it('keeps every look under 3 layers and every look as safe as the plot', () => {
        for (const v of Object.values(S.looks)) {
            expect(v.layers).toBeLessThanOrEqual(3)
            expect(v.eyes_in_cone).toBe(0)
            expect(v.ends_on_pipe_racks).toEqual([])
            expect(v.dj_narrow).toEqual([])
            expect(v.mover_eye_zone).toEqual([])
        }
    })

    it('stores rotations that give back the aims, and every page check passes', () => {
        expect(S.aim_roundtrip_max_deg).toBeLessThan(0.01)
        for (const c of C) expect(c.ok, c.what).toBe(true)
    })
})
