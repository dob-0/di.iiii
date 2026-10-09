// MOXIR v2 after the owner's look at B tuned (2026-10-09, PR #853): the stage lit from the audience side, the cut kept at 10, the
// six LaserCubes on the free crane at z -12 exactly as the laser session gave them (moxir_v2_spread.py build). The spread into the
// audience half is ON HOLD (the owner paints the areas): this file guards only what is built.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { v1Entities, v1Looks } from '../rigbuild/epic-build.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, 'rigs', f), 'utf8'))
const T = read('moxir-v2-planes-tuned-2026-10-09.json')
const N = read('moxir-v2-stage-lasers-2026-10-09.json')
const count = (rig, type) => rig.fixtures.filter((f) => f.type === type).length
const DJ_EYE = [-5.2, 2.03, 4.3]
const sub = (a, b) => a.map((v, i) => v - b[i])
const len = (v) => Math.hypot(...v)

// the light's direction from the room's Euler XYZ (a spot's unrotated beam points -Y), as lights_beta_options.aim_dir
const aimDir = ([a, b, c]) => {
    const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
    const m = [[cb * cc, -cb * sc, sb], [sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb], [-ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb]]
    return [-m[0][1], -m[1][1], -m[2][1]]
}

describe('MOXIR v2 B tuned + the stage + the lasers', () => {
    it('is the same kit: 18 B380F, 50 PL5403, 1 smoke machine, and now the 6 cubes hung', () => {
        for (const [type, n] of [['up-b380f', 18], ['up-pl5403', 50], ['up-yz31p', 1], ['ext-lc-ultra-mk2', 6]]) expect(count(N, type)).toBe(n)
        expect(N.not_hung.find((r) => r.code === 'EXT-LC-ULTRA-MK2')).toMatchObject({ hung: 6, not_hung: 0 })
    })
    it('keeps the cut at 10 PARs, no moving head on it, and says why from the measured table', () => {
        expect(N.fixtures.filter((f) => f.part.startsWith('cut')).length).toBe(10)
        expect(N.fixtures.filter((f) => f.part.startsWith('cut') && f.type !== 'up-pl5403')).toHaveLength(0)
        const c = N.review.cut
        expect(c['10'].worst_pick_kg).toBeLessThanOrEqual(146)
        expect(c['12'].shafts_separate_pct_25).toBeLessThan(100)
        expect(c['10'].dj_face_lx_full).toBe(0) // it hangs behind the DJ: it cannot light his face
    })
    it('lights the DJ from the audience side, never inside 20 deg of his eye line toward the crowd', () => {
        const keys = N.fixtures.filter((f) => f.part === 'stage key')
        expect(keys).toHaveLength(2)
        for (const f of keys) {
            const v = sub(f.p, DJ_EYE)
            const deg = (Math.acos(v[2] / len(v)) * 180) / Math.PI
            expect(deg).toBeGreaterThanOrEqual(20)
            expect(f.p[2]).toBeGreaterThan(DJ_EYE[2]) // in front of him
            // aimed back at the stage (-z), so no one on the floor looks into it
            expect(aimDir(f.r)[2]).toBeLessThan(0)
        }
        expect(N.review.dj_glare_all_at_full.ok).toBe(true)
        for (const lk of ['dark', 'peak']) {
            const lx = N.review.stage_light_after[lk].room_30478cd['DJ face'].lx
            expect(lx).toBeGreaterThanOrEqual(30)
            expect(lx).toBeLessThanOrEqual(80)
            expect(N.review.stage_light_before[lk].room_30478cd['DJ face'].lx).toBe(0)
        }
    })
    it('takes the four front PARs from the far end and leaves every other unit where B tuned had it', () => {
        const moved = new Set(N.review.moves.map((m) => m.id))
        expect([...moved].sort()).toEqual(['rig-par-planes-23', 'rig-par-planes-24', 'rig-par-planes-25', 'rig-par-planes-28'])
        for (const f of T.fixtures) {
            if (moved.has(f.id)) continue
            expect(N.fixtures.find((g) => g.id === f.id).p).toEqual(f.p)
        }
    })
    it('hangs the cubes exactly as the laser session committed them (git cf954908), the crane travel the owner\'s decision', () => {
        let given
        try {
            given = JSON.parse(execFileSync('git', ['show', 'cf954908:scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json'], { cwd: here, encoding: 'utf8', maxBuffer: 1 << 26 }))
        } catch {
            return // a shallow clone without that commit: the data check needs it (CI fetches full history)
        }
        const cubes = given.fixtures.filter((f) => f.type === 'ext-lc-ultra-mk2')
        for (const c of cubes) {
            const n = N.fixtures.find((f) => f.id === c.id)
            expect(n.p).toEqual(c.p)
            expect(n.laser.beams).toEqual(c.laser.beams)
        }
        expect(N.far_crane).toMatchObject({ show_z_m: -12, was_z_m: -41 })
        expect(N.far_crane.decision).toMatch(/owner 2026-10-09, crane travel confirmed/)
        expect(N.far_crane.owed.join(' ')).toMatch(/inspection/)
        expect(N.far_crane.owed.join(' ')).toMatch(/v10/)
    })
    it('enters no laser tube with any unit body, stand or the smoke machine', () => {
        expect(N.checks.laser_tubes_entered).toEqual([])
        for (const c of N.review.laser_clearance) expect(c.margin_m).toBeGreaterThan(0)
    })
    it('builds: the room draws the 6 laser lines, and every look holds only parts the rig has', () => {
        const ents = v1Entities(N)
        expect(ents.filter((e) => e.id.startsWith('rig-laser-'))).toHaveLength(6)
        const parts = new Set(N.fixtures.map((f) => f.part))
        for (const lk of N.looks) for (const p of Object.keys(lk.parts)) expect(parts.has(p) || p === 'laser').toBe(true)
        const looks = v1Looks(N, ents, { axis: 0.13, stage: { front: 5.65, into: 1 } }, 'x.json')
        expect(looks.looks.map((l) => l.id)).toEqual(['black', 'dark', 'peak'])
    })
})
