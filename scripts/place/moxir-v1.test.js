// moxir_v1.py (2026-10-08): MOXIR v1.0, elite + minimal. Runs --check (the model only, ~3 min) and holds what the page
// claims: the 12 laser lines end on the ash wall with >= 0.5 deg to spare in the recommended plan and the fallback; no
// lamp beam blocked; no audience eye in a field but the capped blinders; <= 2 layers (3 only in the fire); ash/ember only;
// <= 30 kW running; DMX, circuits and Cat6 links inside their limits. Skipped without python3/numpy or the hall GLB.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const hasPython = spawnSync('python3', ['-c', 'import numpy, PIL, matplotlib'], { encoding: 'utf8' }).status === 0
const GLB = '/mnt/data/footage/place-moxir-hall-v8-show-back21-2026-10-07/hall.glb'

describe.skipIf(!hasPython || !fs.existsSync(GLB))('moxir_v1.py --check', () => {
    let S
    beforeAll(() => {
        const run = spawnSync('nice', ['-n', '15', 'python3', '-I', path.join(here, 'moxir_v1.py'), '--repo', repo, '--check'],
            { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' }, maxBuffer: 256 * 1024 * 1024 })
        if (run.status !== 0) throw new Error(run.stderr)
        S = JSON.parse(run.stdout)
    }, 900000)

    it('lands all 12 laser lines on the ash wall with margin, in the recommended plan and the fallback', () => {
        for (const p of [S.recommended, S.fallback]) {
            const l = S.plans[p].lasers
            expect(l.pass, p).toBe(12)
            expect(l.min_margin_deg, p).toBeGreaterThanOrEqual(0.5)
        }
        expect(S.recommended).toBe('A1')
        expect(S.fallback).toBe('B1')
    })

    it('passes every check it states as a check (Plan B\'s span row is OWED, not passed)', () => {
        for (const r of S.check_rows) {
            if (r[2] === 'owed') continue
            expect(r[2], r[0]).toBe(true)
        }
        expect(S.check_rows.some((r) => r[2] === 'owed')).toBe(true)
    })

    it('hangs all the wash and all the beam of the order, 6 cubes, no hazer, inside the owner\'s caps (owner 10-08)', () => {
        expect(S.power.running_total_w).toBeLessThanOrEqual(30000)
        const row = (code) => S.not_hung.find((r) => r.code === code)
        for (const code of ['UP-PL5403', 'UP-B380F', 'UP-250BSW', 'UP-HK1915']) expect(row(code).not_hung, code).toBe(0)
        expect(row('EXT-LC-ULTRA-MK2').hung).toBe(6)
        expect(row('EXT-HAZER')).toBeUndefined()
        for (const lk of S.looks) for (const [, v] of Object.entries(lk.parts)) if (v[0]) expect(['#e8e4dc', '#9c978d', '#ff3a12', '#a3200c']).toContain(v[0])
    })
})
