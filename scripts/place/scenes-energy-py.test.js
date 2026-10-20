// scenes_energy.py + look_energy.py (2026-10-15): a scenes file's energy pass changes LEVELS only. The test holds the tiers
// (full: every beam part at 1 and a missing one added in the scene's own beam colour; low: the floor at >= 0.4), that no colour
// of a part already in the scene changes, and that look_energy keys a 'named …' lamp the way looks.js namedPositionKey does.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import json'], { encoding: 'utf8' }).status === 0
const rig = { fixtures: [['beam a', 3], ['beam b', 3], ['wash', 4], ['floor', 3], ['out', 2]].flatMap(([part, n]) => Array.from({ length: n }, (_, i) => ({ id: `${part}-${i}`, part }))) }
const scenes = { scenes: [
    { id: 'hit', parts: { 'beam a': ['#ff9180', 0.6], wash: ['#d1eeff', 0.3], floor: ['#d1eeff', 0.07], out: ['#a5ff0f', 0.5] } },
    { id: 'low', parts: { wash: ['#ffbe7a', 0.2], floor: ['#d1eeff', 0.07] } }
] }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenes-energy-'))
const f = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p }
const run = (energy) => spawnSync('python3', ['-I', path.join(here, 'scenes_energy.py'), '--scenes', f('s.json', scenes), '--energy', f('e.json', energy),
    '--rig', f('r.json', rig), '--beams', 'beam a,beam b', '--floor', 'floor', '--outside', 'out', '--out', path.join(dir, 'out.json')], { encoding: 'utf8' })

describe.skipIf(!hasPython)('scenes_energy.py', () => {
    it('full lifts every beam to 1 (adding the missing one in the scene colour), keeps colours; low lifts only the floor', () => {
        const r = run({ hit: 1, low: 0.2 })
        expect(r.status, r.stdout + r.stderr).toBe(0)
        const [hit, low] = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')).scenes
        expect(hit.parts['beam a']).toEqual(['#ff9180', 1])
        expect(hit.parts['beam b']).toEqual(['#ff9180', 1])
        expect(hit.parts.wash).toEqual(['#d1eeff', 0.7])
        expect(hit.parts.floor[1]).toBe(0.7)
        expect(hit.parts.out).toEqual(['#a5ff0f', 0.5])
        expect([hit.energy, hit.energy_tier, low.energy_tier]).toEqual([1, 'full', 'low'])
        expect(low.parts).toEqual({ wash: ['#ffbe7a', 0.2], floor: ['#d1eeff', 0.4] })
    })
    it('refuses a scene without an energy and writes nothing', () => {
        fs.rmSync(path.join(dir, 'out.json'), { force: true })
        const r = run({ hit: 1 })
        expect(r.status).toBe(1)
        expect(r.stdout).toContain('low: no energy')
        expect(fs.existsSync(path.join(dir, 'out.json'))).toBe(false)
    })
})

describe.skipIf(!hasPython)('look_energy.py', () => {
    it('keys a named lamp like namedPositionKey (case and dots kept) and counts a group the look names', () => {
        const ent = (id, pos, type, cd) => ({ id, components: { fixture: { position: pos, type }, light: { intensity: cd, angle: 0.1 }, beam: { haze: 1 } } })
        const doc = { document: {
            entities: [ent('a', 'named v1 line-A-in15.1', 'up-x', 100), ent('b', 'named v1 line-A-in15.1', 'up-x', 100),
                { id: 'rig-show', components: { rigLooks: { looks: [{ id: 'one', levels: { 'named-v1-line-A-in15.1/up-x': 0.5 } }] } } }],
            mappingState: { cues: [{ name: 'One', lightLook: 'rig-one' }] } } }
        const out = path.join(dir, 'le.json')
        const r = spawnSync('python3', ['-I', path.join(here, 'look_energy.py'), '--doc', f('d.json', doc), '--json', out], { encoding: 'utf8' })
        expect(r.status, r.stderr).toBe(0)
        const [row] = JSON.parse(fs.readFileSync(out, 'utf8'))
        expect([row.named, row.on, row.full, row.floor40, row.mean]).toEqual([2, 2, 0, 2, 0.5])
    })
})
