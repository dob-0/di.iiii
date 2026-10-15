// The light-environment tools (migrated 2026-10-15 from the MOXIR light-environment audit, ledger N811.8): light_env_table.py,
// light_env_analyze.py, light_env_haze.mjs, light_env_fetch.mjs. They feed the environment picker (venue-to-show step 8).
// Documents here are synthetic; the output of table/haze on the real audit documents was compared to the old scripts' by hand (same).
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './light_env_fetch.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
const py = (args) => spawnSync('python3', ['-I', ...args], { encoding: 'utf8', env })
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'light-env-test-'))
const spot = (id, intensity, angle) => ({ id, type: 'spotLight', components: { fixture: { type: 'wash' }, light: { intensity, angle }, beam: { length: 12, haze: 0.5 } } })
const doc = {
    entities: [spot('a', 10, 0.2), spot('b', 30, 0.2), { id: 'm', type: 'box', components: {} }],
    renderSettings: { toneMapping: 'ACESFilmic', toneMappingExposure: 3.5, bloom: { enabled: true }, shadows: true, atmosphere: { scattering: 0.02, anisotropy: 0.7 } },
    worldState: { fog: { near: 0, far: 50, enabled: true }, backgroundColor: '#000000' },
}
const docFile = path.join(dir, 'scene-one.json')
fs.writeFileSync(docFile, JSON.stringify({ document: doc }))

describe('light_env_table.py', () => {
    it('one row per document: name from the file, exposure, haze, lamp medians', () => {
        const out = path.join(dir, 'table.json')
        const r = py([path.join(here, 'light_env_table.py'), out, docFile])
        expect(r.status).toBe(0)
        expect(r.stdout).toMatch(/^scene-one \| exp 3\.5 ACESFilmic/)
        const rows = JSON.parse(fs.readFileSync(out, 'utf8'))
        expect(rows).toHaveLength(1)
        expect(rows[0].v).toBe('scene-one')
        expect(rows[0].kinds.wash.n).toBe(2)
        expect(rows[0].kinds.wash.I).toBe(20) // median of 10 and 30
        expect(rows[0].scat).toBe(0.02)
        expect(rows[0].nonlamp).toEqual({ box: 1 })
    })
    it('usage: --help 0, no arguments 2', () => {
        expect(py([path.join(here, 'light_env_table.py'), '--help']).status).toBe(0)
        expect(py([path.join(here, 'light_env_table.py')]).status).toBe(2)
    })
})

describe.skipIf(py(['-c', 'import PIL']).status !== 0)('light_env_analyze.py', () => {
    it('measures a half-white picture', () => {
        const shots = path.join(dir, 'shots')
        fs.mkdirSync(shots)
        const mk = py(['-c', `from PIL import Image\nim = Image.new('RGB', (10, 10), (0, 0, 0))\nfor x in range(5):\n    for y in range(10): im.putpixel((x, y), (255, 255, 255))\nim.save(${JSON.stringify(path.join(shots, 'a.png'))})`])
        expect(mk.status).toBe(0)
        fs.writeFileSync(path.join(shots, 'shots.json'), JSON.stringify({ shots: [{ name: 'a', file: 'a.png', fps: { mean: 60, p95Ms: 17 }, tempBefore: 50 }, { name: 'b', error: 'no frame' }] }))
        const out = path.join(dir, 'metrics.json')
        const r = py([path.join(here, 'light_env_analyze.py'), shots, out])
        expect(r.status).toBe(0)
        const m = JSON.parse(fs.readFileSync(out, 'utf8'))
        expect(m[0].meanL).toBeCloseTo(0.5, 2)
        expect(m[0].bright).toBeCloseTo(0.5, 2)
        expect(m[0].redShare).toBe(0)
        expect(m[1]).toEqual({ name: 'b', error: 'no frame' })
    })
})

describe('light_env_haze.mjs', () => {
    it('a document with no haze machine builds no field (uniform scattering)', () => {
        const r = spawnSync('node', [path.join(here, 'light_env_haze.mjs'), docFile], { encoding: 'utf8' })
        expect(r.status).toBe(0)
        expect(r.stdout).toMatch(/machines 0/)
        expect(r.stdout).toMatch(/NO FIELD/)
    })
    it('usage: --help 0, no arguments 2', () => {
        expect(spawnSync('node', [path.join(here, 'light_env_haze.mjs'), '--help']).status).toBe(0)
        expect(spawnSync('node', [path.join(here, 'light_env_haze.mjs')]).status).toBe(2)
    })
})

describe('light_env_fetch.mjs', () => {
    it('parses its arguments; ids are what is left over', () => {
        expect(parseArgs(['--api', 'http://x/serverXR', '--tag', 'dev', '--out', 'd', 'p1', 'p2'])).toMatchObject({ api: 'http://x/serverXR', tag: 'dev', out: 'd', ids: ['p1', 'p2'] })
    })
    it('refuses to run without --api or ids', () => {
        expect(spawnSync('node', [path.join(here, 'light_env_fetch.mjs')]).status).toBe(2)
        expect(spawnSync('node', [path.join(here, 'light_env_fetch.mjs'), '--help']).status).toBe(0)
    })
})
