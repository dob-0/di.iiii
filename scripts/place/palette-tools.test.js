// The palette audit tools (migrated 2026-10-15 from the MOXIR scenes-50 job, ledger N811.2): palette_lib.py (colour maths + table
// loader), palette_sample.py / palette_stats.py (clip statistics), measure/flashrate.cjs (flash rate of the desk's fx engine).
// The lamp hexes below are the values the old palette.py produced, so the move changed nothing. Clip tests need ffmpeg + numpy and skip without.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
const py = (args, input) => spawnSync('python3', ['-I', ...args], { encoding: 'utf8', env, input })
const hasNumpy = py(['-c', 'import numpy']).status === 0
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
const TABLE = path.join(here, 'rigs', 'palette-moxir-2026-10-15.json')

const lib = (code) => {
    const r = py(['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(here)}); import palette_lib as p\n${code}`])
    if (r.status !== 0) throw new Error(r.stderr)
    return JSON.parse(r.stdout)
}

describe.skipIf(py(['-c', 'pass']).status !== 0)('palette_lib.py', () => {
    it('--help prints the docstring', () => {
        const r = py([path.join(here, 'palette_lib.py'), '--help'])
        expect(r.status).toBe(0)
        expect(r.stdout).toMatch(/palette_lib/)
    })
    it('loads the table: 19 colours, lamp hexes as the old palette.py made them', () => {
        const C = lib(`P, C, N, S, W = p.load(${JSON.stringify(TABLE)}); print(json.dumps({'n': len(P), 'C': C, 'w': len(W)}))`)
        expect(C.n).toBe(19)
        expect(C.w).toBe(14)
        expect(C.C.CW).toBe('#eefdfd')
        expect(C.C.E).toBe('#ff3a12')
        expect(C.C.SB).toBe('#73bdff') // hue of the sample #7490a9 at S 0.55
        expect(C.C.WW).toBe('#ffbe7a') // Planckian 3200 K
    })
    it('maths: luminance, planck range, eye comfort, nearest wheel slot', () => {
        const r = lib(`W = p.load(${JSON.stringify(TABLE)})[4]
print(json.dumps({'white': p.lum('#ffffff'), 'black': p.lum('#000000'), 'ember': p.eye('#ff3a12'), 'green': p.eye('#00ff00'),
  'slot': p.nearest_slot('#ff2010', W)[0], 'ret': p.returned('#ffffff', '#808080')}))`)
        expect(r.white).toBeCloseTo(1, 4)
        expect(r.black).toBe(0)
        expect(r.ember.saturated_red).toBe(true)
        expect(r.green.saturated_red).toBe(false)
        expect(r.slot).toBe('Red')
        expect(r.ret).toBeCloseTo(0.2159, 3) // 0.5 grey, sRGB -> linear
    })
    it('refuses a Planckian temperature outside the Kim et al. spline', () => {
        const r = py(['-c', `import sys; sys.path.insert(0, ${JSON.stringify(here)}); import palette_lib as p; p.planck_hex(9000)`])
        expect(r.status).not.toBe(0)
        expect(r.stderr).toMatch(/1667-4000 K/)
    })
    it('the data files carry a source and a date', () => {
        const t = JSON.parse(fs.readFileSync(TABLE, 'utf8'))
        expect(t._source).toMatch(/2026-10-15/)
        const s = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'palette-teasers-moxir-2026-10-15.json'), 'utf8'))
        expect(s._source).toBeTruthy()
        expect(s._licence).toBeTruthy()
        expect(Object.keys(s.clips)).toHaveLength(8)
    })
})

describe.skipIf(!hasNumpy || !hasFfmpeg)('palette_sample.py + palette_stats.py on a synthetic clip', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-test-'))
    const clip = path.join(dir, 'red.mp4')
    const mk = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xff2000:s=160x90:r=10:d=2', '-pix_fmt', 'yuv420p', clip])
    const tsv = path.join(dir, 'clips.tsv')
    fs.writeFileSync(tsv, `c1\t${clip}\t2.0\n`)
    it('palette_sample: a red clip is all glow, saturated red', () => {
        expect(mk.status).toBe(0)
        const out = path.join(dir, 'sample.json')
        const r = py([path.join(here, 'palette_sample.py'), tsv, out])
        expect(r.status).toBe(0)
        const c1 = JSON.parse(fs.readFileSync(out, 'utf8')).c1
        expect(c1.glow_pct).toBeGreaterThan(99)
        expect(c1.sat_glow_hue_pct.red).toBeGreaterThan(99)
    })
    it('palette_stats: no flashes in a constant clip; file is the base name', () => {
        const out = path.join(dir, 'stats.json')
        const r = py([path.join(here, 'palette_stats.py'), tsv, out])
        expect(r.status).toBe(0)
        const c1 = JSON.parse(fs.readFileSync(out, 'utf8')).c1
        expect(c1.file).toBe('red.mp4')
        expect(c1.flash_pairs_total).toBe(0)
        expect(c1.bright_red_pct).toBeGreaterThan(95)
    })
    it('both print help and exit 2 without arguments', () => {
        for (const f of ['palette_sample.py', 'palette_stats.py']) {
            expect(py([path.join(here, f), '--help']).status).toBe(0)
            expect(py([path.join(here, f)]).status).toBe(2)
        }
    })
})

describe('measure/flashrate.cjs', () => {
    it('reports every mode of the lighting fx engine, strobe at the WCAG limit of 3 flashes per second', () => {
        const r = spawnSync('node', [path.join(repo, 'scripts/measure/flashrate.cjs'), path.join(repo, 'serverXR/src/lighting/fx.js')], { encoding: 'utf8' })
        expect(r.status).toBe(0)
        expect(r.stdout).toMatch(/^strobe\s+3\//m)
        expect(r.stdout).toMatch(/depth 128/)
    })
    it('--help exits 0, no argument exits 2', () => {
        const f = path.join(repo, 'scripts/measure/flashrate.cjs')
        expect(spawnSync('node', [f, '--help']).status).toBe(0)
        expect(spawnSync('node', [f]).status).toBe(2)
    })
})
