// MOXIR v1.1 part 2 (2026-10-08 night): the stage on the owner's new marks at the press end.
// Guards what the design decided and what moxir_v1_1.py wrote: the crane park clears the press crown, the cut moves
// rigidly by the offset the rig maths derives, every laser line ends on the ash wall and never reaches the audience,
// no unit stands on the new dance floor, the speaker placeholders clear the fixed massing, the power stays under the cap,
// and epic-build moves the booth only from its old place.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadInputs, stageLineRig, behindOptions } from '../rigbuild/stage-line.mjs'
import { stageFrame, slopedLineRigging } from './rig-lib.mjs'
import { boothMoveOps } from '../rigbuild/epic-build.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(here, 'rigs', f), 'utf8'))
const DESIGN = 'scripts/place/rigs/moxir-stage-v1-1-2026-10-08.json'
const design = read('moxir-stage-v1-1-2026-10-08.json')
const rig = read('moxir-epic-v1-1-2026-10-08.json')
const hall = read('moxir-hall-2026-10-08-v9-show-park.hall.json')
const inBox = (p, m, pad = 0) => p[0] >= m.x_m[0] - pad && p[0] <= m.x_m[1] + pad && p[2] >= m.z_m[0] - pad && p[2] <= m.z_m[1] + pad

describe('MOXIR v1.1: the stage and the crane park', () => {
    it("puts the step on the owner's green box and the near crane behind it, clear of the press crown by >= 0.5 m", () => {
        expect(design.booth.centre_x_m).toBeCloseTo(-5.2, 3)
        expect(design.booth.front_z_m).toBeCloseTo(5.65, 3)
        const inputs = loadInputs(DESIGN)
        const r = stageLineRig(inputs)
        const [o] = behindOptions({ rigs: { d: r }, hall: inputs.hall, design: inputs.design, zs: [design.crane.z_m], gapMin: 0.5 })
        expect(o.hard).toEqual([])
        expect(o.gap_m).toBeGreaterThanOrEqual(0.5)
        expect(o.line_nearest_fixed.gap_m).toBeGreaterThanOrEqual(0.4)
        // the v1.0 relation (z 2.15) is the one that fails the crown
        const [old] = behindOptions({ rigs: { d: r }, hall: inputs.hall, design: inputs.design, zs: [2.15], gapMin: 0.5 })
        expect(old.line_nearest_fixed.id).toBe('press-crown')
        expect(old.line_nearest_fixed.gap_m).toBeLessThan(0.5)
        expect(hall.geometry.cranes[0].z_m).toBeCloseTo(design.crane.z_m, 3)
        expect(hall.geometry.cranes[1].z_m).toBeCloseTo(-41, 3)
    })
    it('keeps the cut LOW house left and moves it rigidly by the offset moxir_v1_1.py uses (D_CUT)', () => {
        const a = loadInputs()
        const b = loadInputs(DESIGN)
        const ra = stageLineRig(a)
        const rb = stageLineRig(b)
        const ma = new Map(slopedLineRigging(ra, stageFrame(ra, a.hall), a.hall).map((e) => [e.id, e]))
        const mb = new Map(slopedLineRigging(rb, stageFrame(rb, b.hall), b.hall).map((e) => [e.id, e]))
        const offs = [...ma.keys()].filter((k) => mb.has(k) && !/tieoff|-steel/.test(k) && k !== 'rig-truss-header')
            .map((k) => mb.get(k).components.transform.position.map((v, i) => v - ma.get(k).components.transform.position[i]))
        for (const o of offs) [-4.0, -0.35, -20.85].forEach((v, i) => expect(o[i]).toBeCloseTo(v, 3))
        const [lo, hi] = rb.truss.ends
        expect(lo.x_m).toBeLessThan(hi.x_m)
        expect(lo.bottom_chord_m).toBeLessThan(hi.bottom_chord_m)
        expect(lo.x_m).toBeGreaterThan(-11.6 + 0.5)          // 0.5 m from the column row's inner face
        expect(rig.checks_v1_1.deltas.D_CUT).toEqual([-4, -0.35, -20.85])
    })
    it("keeps the speaker placeholders (the organiser's) on his marks, moved only off the fixed massing", () => {
        for (const b of design.pa.boxes) {
            expect(b.x_m).toEqual(b.drawn_x_m)
            for (const m of hall.geometry.massing.filter((m) => m.y_m[0] < b.h_m)) {
                const overlap = b.x_m[0] < m.x_m[1] && b.x_m[1] > m.x_m[0] && b.z_m[0] < m.z_m[1] && b.z_m[1] > m.z_m[0]
                expect(overlap, `${b.id} vs ${m.id}`).toBe(false)
            }
        }
        expect(design.pa.placeholder).toBe(true)
        expect(rig.solids.filter((s) => s.id.startsWith('rig-pa-')).every((s) => /PLACEHOLDER/.test(s.name))).toBe(true)
    })
})

describe('MOXIR v1.1: the lights and lasers moved', () => {
    it('ends every laser line on the ash wall with margin, never past the barrier', () => {
        const lasers = rig.checks_v1_1.lasers
        expect(lasers).toHaveLength(12)
        for (const l of lasers) {
            expect(l.pass, l.beam).toBe(true)
            expect(l.ends_on).toBe('ash-wall')
            expect(l.margin_after_zone_deg).toBeGreaterThan(0.5)
            expect(l.max_z_m).toBeLessThan(design.barrier.z_m)
        }
        expect(rig.checks_v1_1.laser_safety_6w.nohd_m).toBe(544)
    })
    it('leaves no unit on the new dance floor and keeps every unit of v1.0', () => {
        const v10 = read('moxir-epic-2026-10-08.json')
        expect(rig.fixtures.map((f) => f.id).sort()).toEqual(v10.fixtures.map((f) => f.id).sort())
        expect(rig.checks_v1_1.on_the_floor).toEqual([])
        const floor = { x_m: design.floor.x_m, z_m: design.floor.z_m }
        for (const f of rig.fixtures) if (f.p[1] < 2.5) expect(inBox(f.p, floor), f.id).toBe(false)
        for (const f of rig.fixtures.filter((f) => f.type === 'up-yz31p')) {
            for (const m of hall.geometry.massing) expect(inBox(f.p, m) && f.p[1] < m.y_m[1], `${f.id} in ${m.id}`).toBe(false)
        }
    })
    it('stays under the 30 kW running cap with every circuit within its limit and drop', () => {
        const p = rig.power
        expect(p.summary.running_total_w).toBeLessThanOrEqual(30000)
        for (const c of p.circuits) {
            expect(c.ok, c.circuit).toBe(true)
            expect(c.load_w).toBeLessThanOrEqual(2944)
            expect(c.vdrop_pct).toBeLessThanOrEqual(5)
        }
    })
    it('puts the second E-stop where, with FOH, at least 90 % of every line is seen', () => {
        expect(rig.checks_v1_1.spotter.chosen.with_foh_min).toBeGreaterThanOrEqual(0.9)
        const [x, z] = rig.checks_v1_1.spotter.chosen.at
        expect(z).toBeLessThan(design.barrier.z_m)
        expect(x).toBeLessThan(0)
    })
})

describe('epic-build boothMoveOps', () => {
    const deck = (id, x, z) => ({ id, components: { transform: { position: [x, 0, z] } } })
    const doc = { entities: [deck('rig-deck-1', -0.872, 23.49), deck('rig-deck-2', 0.128, 23.5), deck('rig-deck-3', 1.128, 23.49), { id: 'rig-dj-table', components: { transform: { position: [0.128, 0.4, 23.89] } } }] }
    it('moves the decks and the table by the rig offset, once', () => {
        const { ops, entities } = boothMoveOps(doc, rig)
        expect(ops).toHaveLength(4)
        const d2 = entities.find((e) => e.id === 'rig-deck-2').components.transform.position
        expect(d2[0]).toBeCloseTo(-5.2, 2)
        expect(d2[2]).toBeCloseTo(4.65, 2)
        expect(boothMoveOps({ entities }, rig).ops).toEqual([])
    })
    it('refuses a booth that stands anywhere else', () => {
        expect(() => boothMoveOps({ entities: [deck('rig-deck-1', 3, 10)] }, rig)).toThrow(/refusing/)
    })
})
