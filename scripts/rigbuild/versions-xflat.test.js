// @vitest-environment node
// MOXIR 17.10, the candidate "Minimal · X lying down" (RIG_BUILD.md §15.8): the owner's sketch's
// option 2, built beside Minimal to compare. The safety tests it shares with the versions run in
// versions.test.js; here what is its own — the X, how it hangs, what holds it still, its loads.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { RIG_PREFIX, buildRig, soloKeeps, stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import { findVersion, rigFileOf, RIGS_DIR, versionRig, VERSIONS_FILE } from './versions.mjs'
import { piecesFromRigBoxes } from './load-plot.mjs'
import { groupKeys } from './looks.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const rig = read(rigFileOf(spec.set, 'minimal-xflat-heads'))
const fixed = read(rigFileOf(spec.set, 'minimal-xflat'))
// The X was designed on Minimal as it was BEFORE the cut (2026-09-29, #664 made Minimal the cut's
// fixed lights); the versions file keeps that Minimal in cutHistory, and it is what the X keeps.
const minimal = versionRig({
    spec: { ...spec, versions: [spec.cutHistory['minimal-before-the-cut'], ...spec.versions.filter((v) => v.id !== 'minimal')] },
    base: read(path.join(RIGS_DIR, spec.base)),
    id: 'minimal'
})
const stage = stageFrame(rig, hall)
const crane = stage.crane
const built = (look) => buildRig(rig, hall, { geometry, manifest, look })
const lampsOf = (b, group) => b.entities.filter((e) => e.id.startsWith(`${RIG_PREFIX}${group}-`))

describe('Minimal · X lying down · heads (the moving-head variant)', () => {
    it('is a candidate of Minimal, not one of the three the set compares', () => {
        expect(spec.versions.map((v) => v.id)).toEqual(['minimal', 'minimal-cut-movers', 'middle', 'full'])
        expect((spec.candidates || []).map((v) => v.id)).toContain('minimal-xflat-heads')
        expect(findVersion(spec, 'minimal-xflat-heads').candidateOf).toBe('minimal')
        expect(rig.variant.title).toBe('Minimal · X lying down · heads')
    })

    it('keeps Minimal\'s floor and columns as they were when it was drawn (before the cut); only what hangs changes', () => {
        const floor = (r) => r.groups.filter((g) => !['truss-top', 'truss-header', 'x-top', 'x-under'].includes(g.mount))
        expect(floor(rig)).toEqual(floor(minimal))
        // 7 B380F + 2 strobes on the X, the 4 red PARs grazing the bridge kept
        const on = (r) => r.groups.filter((g) => ['truss-top', 'truss-header', 'x-top', 'x-under'].includes(g.mount)).map((g) => [r.classes[g.class].code, g.count])
        expect(on(rig)).toEqual([['UP-B380F', 7], ['UP-PL5403', 4], ['EXT-STROBE', 2]])
    })

    it('crosses two 5 m arms flat under the bridge over the DJ, one arm out over the crowd', () => {
        expect(rig.truss.kind).toBe('crane-x')
        expect(stage.trussZ).toBe(crane.z_m)
        const b = built()
        const x = b.entities.find((e) => e.id === 'rig-truss-header').components.transform
        const z = b.entities.find((e) => e.id === 'rig-truss-z-arm').components.transform
        expect(x.scale).toEqual([5, 0.29, 0.29])
        expect(z.scale).toEqual([0.29, 0.29, 5])
        expect(x.position[1]).toBe(rig.truss.trim_m)
        // the crowd arm's end is past the audience-side girder's outer face, over the crowd side
        expect(z.position[2] + 2.5).toBeGreaterThan(crane.z_m + Math.max(...crane.girders_dz_m) + crane.girder_w_m / 2)
    })

    it('hangs at the shortest drop its bridles and hoists allow at the modelled girder', () => {
        // apex of the widest (90°) bridle: half its span under the flange; the hoist's minimum 0.50 m; shackles 0.10 m
        const span = Math.max(...crane.girders_dz_m) - Math.min(...crane.girders_dz_m)
        const top = crane.girder_bottom_m - span / 2 - 0.5 - 0.1
        expect(rig.truss.trim_m).toBeLessThanOrEqual(top - 0.29 + 1e-9)
        expect(rig.truss.trim_m).toBeGreaterThan(top - 0.29 - 0.05)
    })

    it('draws each of its 4 picks as a two-leg bridle at 90°, a climbing hoist, a safety steel — and 8 restraint steels', () => {
        const b = built()
        const ids = b.entities.map((e) => e.id)
        for (let n = 1; n <= 4; n++) {
            for (const part of ['leg-1', 'leg-2', 'clamp-1', 'clamp-2', 'hoist', 'chain', 'steel']) expect(ids, `pick ${n} ${part}`).toContain(`${RIG_PREFIX}xpick-${n}-${part}`)
            // the legs meet at the apex at 90°
            const [a, c] = ['leg-1', 'leg-2'].map((l) => b.entities.find((e) => e.id === `${RIG_PREFIX}xpick-${n}-${l}`).components.transform.rotation)
            const dirOf = ([rx, , rz]) => [-Math.sin(rz), Math.cos(rz) * Math.cos(rx), Math.cos(rz) * Math.sin(rx)]
            const [u, v] = [dirOf(a), dirOf(c)]
            expect(Math.acos(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) * 180 / Math.PI).toBeCloseTo(90, 3)
        }
        expect(ids.filter((id) => id.startsWith(`${RIG_PREFIX}xtie-`))).toHaveLength(8)
    })

    it('writes its loads from the makers\' figures, the design case and the sign-off owed', () => {
        const l = rig.truss.rigging.load
        expect(l.truss_kg[0]).toBeCloseTo(4 * 13.17 + 10.44, 1)
        expect(l.lamps_kg).toBeCloseTo(7 * 23 + 4 * 8 + 2 * 7.8, 1)
        expect(l.points).toBe(4)
        expect(l.on_crane_kg[0]).toBe(Math.round(l.total_kg[0] + l.hoists_kg + l.chain_kg + l.hardware_kg))
        expect(l.per_point_design_kg[0]).toBe(Math.round(l.on_crane_kg[0] / 2))
        expect(rig.truss.rigging.signoff).toMatch(/rigging sign-off owed \(crane rated load, lock-out, hoists \+ safety steels\)/)
    })

    it('limits the heads\' moves by the pendulum it would be: T = 2π√(L/g)', () => {
        const m = rig.truss.motion
        m.pendulum_L_m.forEach((L, i) => expect(m.pendulum_T_s[i]).toBeCloseTo(2 * Math.PI * Math.sqrt(L / 9.81), 2))
        expect(m.rules.join(' ')).toMatch(/faster than 4 s/)
        expect(m.rules.join(' ')).toMatch(/period between 1\.7 and 4 s/)
        // the band covers 0.7× the shortest to 1.5× the longest period
        expect(1.7).toBeLessThanOrEqual(0.7 * m.pendulum_T_s[0])
        expect(4).toBeGreaterThanOrEqual(1.4 * m.pendulum_T_s[1])
    })

    it('four rays: only the 4 ends lit, each out along its own arm, one of them over the crowd', () => {
        const lamps = lampsOf(built('white-cathedral'), 'beam380-x')
        const lit = lamps.filter((e) => e.components.light.intensity > 0)
        expect(lit).toHaveLength(4)
        const dirs = lit.map((e) => spotAimDirection(e.components.transform.rotation))
        for (const d of dirs) expect(d[1]).toBeCloseTo(Math.sin(40 * Math.PI / 180), 2)
        expect(dirs.filter((d) => d[2] > 0.5)).toHaveLength(1) // the crowd ray
        expect(dirs.filter((d) => d[2] < -0.5)).toHaveLength(1)
        expect(dirs.filter((d) => Math.abs(d[0]) > 0.5)).toHaveLength(2)
    })

    it('the cross: two beams meet over the DJ\'s head — never through the DJ (the safety tests check the box)', () => {
        const b = built('one-beam')
        const lit = lampsOf(b, 'beam380-x').filter((e) => e.components.light.intensity > 0)
        expect(lit).toHaveLength(2)
        const [p, q] = lit.map((e) => [e.components.transform.position, spotAimDirection(e.components.transform.rotation)])
        // the two lines' closest approach: they cross (within 5 cm) above the DJ's head (deck 1.2 + 2 m)
        const w = p[0].map((v, k) => v - q[0][k])
        const a = p[1].reduce((s, v, k) => s + v * p[1][k], 0)
        const bb = p[1].reduce((s, v, k) => s + v * q[1][k], 0)
        const c = q[1].reduce((s, v, k) => s + v * q[1][k], 0)
        const d = p[1].reduce((s, v, k) => s + v * w[k], 0)
        const e = q[1].reduce((s, v, k) => s + v * w[k], 0)
        const t = (bb * e - c * d) / (a * c - bb * bb)
        const u = (a * e - bb * d) / (a * c - bb * bb)
        const P = p[0].map((v, k) => v + t * p[1][k])
        const Q = q[0].map((v, k) => v + u * q[1][k])
        expect(Math.hypot(...P.map((v, k) => v - Q[k]))).toBeLessThan(0.05)
        expect(P[1]).toBeGreaterThan(1.2 + 2)
        expect(Math.abs(P[0])).toBeLessThan(0.05)
        expect(b.summary.clashes).toEqual([])
    })

    it('the sign: all seven lie along the arms', () => {
        const lamps = lampsOf(built('slow-sweep'), 'beam380-x')
        expect(lamps.every((e) => e.components.light.intensity > 0)).toBe(true)
        for (const e of lamps) expect(Math.abs(spotAimDirection(e.components.transform.rotation)[1])).toBeLessThan(Math.sin(12 * Math.PI / 180))
    })

    it('a mask keeps the ranks it names; the room reads the same number', () => {
        expect([0, 1, 2, 3, 4, 5, 6].filter((r) => soloKeeps({ solo_mask: 85 }, r))).toEqual([0, 2, 4, 6])
        expect([0, 1, 2, 3, 4, 5, 6].filter((r) => soloKeeps({ solo_mask: 65 }, r))).toEqual([0, 6])
        expect(soloKeeps({ solo: 3 }, 3)).toBe(true)
        expect(soloKeeps({}, 5)).toBe(true)
    })

    it('lays the arms as four half-arm runs of stock truss, the junction left as the rig\'s box', () => {
        const pieces = piecesFromRigBoxes(built().entities)
        const arms = pieces.filter((p) => p.id.startsWith('rig-x-'))
        expect(arms).toHaveLength(4)
        expect(arms.every((p) => p.kind === 'truss-2m')).toBe(true)
        expect(pieces.some((p) => p.replaces === 'rig-truss-header') && pieces.some((p) => p.replaces === 'rig-truss-z-arm')).toBe(true)
    })

    it('its lamps land on the room\'s looks by position and type (view C)', () => {
        expect([...groupKeys(rig).entries()].filter(([g]) => g.endsWith('-x') || g.endsWith('-x-bridge'))).toEqual([
            ['beam380-x', 'truss-top/up-b380f'], ['par-x-bridge', 'truss-top/up-pl5403'], ['strobe-x', 'truss/ext-strobe']
        ])
    })
})

// The owner, 2026-09-29: the first version of each design is SIMPLE — no moving heads, only the
// rental house's own fixed lights (UP-PL5403 stock 50, UP-COB200 stock 8; the house has no strobes).
describe('Minimal · X lying down (the simple version: fixed lights only)', () => {
    const fstage = stageFrame(fixed, hall)
    const house = read('scripts/rigbuild/rentals/moxir-2026-10-17.json').rentalList.catalogue
    const stock = Object.fromEntries(house.map((c) => [c.code, c.stock]))
    it('hangs the same X, and only the rental house\'s fixed lights, within its stock', () => {
        expect(fixed.truss).toEqual({ ...rig.truss, rigging: { ...rig.truss.rigging, load: fixed.truss.rigging.load } })
        expect(fstage.xArm).toEqual(stage.xArm)
        const counts = {}
        for (const g of fixed.groups) counts[fixed.classes[g.class].code] = (counts[fixed.classes[g.class].code] || 0) + g.count
        expect(Object.keys(counts).sort()).toEqual(['UP-COB200', 'UP-PL5403'])
        for (const [code, n] of Object.entries(counts)) expect(n, code).toBeLessThanOrEqual(stock[code])
        expect(Object.values(fixed.classes).some((c) => ['beam380', 'bsw250', 'beeEye', 'strobe', 'blinder', 'laser'].includes(c.fixture))).toBe(false)
    })
    it('never moves a lamp between cues: every look keeps the get-in focus (colour and level only)', () => {
        const poses = Object.keys(fixed.looks).map((look) => Object.fromEntries(buildRig(fixed, hall, { geometry, manifest, look }).entities
            .filter((e) => e.type === 'spotLight').map((e) => [e.id, [...e.components.transform.position, ...e.components.transform.rotation]])))
        for (const p of poses.slice(1)) expect(p).toEqual(poses[0])
    })
    it('four blades: 12 PARs under the arms, 3 a half-arm, each down and out along its own arm', () => {
        const lamps = lampsOf(buildRig(fixed, hall, { geometry, manifest, look: 'white-cathedral' }), 'par-x-blades')
        expect(lamps).toHaveLength(12)
        for (const e of lamps) {
            const d = spotAimDirection(e.components.transform.rotation)
            const [x, , z] = e.components.transform.position
            expect(d[1]).toBeCloseTo(-Math.sin(70 * Math.PI / 180), 2) // 20° off straight down
            // outward: the horizontal part points away from the crossing
            expect(d[0] * x + d[2] * (z - fstage.trussZ)).toBeGreaterThan(0)
        }
    })
    it('one blade: only the crowd arm\'s three', () => {
        const lit = lampsOf(buildRig(fixed, hall, { geometry, manifest, look: 'one-beam' }), 'par-x-blades').filter((e) => e.components.light.intensity > 0)
        expect(lit).toHaveLength(3)
        for (const e of lit) expect(e.components.transform.position[2]).toBeGreaterThan(fstage.trussZ)
    })
    it('the hit: the 4 COBs, out along their arms, and nothing else', () => {
        const b = buildRig(fixed, hall, { geometry, manifest, look: 'strobe-hit' })
        const lit = b.entities.filter((e) => e.type === 'spotLight' && e.components.light.intensity > 0)
        expect(lit.map((e) => e.id).every((id) => id.startsWith(`${RIG_PREFIX}cob-x-ends-`))).toBe(true)
        expect(lit).toHaveLength(4)
    })
    it('weighs less than the heads variant, loads from the makers\' figures', () => {
        const l = fixed.truss.rigging.load
        expect(l.lamps_kg).toBeCloseTo(16 * 8 + 4 * 5.1, 1)
        expect(l.total_kg[0]).toBeLessThan(rig.truss.rigging.load.total_kg[0])
    })
})

describe('the X\'s shows (document cue lists, show-loop.mjs --doc-only)', () => {
    for (const [file, id] of [['moxir-xflat.json', 'minimal-xflat'], ['moxir-xflat-heads.json', 'minimal-xflat-heads']]) {
        const show = read(`scripts/rigbuild/shows/${file}`)
        const r = read(rigFileOf(spec.set, id))
        it(`${file}: plays the candidate's five looks, into its own project, looping`, () => {
            expect(show.project).toBe(`moxir-hall-${id}`)
            expect(show.cues.map((c) => c.look).sort()).toEqual(Object.keys(r.looks).sort())
            expect(show.loop).toBe(true)
        })
    }
    it('the heads\' show moves no head in under 4 s (the X is hung: truss.motion)', () => {
        const show = read('scripts/rigbuild/shows/moxir-xflat-heads.json')
        const r = read(rigFileOf(spec.set, 'minimal-xflat-heads'))
        const aimOf = (look) => JSON.stringify(r.looks[look].aims['beam380-x'])
        show.cues.forEach((c, i) => {
            const prev = show.cues[(i - 1 + show.cues.length) % show.cues.length]
            // a cue that re-aims the heads while they are LIT fades over at least 4 s; the hit puts them out
            const lit = (r.looks[c.look].levels?.['beam380-x'] ?? 1) > 0
            if (aimOf(c.look) !== aimOf(prev.look) && lit) expect(c.fade, c.look).toBeGreaterThanOrEqual(4)
        })
    })
})
