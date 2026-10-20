// rig_generate.py (2026-10-15, ledger N811.10): one generator, hang file + scenes file -> rig file, instead of a builder script
// per version. The test holds the groups (a line spaced evenly with consecutive DMX, its mirror about the DJ axis with Euler
// XYZ -> (rx, -ry, -rz)), the refusals (a shared DMX channel, a scene part no unit has: nothing written), and the proof on
// MOXIR v2.11: the hang taken from the v2.11 rig + the 50-scenes file give exactly what epic-build reads from the energy rig.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rigs = path.join(here, 'rigs')
const hasPython = spawnSync('python3', ['-c', 'import json'], { encoding: 'utf8' }).status === 0
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-generate-'))
const f = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p }
const root = path.resolve(here, '../..')
const gen = (...args) => spawnSync('python3', ['-I', path.join(here, 'rig_generate.py'), ...args], { encoding: 'utf8', cwd: root })
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const hang = (extra = []) => ({
    stage: { deck_h_m: 0.4 },
    fixtures: [{ id: 'key', type: 'wash', part: 'key', p: [0, 2, 0], r: [0, 0, 0], dmx: { universe: 1, address: 1, footprint: 8 } }, ...extra],
    groups: [
        { kind: 'line', prefix: 'left', n: 3, from: [-10, 0, 0], to: [-10, 0, 20], type: 'wash', part: 'left', r: [0.2, 0.3, 0.1], dmx: { universe: 2, address: 1, footprint: 8 } },
        { kind: 'mirror', of: 'left', axis_x: -5, prefix: 'right', part: 'right', dmx: { universe: 2, address: 25, footprint: 8 } }
    ]
})
const scenes = { scenes: [{ id: 'Doors Open', title: 'Doors open', cue: { fade_s: 4, hold_s: 20 }, parts: { left: ['#ff8000', 0.5], right: ['#ff8000', 0.5] } }] }
const build = (h, s, out) => gen('build', '--hang', f('h.json', h), '--scenes', f('s.json', s), '--out', out, '--version', '1.0', '--title', 'test', '--date', '2026-10-15')

describe.skipIf(!hasPython)('rig_generate.py', () => {
    it('expands a line and its mirror, patches them one footprint apart, keeps the hang keys, writes looks and cues', () => {
        const out = path.join(dir, 'rig.json')
        const r = build(hang(), scenes, out)
        expect(r.status, r.stdout + r.stderr).toBe(0)
        const rig = read(out)
        const by = Object.fromEntries(rig.fixtures.map((u) => [u.id, u]))
        expect(rig.fixtures.map((u) => u.id)).toEqual(['key', 'left-01', 'left-02', 'left-03', 'right-01', 'right-02', 'right-03'])
        expect(by['left-02'].p).toEqual([-10, 0, 10])
        expect(by['right-02'].p).toEqual([0, 0, 10])
        expect(by['right-03'].r).toEqual([0.2, -0.3, -0.1])
        expect([by['left-03'].dmx.address, by['right-01'].dmx.address, by['right-03'].part]).toEqual([17, 25, 'right'])
        expect(rig.stage).toEqual({ deck_h_m: 0.4 })
        expect(rig.looks).toEqual([{ id: 'doors-open', title: 'Doors open', parts: scenes.scenes[0].parts }])
        expect(rig.cues).toEqual([{ look: 'doors-open', name: 'Doors open', fade: 4, hold: 20 }])
        expect([rig.loop, rig.version, 'groups' in rig, 'hang' in rig]).toEqual([true, '1.0', false, false])
    })

    it('refuses a shared DMX channel and a scene part no unit has, and writes nothing', () => {
        const out = path.join(dir, 'refused.json')
        const clash = { id: 'clash', type: 'wash', p: [0, 0, 0], r: [0, 0, 0], dmx: { universe: 2, address: 20, footprint: 4 } }
        const bad = { scenes: [{ ...scenes.scenes[0], parts: { ...scenes.scenes[0].parts, roof: ['#ffffff', 1] } }] }
        const r = build(hang([clash]), bad, out)
        expect(r.status).toBe(1)
        expect(r.stdout).toContain('DMX 2.20 already used by clash')
        expect(r.stdout).toContain("part 'roof' not in rig")
        expect(fs.existsSync(out)).toBe(false)
    })

    const v211 = ['moxir-v2-11-2026-10-15.json', 'moxir-scenes-50-2026-10-15.json', 'moxir-v2-11-energy-2026-10-15.json', 'moxir-hang-v2-11-2026-10-15.json']
    it.skipIf(!v211.every((n) => fs.existsSync(path.join(rigs, n))))('MOXIR v2.11: the committed hang + the 50 scenes = what epic-build reads from the energy rig', () => {
        const taken = path.join(dir, 'hang.json')
        expect(gen('hang', '--rig', `scripts/place/rigs/${v211[0]}`, '--out', taken).status).toBe(0)
        expect(read(taken)).toEqual(read(path.join(rigs, v211[3])))
        const out = path.join(dir, 'v2-11.json')
        const b = gen('build', '--hang', path.join(rigs, v211[3]), '--scenes', path.join(rigs, v211[1]), '--out', out, '--version', '2.11', '--title', 'v2.11', '--date', '2026-10-15')
        expect(b.status, b.stdout + b.stderr).toBe(0)
        const c = gen('check', '--rig', out, '--against', path.join(rigs, v211[2]))
        expect(c.status, c.stdout).toBe(0)
        expect(c.stdout).toContain('same: fixtures, solids, stage, atmosphere, views, showSource, loop, not_hung, looks, cues')
    })
})

describe('rigs/moxir-energy-2026-10-15.json (ledger N811.7)', () => {
    it('gives every scene of the 50-scenes file its energy, the same number the scenes file carries', () => {
        const energy = read(path.join(rigs, 'moxir-energy-2026-10-15.json'))
        const { scenes: s } = read(path.join(rigs, 'moxir-scenes-50-2026-10-15.json'))
        expect(Object.keys(energy).sort()).toEqual(s.map((x) => x.id).sort())
        expect(s.filter((x) => energy[x.id] !== x.energy).map((x) => x.id)).toEqual([])
        expect(fs.readFileSync(path.join(rigs, 'moxir-energy-2026-10-15.source.txt'), 'utf8')).toMatch(/source: .*licence: .*2026-10-15/)
    })
})
