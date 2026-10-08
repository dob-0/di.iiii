// lasers_v2.py (2026-10-08): the 6 lasers as the owner repainted them. The test runs --check (the model only) and holds
// what the page claims: every one of the 12 beams ends on its named steel stop (the near crane's back girder, the side
// spans' far runway girders) over its whole controller zone, never past the truss plane, >= 3 m over floors, the mirror
// worst case staying behind the stage; all three far-trio options pass (b with cube 3 moved for the far crane's cab);
// and the hard precondition: with the near crane where the photos show it, stage-ward beams would fly to the entry end.
// Skipped when python3/numpy or the hall GLB (built by hall.py, not in git) is missing.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const hasPython = spawnSync('python3', ['-c', 'import numpy, PIL'], { encoding: 'utf8' }).status === 0
const GLB = '/mnt/data/footage/place-moxir-hall-v8-show-back21-2026-10-07/hall.glb'

describe.skipIf(!hasPython || !fs.existsSync(GLB))('lasers_v2.py --check', () => {
    let S, B
    beforeAll(() => {
        const run = spawnSync('python3', ['-I', path.join(here, 'lasers_v2.py'), '--repo', repo, '--check'],
            { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 256 * 1024 * 1024 })
        if (run.status !== 0) throw new Error(run.stderr)
        const out = JSON.parse(run.stdout)
        S = out.summary
        B = out.beams
    }, 300000)

    it('ends all 12 beams on their steel stops, behind the stage and over the 3 m line', () => {
        expect(S.beams).toBe(12)
        expect(S.pass).toBe(12)
        for (const b of B) {
            expect(b.errors, b.id).toEqual([])
            expect(Object.keys(b.ends)).toEqual([b.stop])
        }
        expect(S.max_z).toBeLessThanOrEqual(21)
        expect(S.min_over_floor_m).toBeGreaterThanOrEqual(3)
        expect(S.mirror_zmax).toBeLessThanOrEqual(21)
        expect(S.mirror_lowest_m).toBeGreaterThanOrEqual(3)
        expect(S.nohd.nohd_m).toBeGreaterThan(108)
    })

    it('measures all three homes for cubes 1-3, moving cube 3 only where the far crane stays', () => {
        expect(S.options.map(o => o.id)).toEqual(['a', 'b', 'c'])
        for (const o of S.options) expect(o.far_pass, o.id).toBe(6)
        expect(S.moved.a).toBeFalsy()
        expect(S.moved.b['3'].x).toBe(7.3)
        expect(S.options[0].far_seen_share).toBeGreaterThan(S.options[2].far_seen_share)
    })

    it('records the hard precondition: the near crane at z 21 is the beam stop', () => {
        const c = S.with_the_crane_as_photographed
        if (c == null) return
        expect(c.filter(x => x.end_z > 21).length).toBeGreaterThan(0)
    })
})
