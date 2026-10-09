// MOXIR v2 (2026-10-09): the occlusion sky (occlusion_sky.py), the cut's PAR count (cut-count.mjs), the three layouts
// (moxir_v2.py's rig files) and the rig-file cue list epic-build now honours.
// Holds: the cut the python world uses IS the cut stage-line.mjs derives; the cut's load table reproduces v1.0's 146 kg at
// its 17 lamps' order of magnitude and refuses 20; the recommended count keeps every shaft its own piece with either lens;
// the occlusion engine blocks beams on the audience, the near crane and the columns and finds the long throws; every layout
// hangs the fixed kit (18 B380F all on the ground or machines, 50 PARs, 1 smoke) and no beam enters the crowd or runs under
// 3 m over a standing level. The python parts are skipped when python3/numpy or the hall GLB (built by hall.py, not in git)
// is missing.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { theCut, cutCount, placesFor, PICK_CAP_KG, table } from './cut-count.mjs'
import { cuesOf, v1Cues } from '../rigbuild/epic-build.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const GLB = '/mnt/data/footage/place-moxir-hall-v9-show-park-2026-10-08/hall.glb'
const hasPython = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' }
const LAYOUTS = ['corridors', 'planes', 'lines']
const rigOf = (n) => JSON.parse(fs.readFileSync(path.join(here, 'rigs', `moxir-v2-${n}-2026-10-09.json`), 'utf8'))

describe('cut-count.mjs: the PARs on the cut', () => {
    const cut = theCut()
    it('reads the cut v1.1 derives (the python world carries the same ends and picks)', () => {
        expect(cut.truss.ends.map((e) => [e.x_m, e.bottom_chord_m])).toEqual([[-11.04, 2.89], [0.55, 6]])
        expect(cut.rigging.picks.map((p) => p.bridle_included_deg)).toEqual([26, 42, 119])
        const py = fs.readFileSync(path.join(here, 'occlusion_sky.py'), 'utf8')
        expect(py).toContain("'ends': [(-11.04, 2.89), (0.55, 6.00)]")
        expect(py).toContain("'picks': [(-10.59, 4.16), (-5.52, 5.52), (0.03, 7.01)]")
        expect(cut.rigging.picks.map((p) => [p.x_m, p.apex_m])).toEqual([[-10.59, 4.16], [-5.52, 5.52], [0.03, 7.01]])
    })
    it('spreads lamps on clamp points, never closer than 0.25 m to a pick', () => {
        const us = placesFor(10)
        expect(us).toHaveLength(10)
        for (const u of us) for (const p of [-5.75, -0.5, 5.25]) expect(Math.abs(u - p)).toBeGreaterThanOrEqual(0.25 - 1e-9)
        expect(new Set(us).size).toBe(10)
    })
    it('keeps the recommended 10 under the 146 kg pick cap, every shaft its own piece with a 15 or a 25 deg lens', () => {
        const c = cutCount(10, cut)
        expect(c.picks_ok).toBe(true)
        expect(c.worst_pick_kg).toBeLessThan(PICK_CAP_KG)
        expect(c.headroom_kg).toBeGreaterThan(40)
        for (const l of c.look) expect(l.shafts_separate_pct).toBe(100)
        expect(c.power.circuits_16a).toBe(1)
        expect(c.dmx.branches).toBe(1)
    })
    it("lands near v1.0's middle pick at 17 lamps and refuses 20", () => {
        const rows = new Map(table([17, 20]).map((r) => [r.n, r]))
        expect(rows.get(17).worst_pick_kg).toBeGreaterThan(125)
        expect(rows.get(17).worst_pick_kg).toBeLessThan(PICK_CAP_KG)
        expect(rows.get(20).picks_ok).toBe(false)
    })
})

describe('epic-build: a rig file carries its own cues', () => {
    it('uses rig.cues when given, else the v1.0 night', () => {
        const c = cuesOf({ cues: [{ look: 'dark', name: 'A · dark', hold: 30 }, { look: 'peak', name: 'A · peak' }] })
        expect(c.map((x) => x.lightLook)).toEqual(['rig-dark', 'rig-peak'])
        expect(c[1].hold).toBe(20)
        expect(cuesOf({}).length).toBe(v1Cues().length)
    })
})

describe('the three v2 layouts (rig files)', () => {
    for (const n of LAYOUTS) {
        it(`${n}: hangs the fixed kit, no beam head on the truss`, () => {
            const r = rigOf(n)
            const by = (t) => r.fixtures.filter((f) => f.type === t)
            expect(by('up-b380f')).toHaveLength(18)
            expect(by('up-pl5403')).toHaveLength(50)
            expect(by('up-yz31p')).toHaveLength(1)
            for (const f of by('up-b380f')) {
                expect(f.layer).toBe('beams')
                expect(f.p[1]).toBeLessThan(1.5)                 // on the floor (mount face 0.7 m), none on the cut or a crane
                expect(f.sky_clear_pct).toBeGreaterThan(0)
            }
            expect(by('up-pl5403').filter((f) => f.layer === 'the cut')).toHaveLength(r.cut.pars)
            expect(r.cut.picks_kg.every((k) => k <= PICK_CAP_KG)).toBe(true)
            expect(r.checks.beams_into_audience).toBe(0)
            expect(r.checks.beams_ok).toBe(18)
            expect(r.checks.circuits_ok).toBe(true)
            expect(r.checks.branches.every((b) => b.ok)).toBe(true)
            expect(r.cues.map((c) => c.look)).toEqual(['dark', 'peak'])
            expect(r.solids.some((s) => s.id === 'rig-ash-wall')).toBe(false)
        })
    }
})

describe.skipIf(!hasPython || !fs.existsSync(GLB))('occlusion_sky.py: the engine on hall v9-show-park', () => {
    let O
    beforeAll(() => {
        const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(here)})
import numpy as np, occlusion_sky as S
W = S.World(${JSON.stringify(repo)})
out = {'tris': W.n_tris, 'classes': W.classes}
out['col'] = S.sky(W, [10.8, 0.0, -23.0], n=400)
out['under_girder'] = S.sky(W, [-5.0, 0.0, -1.0], n=400)
out['into_crowd'] = S.beam_check(W, [0.5, 0.5, 34.0], [0, -0.02, -1.0])
out['straight_up'] = S.beam_check(W, [-6.0, 0.5, -20.0], [0, 1.0, 0])
out['par'] = S.par_on_steel(W, [-11.157, 0.31, -24.0], [-0.0707, 0.9975, 0.0], 15)
out['par25'] = S.par_on_steel(W, [-11.157, 0.31, -24.0], [-0.0707, 0.9975, 0.0], 25)
print(json.dumps(out))
`
        const run = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 })
        if (run.status !== 0) throw new Error(run.stderr)
        O = JSON.parse(run.stdout)
    }, 300000)

    it('names the whole building', () => {
        expect(O.tris).toBeGreaterThan(55000)
        for (const c of ['space frame', 'column', 'column head', 'runway', 'crane', 'machine', 'lantern glass', 'end wall']) expect(O.classes[c], c).toBeGreaterThan(0)
    })
    it('finds a column foot in the far half with a quarter of its sky clear for 30 m and its longest throw down the hall', () => {
        expect(O.col.clear_pct).toBeGreaterThan(20)
        expect(O.col.clear_pct + O.col.roof_pct + O.col.glass_pct + O.col.blocked_pct).toBeCloseTo(100, 0)
        expect(O.col.top_blockers[0].what).toMatch(/column x 12 z -24/)
        expect(O.col.longest[0].m).toBeGreaterThan(80)
    })
    it('blocks a head right under the near crane by its girder, and a flat beam by the crowd', () => {
        expect(O.under_girder.top_blockers.map((b) => b.what).join(' ')).toMatch(/crane z 0.15/)
        expect(O.into_crowd.axis_cls).toBe('audience')
        expect(O.straight_up.axis_ends_on).toMatch(/roof deck|space frame/)
    })
    it('lights about 4 m of a column with a 15 deg PAR, and it is brighter on the steel than the 25 deg lens', () => {
        expect(O.par.column_lit_length_m).toBeGreaterThan(3.5)
        expect(O.par.lux_on_steel[1]).toBeGreaterThan(O.par25.lux_on_steel[1])
    })
})
