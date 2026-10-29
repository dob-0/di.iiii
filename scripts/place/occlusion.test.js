// occlusion.py (2026-10-08): the BLOCKING pass on MOXIR beta v0.9's mixed light plot. Every beam (axis + a ring at
// half the beam angle) and every laser ray is cast against the hall GLB's triangles + the rig's solids. The test holds
// the pass's findings: the committed mix (c33b3d4b) has 11 beams blocked (8 arches by the space frame's bottom chord,
// the press crown's outer PAR by the side cabinets, the 2 vista PARs at z -36 by their column's X bracing), the fixed
// plot only the 2 kept vista PARs; every laser ray ends on the roof structure, never glass, never steel on the way.
// Skipped when python3/numpy or the hall GLB (built by hall.py, not in git) is missing.
// paint_zones.py: a synthetic painted plan (a red box, a green loop, the canvas shifted 7 px like GIMP did) is read
// back as zones at the right hall coordinates.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const hasPython = spawnSync('python3', ['-c', 'import numpy, PIL'], { encoding: 'utf8' }).status === 0
const GLB = '/mnt/data/footage/place-moxir-hall-v8-show-back21-2026-10-07/hall.glb'
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }

describe.skipIf(!hasPython || !fs.existsSync(GLB))('occlusion.py --check', () => {
    let O
    beforeAll(() => {
        const run = spawnSync('python3', ['-I', path.join(here, 'occlusion.py'), '--repo', repo, '--check'], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 })
        if (run.status !== 0) throw new Error(run.stderr)
        O = JSON.parse(run.stdout)
    }, 300000)

    it('names the permanent things of the whole building', () => {
        expect(O.triangles).toBeGreaterThan(50000)
        for (const c of ['space frame', 'column head', 'upper column', 'runway', 'crane', 'end wall', 'machine', 'lantern glass', 'roof deck']) {
            expect(O.classes[c], c).toBeGreaterThan(0)
        }
    })

    it('finds what blocks the committed mix', () => {
        const B = O.before
        expect(B.beams_blocked).toBe(11)
        const arches = B.beams.filter(b => b.group.startsWith('the column arch') && b.blocked_pct > 0)
        expect(arches.length).toBe(8)
        for (const b of arches) expect(b.blockers[0].what).toBe('space frame bottom chord')
        const press = B.beams.find(b => b.id === 'rig-par-press-sides-02')
        expect(press.blockers[0].what).toBe('press-side-cabinets')
        expect(press.blockers[0].t_min).toBeCloseTo(2.0, 1)
    })

    it('leaves only the 2 kept vista PARs blocked after the fixes', () => {
        const A = O.after
        expect(A.beams_blocked_ids).toEqual(['rig-par-vista-05', 'rig-par-vista-06'])
        for (const b of A.beams.filter(b => b.blocked_pct > 0)) expect(b.blocked_area_pct).toBeLessThan(2)
        expect(A.changes.length).toBe(3)   // arches 10 m, press row 0.4 m, cue ref3's pit pair 8 deg
    })

    it('ends every laser ray on the roof structure: no glass, no steel on the way, 0.3 m clear', () => {
        for (const R of [O.before, O.after]) {
            expect(R.lasers_pass).toBe(4)
            expect(R.laser_rays).toBe(180)
            expect(R.laser_rays_in_glass).toBe(0)
            expect(R.laser_rays_on_steel_not_roof).toBe(0)
            expect(R.laser_rays_within_0_3m).toBe(0)
            expect(R.laser_min_over_audience_m).toBeGreaterThanOrEqual(3)
        }
    })

    it('blocks no lit beam in any cue state after the fixes (before: the press PAR, 8 arches, and cue ref3\'s pit beam in the drum tank)', () => {
        expect(O.before.looks.ref3.blocked).toBe(1)
        for (const v of Object.values(O.after.looks)) expect(v.blocked, v.title).toBe(0)
    })
})

describe.skipIf(!hasPython)('paint_zones.py', () => {
    it('reads a painted box and a loop back in hall metres, through a 7 px layer offset', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-zones-'))
        const clean = path.join(dir, 'clean.png')
        const mk = spawnSync('python3', ['-I', path.join(here, 'paint_plan.py'), '--hall', path.join(here, 'rigs/moxir-hall-2026-10-07-v8-show-back21.hall.json'),
            '--stage', path.join(here, 'rigs/moxir-stage-line-2026-10-07.json'), '--out', clean], { encoding: 'utf8', env })
        expect(mk.status, mk.stderr).toBe(0)
        const paint = `
import sys
from PIL import Image, ImageDraw
im = Image.open(sys.argv[1]).convert('RGBA'); W, H = im.size
px = lambda x, z: (70 + (x + 14) * 40, 70 + (z + 2) * 40)
d = ImageDraw.Draw(im)
d.rectangle([px(-8, 30), px(-4, 36)], fill=(230, 20, 20, 255))          # a red box x -8..-4, z 30..36
d.ellipse([px(2, 2), px(10, 14)], outline=(40, 230, 40, 255), width=10)   # a green loop around x 2..10, z 2..14
out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); out.paste(im.crop((0, 0, W, H - 7)), (0, 7))   # GIMP's layer offset
out.save(sys.argv[2])`
        const painted = path.join(dir, 'painted.png')
        const p = spawnSync('python3', ['-I', '-c', paint, clean, painted], { encoding: 'utf8' })
        expect(p.status, p.stderr).toBe(0)
        const out = path.join(dir, 'zones.json')
        const r = spawnSync('python3', ['-I', path.join(here, 'paint_zones.py'), '--painted', painted, '--clean', clean, '--out', out], { encoding: 'utf8', env })
        expect(r.status, r.stderr).toBe(0)
        const Z = JSON.parse(fs.readFileSync(out, 'utf8'))
        expect(Z.shift_px).toEqual([0, 7])
        const red = Z.zones.filter(z => z.colour === 'red')
        expect(red.length).toBe(1)
        expect(red[0].bbox_x_m[0]).toBeCloseTo(-8, 0)
        expect(red[0].bbox_x_m[1]).toBeCloseTo(-4, 0)
        expect(red[0].bbox_z_m[0]).toBeCloseTo(30, 0)
        expect(red[0].bbox_z_m[1]).toBeCloseTo(36, 0)
        expect(red[0].painted_m2).toBeGreaterThan(22)
        expect(red[0].painted_m2).toBeLessThan(26)
        const green = Z.zones.filter(z => z.colour === 'green')
        expect(green.length).toBe(1)
        expect(green[0].kind).toBe('loop (encloses an area)')
        expect(green[0].encloses_m2).toBeGreaterThan(55)    // ellipse 8 x 12 m: pi * 4 * 6 = 75 m2 minus the stroke
        fs.rmSync(dir, { recursive: true, force: true })
    }, 120000)
})
