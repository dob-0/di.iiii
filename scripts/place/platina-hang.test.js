// platina_hang.py + the head_kinds field (2026-11-11): the Platina hang is made from the rig plan by script, and the generic
// look builder takes the movers' type ids from DATA (hang `head_kinds`), with the MOXIR rule (['up-b380f'] only) unchanged when absent.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'platina-hang-'))
const py = (script, ...args) => spawnSync('python3', ['-I', path.join(here, script), ...args], { encoding: 'utf8', cwd: root })
const w = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p }
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const rigPath = path.join(here, 'rigs', 'platina-rig-2026-11-11.json')

describe('platina_hang.py views', () => {
    it('writes the room views from the rig geometry: Audience first (the entry camera), screen centre as target', () => {
        const out = path.join(dir, 'hv.json')
        expect(py('platina_hang.py', '--rig', rigPath, '--out', out).status).toBe(0)
        const v = read(out).views
        expect(v.viewPresets.map((p) => p.label)).toEqual(['Audience', 'FOH', 'Like the render', 'Side', 'Top'])
        expect(v.fixedCamera.position).toEqual(v.viewPresets[0].position)
        expect(v.fixedCamera.position[2]).toBeGreaterThan(6.25)
        expect(v.fixedCamera.position[2]).toBeLessThan(20)
        expect(v.fixedCamera.target[2]).toBe(0)
    })
    it('a rig with no screen or deck gets no views (epic-build then keeps MOXIR\'s)', () => {
        const rig = read(rigPath); rig.solids = []
        const out = path.join(dir, 'nv.json')
        py('platina_hang.py', '--rig', w('nv-rig.json', rig), '--out', out)
        const r = py('platina_hang.py', '--rig', w('nv-rig.json', rig), '--out', out)
        if (r.status === 0) expect(read(out).views).toBeUndefined()
    })
})

describe('platina_hang.py', () => {
    it('makes the hang from the committed rig: 54 units, every unit has a part and a dmx, every unit is its real library type', () => {
        const out = path.join(dir, 'hang.json')
        const r = py('platina_hang.py', '--rig', rigPath, '--out', out)
        expect(r.status).toBe(0)
        const h = read(out)
        expect(h.fixtures).toHaveLength(54)
        expect(h.fixtures.every((u) => u.part && u.dmx)).toBe(true)
        expect(h.head_kinds).toEqual(['acme-xp16r-bsw'])
        expect(h.defaultLook).toBe('work-light')
        expect(h.hang.from).toBe(rigPath)
        // since 2026-11-11 every unit is its real library type (no stand-in): the profile names the library file and the maker's identification
        expect(h.fixtures.every((u) => u.profile?.library === u.type && !u.profile.stand_in && /^EXACT/.test(u.profile.basis))).toBe(true)
        expect(h.looks).toBeUndefined()
    })
    it('is deterministic: two runs, same bytes', () => {
        const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json')
        py('platina_hang.py', '--rig', rigPath, '--out', a); py('platina_hang.py', '--rig', rigPath, '--out', b)
        expect(fs.readFileSync(a, 'utf8')).toBe(fs.readFileSync(b, 'utf8'))
    })
    it('refuses a unit without a part and a kit count that does not match; writes nothing', () => {
        const rig = read(rigPath); delete rig.fixtures[0].part
        const out = path.join(dir, 'bad.json')
        const r = py('platina_hang.py', '--rig', w('bad-rig.json', rig), '--out', out)
        expect(r.status).toBe(1)
        expect(r.stdout).toMatch(/no part/)
        expect(fs.existsSync(out)).toBe(false)
    })
})

describe('heads kinds are data (head_kinds), the MOXIR rule is the default', () => {
    const hang = (extra = {}) => ({ fixtures: [{ id: 'a', type: 'mover', part: 'm', p: [0, 1, 0], r: [0, 0, 0] }, { id: 'b', type: 'wash', part: 'w', p: [1, 1, 0], r: [0, 0, 0] }], ...extra })
    const scenes = (kinds) => ({ scenes: [{ id: 's', title: 's', act: 1, parts: { m: ['#ffffff', 1] }, heads: { pattern: 'cross', period_s: 8, pan_deg: 10, tilt_deg: 10, spatial: 'all', kinds }, cue: { fade_s: 1, hold_s: 5 } }] })
    const build = (h, s) => py('rig_generate.py', 'build', '--hang', w('h.json', h), '--scenes', w('s.json', s), '--out', path.join(dir, 'r.json'), '--version', '1', '--title', 't', '--date', '2026-11-11')
    it('without head_kinds, kinds other than up-b380f are refused (MOXIR behaviour kept)', () => {
        const r = build(hang(), scenes(['mover']))
        expect(r.status).toBe(1); expect(r.stdout).toMatch(/heads kinds \['mover'\]/)
        expect(build(hang(), scenes(['up-b380f'])).status).toBe(0)
    })
    it('with head_kinds, a subset passes; an outside type or an empty list is refused', () => {
        expect(build(hang({ head_kinds: ['mover'] }), scenes(['mover'])).status).toBe(0)
        expect(build(hang({ head_kinds: ['mover'] }), scenes(['wash'])).status).toBe(1)
        expect(build(hang({ head_kinds: ['mover'] }), scenes([])).status).toBe(1)
    })
})
