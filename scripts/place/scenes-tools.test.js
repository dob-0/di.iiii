// scenes_build.py, scenes_outside_rule.py, laser_design.py (migrated 2026-10-15, rows N811.1 N811.3 N811.4): the show's scenes tools,
// generic (no production name in any default). Holds: the committed 50-scene fixture passes the check; a spec round-trips to the same
// scenes; floor/cap/cue derivation; bad input fails; the outside rule merges parts and re-parts fixtures; a laser design is validated
// with laser_frames.py before it is written, dry run writes nothing, --clear undoes it.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import json'], { encoding: 'utf8' }).status === 0
const py = (script, args) => spawnSync('python3', ['-I', path.join(here, script), ...args], { encoding: 'utf8' })
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scenes-tools-'))
const wr = (dir, name, obj) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(obj)); return p }
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const fixture = path.join(here, 'rigs', 'moxir-scenes-50-2026-10-15.json')

describe.skipIf(!hasPython)('scenes_build.py', () => {
    it('--help runs and the 50-scene fixture passes the check', () => {
        expect(py('scenes_build.py', ['--help']).status).toBe(0)
        const r = py('scenes_build.py', ['--check', fixture])
        expect(r.status, r.stderr).toBe(0)
        expect(r.stdout).toContain('50 scenes')
    })
    it('a spec built from the fixture (floor kept explicit) gives the same scenes', () => {
        const d = tmp(), f = rd(fixture)
        const spec = { what: f.what, config: { floor: {} }, scenes: f.scenes.map((s) => ({ ...s, fade_s: s.cue.fade_s, hold_s: s.cue.hold_s, floor: false })) }
        spec.config.cap_parts = ['laser']; spec.config.desk_caps = f.scenes.find((s) => s.desk_caps).desk_caps
        const out = path.join(d, 'out.json')
        const r = py('scenes_build.py', ['--spec', wr(d, 'spec.json', spec), '--out', out])
        expect(r.status, r.stderr).toBe(0)
        const o = rd(out)
        const keys = ['id', 'title', 'act', 'intent', 'parts', 'motion', 'heads', 'laser_colour', 'desk_caps', 'cue', 'notes']
        expect(o.scenes.map((s) => Object.fromEntries(keys.map((k) => [k, s[k]])))).toEqual(f.scenes.map((s) => Object.fromEntries(keys.map((k) => [k, s[k]]))))
        expect(o.loop_s).toBe(f.loop_s)
    })
    it('derives floor strips, cue and desk caps; a scene own part and floor:false win', () => {
        const d = tmp()
        const spec = {
            config: { floor: { parts: ['fl'], per_act: { 1: ['#112233', 0.4], 2: ['#445566', 0.5] } }, cap_parts: ['laser'], desk_caps: { laser: { fader: 0.16 } } },
            scenes: [
                { id: 'a', title: 'A', act: 1, parts: { x: ['#ffffff', 1] }, fade_s: 2, hold_s: 8 },
                { id: 'b', title: 'B', act: 2, parts: { laser: ['#00ff00', 0.5], fl: ['#abcdef', 0.1] } },
                { id: 'c', title: 'C', act: 2, parts: {}, floor: false, floor_colour: ['#000000', 0] }
            ]
        }
        const out = path.join(d, 'o.json')
        expect(py('scenes_build.py', ['--spec', wr(d, 's.json', spec), '--out', out]).status).toBe(0)
        const o = rd(out)
        expect(o.scenes[0].parts.fl).toEqual(['#112233', 0.4])
        expect(o.scenes[1].parts.fl).toEqual(['#abcdef', 0.1])
        expect(o.scenes[2].parts).toEqual({})
        expect(o.scenes[1].desk_caps).toEqual({ laser: { fader: 0.16 } })
        expect(o.scenes[0].desk_caps).toBeNull()
        expect(o.loop_s).toBe(10 + 27 + 27)
    })
    it('fails on a duplicate id, a bad colour, a level over 1 and a part outside config.parts', () => {
        const d = tmp()
        const bad = (scenes, cfg = {}) => py('scenes_build.py', ['--spec', wr(d, 'b.json', { config: cfg, scenes }), '--out', path.join(d, 'x.json')])
        const ok = { id: 'a', title: 'A', act: 1, parts: { x: ['#ffffff', 1] } }
        expect(bad([ok, ok]).stderr).toContain('duplicate id')
        expect(bad([{ ...ok, parts: { x: ['white', 1] } }]).stderr).toContain('not [#rrggbb, level]')
        expect(bad([{ ...ok, parts: { x: ['#ffffff', 1.5] } }]).stderr).toContain('not in 0..1')
        expect(bad([ok], { parts: ['y'] }).stderr).toContain('not in config.parts')
    })
})

describe.skipIf(!hasPython)('scenes_outside_rule.py', () => {
    const files = () => {
        const d = tmp()
        const sc = wr(d, 's.json', { palette: [], scenes: [{ id: 'a', parts: { w: ['#111111', 0.3], c: ['#222222', 0.8], keep: ['#333333', 1] } }, { id: 'b', parts: { keep: ['#333333', 1] } }] })
        const rig = wr(d, 'r.json', { fixtures: [{ id: 1, part: 'w', p: [0, 0, 60] }, { id: 2, part: 'c', p: [-40, 0, 0] }, { id: 3, part: 'keep', p: [0, 0, 99] }] })
        return { sc, rig }
    }
    const args = (f, more = []) => ['--scenes', f.sc, '--rig', f.rig, '--old-parts', 'w,c', '--road-hex', '#a5ff0f', '--entrance-hex', '#e04e00', ...more]
    it('has no defaults for colours or old parts', () => {
        expect(py('scenes_outside_rule.py', ['--scenes', 'a', '--rig', 'b']).status).not.toBe(0)
        expect(py('scenes_outside_rule.py', ['--help']).status).toBe(0)
    })
    it('dry run writes nothing; --apply merges parts, re-parts fixtures by the split and keeps a .bak', () => {
        const f = files(), before = fs.readFileSync(f.sc, 'utf8')
        expect(py('scenes_outside_rule.py', args(f)).status).toBe(0)
        expect(fs.readFileSync(f.sc, 'utf8')).toBe(before)
        const r = py('scenes_outside_rule.py', args(f, ['--apply']))
        expect(r.status, r.stderr).toBe(0)
        const s = rd(f.sc), rig = rd(f.rig)
        expect(s.scenes[0].parts).toEqual({ keep: ['#333333', 1], road: ['#a5ff0f', 0.8], entrance: ['#e04e00', 0.8] })
        expect(s.scenes[1].parts.road).toEqual(['#a5ff0f', 0.5])
        expect(s.scenes[1].parts.entrance).toEqual(['#e04e00', 0.6])
        expect(rig.fixtures.map((x) => x.part)).toEqual(['entrance', 'road', 'keep'])
        expect(s.palette.map((p) => p.hex)).toEqual(['#a5ff0f', '#e04e00'])
        expect(fs.existsSync(f.sc + '.bak')).toBe(true)
        expect(JSON.stringify(rd(f.sc + '.bak'))).toContain('"w"')
    })
})

describe.skipIf(!hasPython)('laser_design.py', () => {
    const design = path.join(here, 'rigs', 'moxir-laser-design-2026-10-15.json')
    it('the committed design validates against laser_frames.py and applies to the fixture; --clear undoes it', () => {
        const d = tmp(), s = path.join(d, 's.json')
        fs.copyFileSync(fixture, s)
        const dry = py('laser_design.py', ['--scenes', s, '--design', design])
        expect(dry.status, dry.stderr).toBe(0)
        expect(dry.stdout).toContain('21 of 50')
        expect(fs.readFileSync(s, 'utf8')).toBe(fs.readFileSync(fixture, 'utf8'))
        expect(py('laser_design.py', ['--scenes', s, '--design', design, '--apply']).status).toBe(0)
        expect(rd(s).scenes.filter((x) => x.laser).length).toBe(21)
        expect(fs.existsSync(path.join(d, 's.pre-laser.json'))).toBe(true)
        expect(py('laser_design.py', ['--scenes', s, '--clear', '--apply']).status).toBe(0)
        expect(rd(s).scenes.filter((x) => x.laser).length).toBe(0)
    })
    it('refuses an unknown scene and an invalid laser object, writing nothing', () => {
        const d = tmp(), s = wr(d, 's.json', { scenes: [{ id: 'a' }] })
        const r1 = py('laser_design.py', ['--scenes', s, '--design', wr(d, 'd1.json', { design: { zzz: null } }), '--apply'])
        expect(r1.status).not.toBe(0); expect(r1.stderr).toContain('unknown scene: zzz')
        const r2 = py('laser_design.py', ['--scenes', s, '--design', wr(d, 'd2.json', { design: { a: { pattern: 'nope' } } }), '--apply'])
        expect(r2.status).not.toBe(0); expect(r2.stderr).toContain('pattern')
        expect(rd(s)).toEqual({ scenes: [{ id: 'a' }] })
    })
})
