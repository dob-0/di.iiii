// @vitest-environment node
// THE HALO — option 6 of the ten truss versions, built as comparison variants of Minimal
// (RIG_BUILD.md §15.8): a flat equilateral triangle of truss hung from the crane at its three
// corners. `minimal-halo` is the simple one (the rental house's fixed lights only, nothing
// moves); `minimal-halo-heads` carries the moving heads. The shared safety tests (every look:
// nothing refused, no clash, ≤ 8 real lights, mirror symmetry) run in versions.test.js.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { RIG_PREFIX, buildRig, performerBox, stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import { rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { variantOf } from './load-version.mjs'
import { showOfRig, cueOps, showCues } from './show-loop.mjs'
import { showDriver, showOf } from '../../src/rigbuild/showClock.js'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const minimal = read(rigFileOf(spec.set, 'minimal'))
const fixed = read(rigFileOf(spec.set, 'minimal-halo'))
const heads = read(rigFileOf(spec.set, 'minimal-halo-heads'))
const PRESS = hall.geometry.massing.find((m) => m.id === 'press')
const lampsOf = (built) => built.entities.filter((e) => e.type === 'spotLight')
const groupOf = (rig, id) => rig.groups.find((g) => id.startsWith(`${RIG_PREFIX}${g.id}-`))

describe('the halo: a flat equilateral triangle under the crane, over the DJ', () => {
    for (const rig of [fixed, heads]) {
        const stage = stageFrame(rig, hall)
        const h = stage.halo
        const built = buildRig(rig, hall, { geometry, manifest })
        it(`${rig.variant.id}: 4 m sides, its centroid on the bridge's centre line inside the DJ's box, apex to the crowd`, () => {
            const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
            for (const [a, b] of [[h.apex, h.left], [h.left, h.right], [h.right, h.apex]]) expect(d(a, b)).toBeCloseTo(4, 9)
            expect(h.centre[1]).toBe(stage.crane.z_m)
            const dj = performerBox(rig, stage).z
            expect(h.centre[1]).toBeGreaterThanOrEqual(dj[0])
            expect(h.centre[1]).toBeLessThanOrEqual(dj[1])
            expect(h.apex[1]).toBeGreaterThan(h.centre[1]) // +z = toward the crowd (the booth faces the entry)
            expect(h.apex[0]).toBe(0)
        })
        it(`${rig.variant.id}: bottom chord 6.0 m, the hoist stack fits under the girder, nothing over the press in plan`, () => {
            const sides = built.entities.filter((e) => /^rig-halo-side-\d$/.test(e.id))
            expect(sides).toHaveLength(3)
            for (const s of sides) expect(s.components.transform.position[1]).toBeCloseTo(6.0, 6)
            // every lamp on the halo, and the halo's steel, is out of the press's footprint (with the truss's half section)
            const t = stage.trussSection / 2
            for (const p of [h.apex, h.left, h.right]) expect(p[1] - t > PRESS.z_m[1] || p[0] + t < PRESS.x_m[0] || p[0] - t > PRESS.x_m[1]).toBe(true)
            for (const e of lampsOf(built).filter((x) => groupOf(rig, x.id).mount === 'halo')) {
                const [x, , z] = e.components.transform.position
                expect(z > PRESS.z_m[1] || x < PRESS.x_m[0] || x > PRESS.x_m[1], e.id).toBe(true)
            }
            // chain left between the hoist's hook and the top chord at every corner
            for (const c of ['apex', 'left', 'right']) {
                const chain = built.entities.find((e) => e.id === `${RIG_PREFIX}halo-chain-${c}`)
                expect(chain.components.transform.scale[1], c).toBeGreaterThan(0.1)
                const hoist = built.entities.find((e) => e.id === `${RIG_PREFIX}halo-hoist-${c}`)
                expect(hoist.components.transform.position[1] + hoist.components.transform.scale[1], c).toBeLessThan(stage.crane.girder_bottom_m)
            }
        })
        it(`${rig.variant.id}: 3 hoists, each on a two-leg bridle, 3 safety steels, the apex from an outrigger — the sign-off owed written down`, () => {
            expect(built.entities.filter((e) => /^rig-halo-hoist-/.test(e.id))).toHaveLength(3)
            expect(built.entities.filter((e) => /^rig-halo-bridle-/.test(e.id))).toHaveLength(6)
            expect(built.entities.filter((e) => /^rig-halo-steel-/.test(e.id))).toHaveLength(3)
            expect(built.entities.some((e) => e.id === `${RIG_PREFIX}halo-outrigger`)).toBe(true)
            expect(rig.truss.rigging.signoff).toMatch(/rigging sign-off owed \(crane rated load, lock-out, hoists \+ safety steels\)/)
            expect(rig.truss.rigging.signoff).toMatch(/OUTRIGGER/)
            // a bridle leg runs from the ring up to the girder (or the outrigger): its top end is at the steel it hangs from
            for (const leg of built.entities.filter((e) => /^rig-halo-bridle-(left|right)/.test(e.id))) {
                const { position, rotation, scale } = leg.components.transform
                const [rx, , rz] = rotation
                const top = position[1] + scale[1] * Math.cos(rz) * Math.cos(rx)
                expect(top).toBeCloseTo(stage.crane.girder_bottom_m, 3)
            }
        })
        it(`${rig.variant.id}: the corners carry the whole load (a rigid body on three points: barycentric shares), each well inside a 500 kg hoist`, () => {
            const load = rig.truss.rigging.load
            const sum = load.per_point_kg.apex + load.per_point_kg.left + load.per_point_kg.right
            expect(Math.abs(sum - load.total_kg)).toBeLessThanOrEqual(2)
            expect(load.per_point_kg.left).toBe(load.per_point_kg.right)
            for (const v of Object.values(load.per_point_kg)) expect(v).toBeLessThan(500 / 2) // a 2:1 margin before any dynamic factor
            expect(load.truss_kg).toBeCloseTo(3 * 16 + 3 * 8.8, 6) // Global Truss F34300 + F34C20, the maker's weights
            expect(load.outrigger.back_clamp_uplift_kg).toBeGreaterThan(0)
            const s = rig.truss.rigging.sway
            expect(s.period_s).toBeCloseTo(2 * Math.PI * Math.sqrt(s.pendulum_L_m / 9.81), 1)
        })
    }
})

describe('minimal-halo: simple — the rental house\'s fixed lights only, nothing moves', () => {
    it('uses no moving head, no strobe: UP-PL5403 and UP-COB200 only, within the rental house\'s stock (50 / 8)', () => {
        const codes = fixed.groups.map((g) => fixed.classes[g.class].code)
        expect([...new Set(codes)].sort()).toEqual(['UP-COB200', 'UP-PL5403'])
        const n = (code) => fixed.groups.filter((g) => fixed.classes[g.class].code === code).reduce((s, g) => s + g.count, 0)
        expect(n('UP-PL5403')).toBeLessThanOrEqual(50)
        expect(n('UP-COB200')).toBeLessThanOrEqual(8)
    })
    it('focuses every lamp ONCE: its aim is the same in every look (a PAR cannot move), only levels and colours change', () => {
        const looks = Object.keys(fixed.looks)
        const dirs = (look) => Object.fromEntries(lampsOf(buildRig(fixed, hall, { geometry, manifest, look })).map((e) => [e.id, [...e.components.transform.position, ...spotAimDirection(e.components.transform.rotation)]]))
        const first = dirs(looks[0])
        for (const look of looks.slice(1)) {
            const d = dirs(look)
            for (const [id, v] of Object.entries(first)) v.forEach((x, i) => expect(d[id][i], `${look} ${id}`).toBeCloseTo(x, 6))
        }
    })
})

describe('the looks: the cone on the DJ, the X over him, the halo opening out', () => {
    for (const rig of [fixed, heads]) {
        const stage = stageFrame(rig, hall)
        const box = performerBox(rig, stage)
        const ringGroup = rig.groups.find((g) => /ring|sides/.test(g.id) && g.mount === 'halo').id
        const xGroup = rig.groups.find((g) => /-x$|halo-base/.test(g.id)).id
        it(`${rig.variant.id}: white cathedral — the halo's beams land on a ring round the DJ, outside his box, lit`, () => {
            const built = buildRig(rig, hall, { geometry, manifest, look: 'halo-white-cathedral' })
            const ring = lampsOf(built).filter((e) => groupOf(rig, e.id).id === ringGroup)
            expect(ring.length).toBeGreaterThanOrEqual(4)
            for (const e of ring) {
                expect(e.components.light.intensity, e.id).toBeGreaterThan(0)
                const p = e.components.transform.position
                const d = spotAimDirection(e.components.transform.rotation)
                const t = (stage.deck - p[1]) / d[1] // where the beam reaches deck height
                const hit = [p[0] + d[0] * t, p[2] + d[2] * t]
                const inside = hit[0] > box.x[0] && hit[0] < box.x[1] && hit[1] > box.z[0] && hit[1] < box.z[1]
                expect(inside, e.id).toBe(false)
                const r = Math.hypot(hit[0] - (box.x[0] + box.x[1]) / 2, hit[1] - (box.z[0] + box.z[1]) / 2)
                expect(r, e.id).toBeCloseTo(1.3, 1)
            }
        })
        it(`${rig.variant.id}: red room — the two base-corner beams cross in an X over the DJ's head`, () => {
            const built = buildRig(rig, hall, { geometry, manifest, look: 'halo-red-room' })
            const [a, b] = lampsOf(built).filter((e) => groupOf(rig, e.id).id === xGroup)
            expect(a.components.light.intensity).toBeGreaterThan(0)
            // closest approach of the two beam lines
            const p = a.components.transform.position; const u = spotAimDirection(a.components.transform.rotation)
            const q = b.components.transform.position; const v = spotAimDirection(b.components.transform.rotation)
            const w = p.map((x, i) => x - q[i]); const dot = (m, n) => m[0] * n[0] + m[1] * n[1] + m[2] * n[2]
            const A = dot(u, u); const B = dot(u, v); const C = dot(v, v); const D = dot(u, w); const E = dot(v, w)
            const s = (B * E - C * D) / (A * C - B * B); const t = (A * E - B * D) / (A * C - B * B)
            const m1 = p.map((x, i) => x + u[i] * s); const m2 = q.map((x, i) => x + v[i] * t)
            expect(Math.hypot(...m1.map((x, i) => x - m2[i]))).toBeLessThan(0.02)
            expect(m1[0]).toBeCloseTo(0, 2)
            expect(m1[1]).toBeGreaterThan(box.y[1]) // over his head, not through it
            expect(m1[2]).toBeGreaterThan(box.z[0]); expect(m1[2]).toBeLessThan(box.z[1])
        })
    }
})

describe('the halo\'s show: the document\'s own clock, Minimal\'s five cues, and the sway rule', () => {
    it('five cues named as Minimal\'s, one 60 s pass, played by the document\'s clock (showSource "clock"), never the desk', () => {
        for (const rig of [fixed, heads]) {
            const show = showOfRig(rig, `moxir-hall-${rig.variant.id}`)
            expect(show.cues.map((c) => c.name)).toEqual(['Blackout + one beam', 'Slow sweep', 'Red room', 'White cathedral', 'Strobe hit'])
            expect(show.cues.reduce((s, c) => s + c.hold, 0)).toBe(60)
            const ops = cueOps({ mappingState: { cues: [] } }, showCues(show), show.loop, { source: show.source })
            expect(ops.at(-1).payload.patch).toEqual({ loop: true, showSource: 'clock' })
            const doc = { mappingState: { cues: showCues(show), loop: true, showEpoch: 1, showSource: 'clock' } }
            expect(showDriver({ deskChecked: true, deskPresent: true, show: showOf(doc) })).toBe('clock')
        }
    })
    it('heads: every cue that moves a halo head fades at least the rule\'s minimum (no full-range move under 4 s); the strobe hit moves nothing', () => {
        const rule = heads.truss.rigging.sway.rule
        const cues = heads.show.cues
        const pose = (look) => Object.fromEntries(lampsOf(buildRig(heads, hall, { geometry, manifest, look })).filter((e) => groupOf(heads, e.id).mount === 'halo' && heads.classes[groupOf(heads, e.id).class].fixture === 'beam380').map((e) => [e.id, spotAimDirection(e.components.transform.rotation)]))
        cues.forEach((c, i) => {
            const prev = cues[(i + cues.length - 1) % cues.length]
            const a = pose(prev.look)
            const b = pose(c.look)
            const moves = Object.keys(b).some((id) => b[id].some((x, k) => Math.abs(x - a[id][k]) > 1e-6))
            if (moves) expect(c.fade, `${prev.look} → ${c.look}`).toBeGreaterThanOrEqual(rule.min_move_s)
        })
        expect(rule.avoid_period_s[0]).toBeLessThan(heads.truss.rigging.sway.period_s)
        expect(rule.avoid_period_s[1]).toBeGreaterThan(heads.truss.rigging.sway.period_s)
    })
})

describe('a comparison variant writes only its own project', () => {
    it('lists the set and itself in its switch — "Minimal · halo" — and is its own project id', () => {
        const v = variantOf(spec, 'minimal-halo', 'moxir-hall')
        expect(v.siblings.map((s) => s.projectId)).toEqual(['moxir-hall', 'moxir-hall-minimal', 'moxir-hall-minimal-cut-movers', 'moxir-hall-middle', 'moxir-hall-full', 'moxir-hall-minimal-halo'])
        expect(v.title).toBe('Minimal · halo')
        // the set's own versions do not list the variants (their projects are not rewritten)
        expect(variantOf(spec, 'minimal', 'moxir-hall').siblings.map((s) => s.id)).toEqual(['ordered', 'minimal', 'minimal-cut-movers', 'middle', 'full'])
        expect(minimal.variant.id).toBe('minimal')
    })
})

describe('a comparison variant loads unpatched', () => {
    it('takes every lamp off the desk\'s numbering (index, universe, address) and keeps its type, mode and position', async () => {
        const { unpatched } = await import('./load-version.mjs')
        const doc = { entities: [{ id: 'rig-a-01', type: 'spotLight', components: { fixture: { index: 7, universe: 1, address: 33, type: 'up-b380f', mode: '16ch-assumed', unit: 1, position: 'halo' } } }, { id: 'place-hall', type: 'model', components: {} }] }
        const out = unpatched(doc)
        expect(out.entities[0].components.fixture).toEqual({ type: 'up-b380f', mode: '16ch-assumed', unit: 1, position: 'halo' })
        expect(out.entities[1]).toBe(doc.entities[1])
    })
})

describe('the room poses the halo by the same rules (src/rigbuild/looks.js, the show\'s clock needs it)', () => {
    it('every lamp of the fixed halo: the room\'s aim, colour and level in every look equal the rig script\'s', async () => {
        const { moxirDocument } = await import('./moxir.mjs')
        const { piecesFromRigBoxes } = await import('./load-plot.mjs')
        const { unpatched } = await import('./load-version.mjs')
        const { rigLooksFrom } = await import('./looks.mjs')
        const { venuePlanFromHall } = await import('../../src/rigbuild/venuePlan.js')
        const { pieceEntity } = await import('../../src/rigbuild/plotEdits.js')
        const { lookPoses } = await import('../../src/rigbuild/looks.js')
        const { TYPE_LIBRARY } = await import('../../src/rigbuild/types/index.js')
        const { libraryWithShow } = await import('../../src/rigbuild/rental.js')
        const { rentalList } = read('scripts/rigbuild/rentals/moxir-2026-10-17-minimal-halo.json')
        const library = libraryWithShow(TYPE_LIBRARY, rentalList)
        const { document } = moxirDocument({ rig: fixed, hall, library })
        const doc = unpatched(document)
        const pieces = piecesFromRigBoxes(doc.entities)
        const replaced = new Set(pieces.map((p) => p.replaces).filter(Boolean))
        const entities = [
            { id: 'place-hall', type: 'model', components: { venuePlan: venuePlanFromHall(hall, { name: 'MOXIR', source: 'test' }) } },
            ...pieces.map((p) => pieceEntity({ id: p.id, kind: p.kind, position: p.position, yaw: p.yaw, height: p.height })),
            ...doc.entities.filter((e) => !replaced.has(e.id)),
            { id: 'rig-show', type: 'group', components: { rigLooks: rigLooksFrom(fixed, 'rig.json') } }
        ]
        const halo = entities.filter((e) => e.type === 'spotLight' && /^halo /.test(e.components.fixture?.position || ''))
        expect(halo).toHaveLength(fixed.groups.filter((g) => g.mount === 'halo').reduce((s, g) => s + g.count, 0))
        let worst = 0
        for (const look of Object.keys(fixed.looks)) {
            const poses = lookPoses({ entities, library, lookId: look })
            const script = new Map(lampsOf(buildRig(fixed, hall, { geometry, manifest, look })).map((e) => [e.id, e]))
            for (const e of halo) {
                const p = poses.get(e.id)
                expect(p, `${look} ${e.id}`).toBeTruthy()
                const want = script.get(e.id)
                // the room aims from the lamp's mount ± its tilt pivot, the script from the posed lens
                const a = spotAimDirection(p.rotation)
                const b = spotAimDirection(want.components.transform.rotation)
                const deg = (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI
                worst = Math.max(worst, deg)
                expect(deg, `${look} ${e.id}`).toBeLessThan(0.5)
                const g = groupOf(fixed, e.id)
                expect(p.level, `${look} ${e.id}`).toBe(fixed.looks[look].levels?.[g.id] ?? 1)
                if (fixed.looks[look].colours?.[g.id]) expect(p.color).toBe(fixed.looks[look].colours[g.id])
            }
        }
        expect(worst).toBeLessThan(0.1) // measured 2026-09-29: 0.008°
    })
})
