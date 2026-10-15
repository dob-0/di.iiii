// scenes_sheet.py + laser_sheet.py (2026-10-15, migrated from the MOXIR scenes job): the sheets are generic. The test holds that a scene
// row is read only from the scenes file (title, parts, colour names, beams wheel slot, act names from the meta), that no production name
// appears when no meta is given, that the laser sheet draws one plan per lit scene from the plan's own bounds, and that the views file
// (look_shots.cjs input) is a list of named eye/at triples.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import json'], { encoding: 'utf8' }).status === 0

const scenes = {
    loop_s: 125,
    palette: [{ hex: '#00ff88', name: 'mint' }],
    beam_wheel: { '#00ff88': { slot: 'Green', hex: '#00cc66' } },
    scenes: [
        { id: 'a', title: 'First one', act: 1, intent: 'arrive', parts: { 'side line left': ['#00ff88', 0.5], floor: ['#112233', 0.2] },
          motion: { kinds: ['up-b380f'], mode: 'pulse', bpm: 120, spatial: 'x' }, heads: null, cue: { fade_s: 5, hold_s: 60 }, notes: '',
          laser: { pattern: 'fan-sweep', cubes: 'all', colour: '#00ff88', level: 0.1, tempo: { bpm: 120, beats: 8 }, phase: 'mirror', pitch_deg: 1,
                   yaw_deg: 2, spread_deg: 3, amplitude_deg: 4, hits: null, breathe: null, why: 'x', refs: ['t1'] } },
        { id: 'b', title: 'Second one', act: 2, intent: 'build', parts: { floor: ['#112233', 0.3] }, motion: null, heads: null,
          cue: { fade_s: 5, hold_s: 55 }, notes: 'a note', laser: null }
    ]
}
const plan = {
    summary: { ok: true, loop_s: 120, frames: 4, step_s: 30, scenes_lit: 1, scenes: 2 },
    cubes: [{ n: 1, id: 'c1', p: [0, 8, -10] }, { n: 2, id: 'c2', p: [3, 8, -10] }],
    scenes: [
        { id: 'a', group: [1], cycle_s: 8, laser: true, ends: { 'roof deck': { rays: 2, height_m: [13, 13] } }, max_field_deg: 5, flash_hz: 0,
          points_per_cube_frame: 10, points_cap: 1000, lowest_m: 8, fail_count: 0, rays: [{ cube: 1, from: [0, 8, -10], to: [-4, 13, 20], ends_on: 'roof deck' }] },
        { id: 'b', laser: false }
    ]
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sheets-'))
const put = (dir, n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); return p }
const py = (script, args) => spawnSync('python3', ['-I', path.join(here, script), ...args], { encoding: 'utf8' })

describe.skipIf(!hasPython)('scenes_sheet.py', () => {
    it('writes one row per scene with timing, colour names and the beam wheel slot, and names no production by default', () => {
        const dir = tmp(); const out = path.join(dir, 'o.html')
        const r = py('scenes_sheet.py', [put(dir, 's.json', scenes), out])
        const h = fs.readFileSync(out, 'utf8'); fs.rmSync(dir, { recursive: true, force: true })
        expect(r.status).toBe(0)
        expect(h).toContain('<title>Scenes</title>')
        expect(h).toContain('The 2 scenes')
        expect(h).toContain('at 0:00 &middot; fade 5 s &middot; hold 60 s')
        expect(h).toContain('at 1:05')                    // the second cue starts after 5 + 60 s
        expect(h).toContain('beams: Green')
        expect(h).toContain('mint')
        expect(h).toContain('beams: pulses at 120 bpm, left to right')
        expect(h).toContain('Act 1</h3>')
        expect(h.toLowerCase()).not.toContain('moxir')
    })
    it('takes the title, act names and front matter from the meta and front files', () => {
        const dir = tmp(); const out = path.join(dir, 'o.html')
        const meta = { title: 'My Show', acts: { 1: { name: 'Open', colour: 'cold' } } }
        py('scenes_sheet.py', [put(dir, 's.json', scenes), out, '--meta', put(dir, 'm.json', meta), '--front', put(dir, 'f.html', '<h2>FRONT</h2>')])
        const h = fs.readFileSync(out, 'utf8'); fs.rmSync(dir, { recursive: true, force: true })
        expect(h).toContain('<h1>My Show</h1>')
        expect(h).toContain('Act 1 &middot; Open')
        expect(h).toContain('Colour: cold')
        expect(h.indexOf('FRONT')).toBeLessThan(h.indexOf('The 2 scenes'))
    })
    it('builds the MOXIR sheet from the fixture on dev (50 scenes, five acts)', () => {
        const rigs = path.join(here, 'rigs'); const dir = tmp(); const out = path.join(dir, 'o.html')
        const r = py('scenes_sheet.py', [path.join(rigs, 'moxir-scenes-50-2026-10-15.json'), out, '--meta', path.join(rigs, 'moxir-scenes-50-sheet-meta-2026-10-15.json'),
            '--front', path.join(rigs, 'moxir-scenes-50-sheet-front-2026-10-15.html')])
        const h = fs.readFileSync(out, 'utf8'); fs.rmSync(dir, { recursive: true, force: true })
        expect(r.status).toBe(0)
        expect((h.match(/<article>/g) || []).length).toBe(50)
        expect((h.match(/<h3 id="act\d">/g) || []).length).toBe(5)
    })
})

describe.skipIf(!hasPython)('laser_sheet.py', () => {
    it('draws one plan per lit scene and a dark card for the rest, window from the plan when no site is given', () => {
        const dir = tmp(); const out = path.join(dir, 'o.html')
        const r = py('laser_sheet.py', [put(dir, 's.json', scenes), put(dir, 'p.json', plan), out])
        const h = fs.readFileSync(out, 'utf8'); fs.rmSync(dir, { recursive: true, force: true })
        expect(r.status).toBe(0)
        expect(r.stdout).toContain('1 drawn')
        expect((h.match(/<svg /g) || []).length).toBe(1)
        expect(h).toContain('cubes dark')
        expect(h).toContain('check: PASS')
        expect(h).toContain('(cap 0.16)')
        expect(h.toLowerCase()).not.toContain('moxir')
    })
    it('draws the site bay, bands and cranes when a site file is given', () => {
        const dir = tmp(); const out = path.join(dir, 'o.html')
        const site = { window: { z0: -20, z1: 30, x0: -10, x1: 10 }, bay: [-15, -8, 25, 8], bands: [[0, 10, -3, 3]], cranes: [5] }
        py('laser_sheet.py', [put(dir, 's.json', scenes), put(dir, 'p.json', plan), out, '--site', put(dir, 'site.json', site)])
        const h = fs.readFileSync(out, 'utf8'); fs.rmSync(dir, { recursive: true, force: true })
        expect(h).toContain('fill="#e8f0fb"')
        expect(h).toContain('stroke="#c0c4c8"')
    })
})

describe('views file', () => {
    it('is a list of named eye/at triples for look_shots.cjs', () => {
        const v = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'moxir-views-2026-10-15.json'), 'utf8'))
        expect(v.length).toBeGreaterThan(0)
        expect(new Set(v.map(x => x.name)).size).toBe(v.length)
        for (const x of v) for (const k of ['eye', 'at']) { expect(x[k]).toHaveLength(3); x[k].forEach(n => expect(Number.isFinite(n)).toBe(true)) }
    })
})
