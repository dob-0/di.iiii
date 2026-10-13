// moxir_v2_cranes.py build (the WRITER), guarded on its output (owner 2026-10-13). The GLB the real checks read is not in git, so the
// harness runs build() in a scratch copy of rigs/ with checks()/data() stubbed (their numbers are moxir-v2-cranes.test.js's job) and the REAL
// lay_patch, the real file merge and the real writer. Two things it pins:
//   1. the build keeps every key of forty_watt_route_r3 in moxir-lasers-on-crane-2026-10-09.json (a build that dropped them was silent);
//   2. a build whose patch block says ok:false is caught (#880 shipped one unchecked); the good build passes the same gate.
// Skipped when python3/numpy is missing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0
const LASERS = 'moxir-lasers-on-crane-2026-10-09.json'
const RIG = 'moxir-v2-cranes-2026-10-09.json'
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))

// the gate: any `ok:false` anywhere in the rig's patch block, or a branch not ok
const anyFalse = (o) => !!o && typeof o === 'object' && Object.entries(o).some(([k, v]) => (k === 'ok' && v === false) || anyFalse(v))
export const patchBlockProblems = (rig) => {
    const bad = []
    if (anyFalse(rig.patch)) bad.push('the patch block says ok:false')
    for (const b of rig.patch.branches || []) if (b.ok !== true) bad.push(`branch ${b.branch} is not ok`)
    return bad
}

const HARNESS = `
import sys, json
sys.path.insert(0, sys.argv[1])
import moxir_v2_cranes as C
mode = sys.argv[3]
keys = ('summary', 'rigging', 'people', 'dj_light', 'dj_glare', 'dj_glare_all_at_full', 'cut_light', 'b380f', 'truss', 'lamp_clearance',
        'beams', 'casts', 'forty_watt', 'setup_sheet', 'far_wall_openings')
C.data = lambda repo: ({}, {}, [], [])
C.checks = lambda repo: {k: {} for k in keys}
C.passes = lambda R: []
if mode == 'bad':
    real = C.lay_patch
    def bad(repo, T):
        T = real(repo, T)
        T['patch'] = dict(T['patch'], branches=[{'branch': 'U1-stage', 'slots': 512, 'ok': False}])
        return T
    C.lay_patch = bad
C.build(sys.argv[2])
`

describe.skipIf(!hasPython)('moxir_v2_cranes.py build: what the writer keeps and what it refuses', () => {
    const RIGS = path.join(here, 'rigs')
    const repoOf = []
    const run = (mode) => {
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), `cranes-${mode}-`))
        repoOf.push(repo)
        fs.cpSync(RIGS, path.join(repo, 'scripts', 'place', 'rigs'), { recursive: true })
        const r = spawnSync('python3', ['-c', HARNESS, here, repo, mode], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
        expect(r.status, r.stderr).toBe(0)
        const out = path.join(repo, 'scripts', 'place', 'rigs')
        return { lasers: read(out, LASERS), rig: read(out, RIG) }
    }
    let good, bad
    beforeAll(() => { good = run('good'); bad = run('bad') })
    afterAll(() => { for (const d of repoOf) fs.rmSync(d, { recursive: true, force: true }) })

    it('a cranes build keeps every forty_watt_route_r3 key of the committed lasers file', () => {
        const before = read(RIGS, LASERS).forty_watt_route_r3
        expect(Object.keys(before).length).toBeGreaterThan(10)
        expect(Object.keys(good.lasers.forty_watt_route_r3).sort()).toEqual(Object.keys(before).sort())
        expect(good.lasers.forty_watt_route_r3).toEqual(before)
    })
    it('the good build passes the patch gate', () => {
        expect(patchBlockProblems(good.rig)).toEqual([])
    })
    it('a build that writes ok:false into the patch block fails the gate', () => {
        const problems = patchBlockProblems(bad.rig)
        expect(problems.length).toBeGreaterThan(0)
        expect(problems.join(' ')).toMatch(/ok:false|not ok/)
    })
})
