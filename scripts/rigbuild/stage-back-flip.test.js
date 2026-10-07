// @vitest-environment node
//
// The owner's picture gate (2026-10-07): "the truss at the back of the DJ — where the DJ stage line finishes, the crane
// line there — with the truss flipped". These hold the numbers the report states: the backdrop park rule (nothing hung
// over the riser), the flipped cut as the exact mirror of the stage-line cut, the tie-offs that clear the fixed metal
// and the one least change they needed, and the re-cut ops on a copy.
import { describe, expect, it } from 'vitest'

import { slopedLineRigging, stageFrame } from '../place/rig-lib.mjs'
import { tieoffCabClashes } from './safety.mjs'
import { anchorWindows, behindOptions, hallWithCraneAt, hungReach, loadInputs, nearestFixed, nearestInWindows, recutOps, stageLineRig } from './stage-line.mjs'

const BACK = 'scripts/place/rigs/moxir-stage-back-flip-2026-10-07.json'
const back = loadInputs(BACK)
const line = loadInputs()
const flipped = stageLineRig(back)
const today = stageLineRig(line)
const t = flipped.truss

describe('the backdrop park rule (rig-lib stageFrame truss_behind_m)', () => {
    const s = stageFrame(flipped, back.hall)
    it('parks the bridge at z 21, behind the riser\'s back edge (22.5) by more than the clamps\' reach + 0.5 m', () => {
        expect(s.trussZ).toBe(21)
        expect(s.back).toBe(22.5)
        const reach = hungReach(flipped, s.trussZ)
        expect(reach.front).toBe(21.82)
        expect(s.back - reach.front).toBeCloseTo(0.68, 6)
    })
    it('refuses a bridge that would hang anything within the gap (the 24 m park of the stage-line hall)', () => {
        expect(() => stageLineRig({ ...back, hall: line.hall, design: { ...back.design, crane: { ...back.design.crane, hall_record: line.design.crane.hall_record } } })).toThrow(/not 1.32 m behind/)
    })
})

describe('the flipped cut is the stage-line cut mirrored about the nave axis', () => {
    it('has the same ends mirrored: LOW house right 3.24 m, HIGH house left 6.35 m', () => {
        expect(t.ends.map((e) => [-e.x_m, e.bottom_chord_m]).reverse()).toEqual(today.truss.ends.map((e) => [e.x_m, e.bottom_chord_m]))
        expect(t.clearance.low_end).toMatchObject({ side: 'house-right', bottom_chord_m: 3.24, over_raised_hands_m: 0.74 })
        expect(t.trim_m).toBe(today.truss.trim_m)
    })
    it('mirrors the picks: places, bridles, loads', () => {
        const pick = (p) => [p.bridle_included_deg, p.line_kg, p.apex_m]
        expect(t.rigging.picks.map((p) => -p.x_m)).toEqual(today.truss.rigging.picks.map((p) => p.x_m).reverse())
        expect(t.rigging.picks.map(pick)).toEqual(today.truss.rigging.picks.map(pick).reverse())
        expect(t.rigging.picks.map((p) => p.bridle_included_deg)).toEqual([119, 42, 26])
    })
})

describe('tie-offs at the backdrop park', () => {
    const hall = back.hall
    const hr = t.rigging.tieoffs.find((x) => x.id === 'hr')
    const hl = t.rigging.tieoffs.find((x) => x.id === 'hl')
    it('go to the z 18 columns, 26–28° off the bridge\'s plane, missing the cab', () => {
        expect([hl.to_m[2], hr.to_m[2]]).toEqual([18, 18])
        expect(tieoffCabClashes(flipped, hall)).toEqual([])
        const angle = (x) => Math.round((Math.atan2(Math.abs(x.to_m[2] - x.from_m[2]), Math.abs(x.to_m[0] - x.from_m[0])) * 180) / Math.PI)
        expect([angle(hl), angle(hr)]).toEqual([26, 28])
    })
    it('the LOW end (house right) cannot tie at its own height: the pipe racks, the drum tank, the canopy — least change +1.71 m to 5.10 m', () => {
        const wins18 = anchorWindows({ from: hr.from_m, colX: 11.6, gridZ: 18, hall })
        const wins24 = anchorWindows({ from: hr.from_m, colX: 11.6, gridZ: 24, hall })
        expect(nearestInWindows(wins18, 3.39)).toBe(5.1)
        expect(nearestInWindows(wins24, 3.39)).toBe(5.1)
        expect(hr.to_m[1]).toBe(5.1)
        const near = nearestFixed(hr.from_m, hr.to_m, hall)
        expect(near.id).toBe('pipe-rack-3')
        expect(near.gap_m).toBeGreaterThanOrEqual(0.1)
        // at its own height it would run through the racks
        expect(nearestFixed(hr.from_m, [11.6, 3.39, 18], hall).gap_m).toBe(0)
    })
    it('the HIGH end (house left) ties level at its own height, under the runway beam', () => {
        expect(hl.to_m[1]).toBe(hl.from_m[1])
        expect(nearestFixed(hl.from_m, hl.to_m, hall)).toEqual({ id: 'runway-l', gap_m: 0.56 })
    })
})

describe('behindOptions: z 21.0 / 21.18 / 21.5 / 22.0, flipped and not', () => {
    const tmpHall = back.hall
    const opts = behindOptions({ rigs: { flipped }, hall: tmpHall, design: back.design, zs: [21.0, 21.18, 21.5, 22.0], gapMin: back.design.truss.clear_gap_m })
    const at = (z) => opts.find((o) => o.z_m === z)
    it('passes 21.0 and 21.18 (exactly 0.5), fails 21.5 (0.18) and 22.0 (the front clamps over the step)', () => {
        expect(at(21).hard).toEqual([])
        expect(at(21).gap_m).toBe(0.68)
        expect(at(21.18).gap_m).toBe(0.5)
        expect(at(21.5).hard.join()).toMatch(/0.18 m behind/)
        expect(at(22).gap_m).toBe(-0.32)
    })
    it('keeps the low end and its hung lamps clear of the blower group under it', () => {
        expect(at(21).line_nearest_fixed).toEqual({ id: 'blower-cyclone', gap_m: 0.7 })
    })
    it('moves only the near crane', () => {
        expect(hallWithCraneAt(tmpHall, 22).geometry.cranes[1]).toEqual(tmpHall.geometry.cranes[1])
    })
})

describe('recutOps: the stage-line copy re-hung as the flipped backdrop', () => {
    const was = stageFrame(today, line.hall)
    const ent = (id, name, position, rotation = [0, 0, 0.261799388]) => ({ id, type: 'box', name, components: { transform: { position, rotation, scale: [1, 1, 1] } } })
    const doc = {
        entities: [
            { id: 'place-hall', components: { transform: { position: [0, 0, 0] }, venuePlan: {} } },
            ...slopedLineRigging(today, was, line.hall).filter((e) => e.id !== 'rig-truss-header'),
            ent('rig-line-1', 'truss line (hung from the crane bridge, sloped)', [-4.588, 3.78, 24]),
            ent('rig-par-cut-x-01', 'UP-PL5403 par-cut-x 1', [-4.69, 3.38, 24], [0, 0.3, 0.2]),
            ent('rig-par-columns-07', 'UP-PL5403 par-columns 7', [-11.16, 0.31, 24])
        ]
    }
    const r = recutOps({ doc, rigFrom: today, hallFrom: line.hall, rigTo: flipped, hallTo: back.hall, mirror: true, design: back.design })
    const next = JSON.parse(JSON.stringify(doc))
    for (const op of r.ops) {
        const e = next.entities.find((x) => x.id === op.payload.entityId)
        if (op.type === 'updateComponent') e.components[op.payload.component] = op.payload.patch
        if (op.type === 'updateEntity') Object.assign(e, op.payload.patch)
    }
    const tr = (id) => next.entities.find((e) => e.id === id).components.transform
    it('moves the cut rigidly: mirrored, then 3 m back', () => {
        expect(r.d).toEqual([0, 0, -3])
    })
    it('mirrors the line\'s pieces and lamps (place and turn), leaves the floor alone', () => {
        expect(tr('rig-line-1').position).toEqual([4.588, 3.78, 21])
        expect(tr('rig-line-1').rotation).toEqual([0, -0, -0.261799388])
        expect(tr('rig-par-cut-x-01')).toMatchObject({ position: [4.69, 3.38, 21], rotation: [0, -0.3, -0.2] })
        expect(tr('rig-par-columns-07').position).toEqual([-11.16, 0.31, 24])
    })
    it('re-derives the tie-offs to z 18 and re-derives the plan\'s crane line', () => {
        expect(next.entities.find((e) => e.id === 'rig-tieoff-hr').name).toMatch(/LOW\) end UP to the nave column at x \+11.6 on grid line z 18, at 5.1 m/)
        const plan = next.entities.find((e) => e.id === 'place-hall').components.venuePlan
        expect(plan.overhead.find((o) => o.id === 'crane-1').line[0][1]).toBe(21)
    })
    it('refuses a copy whose cut is not where it should hang, and keeps what someone else moved', () => {
        const off = JSON.parse(JSON.stringify(doc))
        off.entities.find((e) => e.id === 'rig-hoist-1').components.transform.position[1] += 0.2
        expect(() => recutOps({ doc: off, rigFrom: today, hallFrom: line.hall, rigTo: flipped, hallTo: back.hall, mirror: true, design: back.design })).toThrow(/refusing/)
        const k = recutOps({ doc, rigFrom: today, hallFrom: line.hall, rigTo: flipped, hallTo: back.hall, mirror: true, design: back.design, keep: new Set(['rig-par-cut-x-01']) })
        expect(k.kept).toEqual(['rig-par-cut-x-01'])
        expect(k.ops.some((o) => o.payload.entityId === 'rig-par-cut-x-01')).toBe(false)
    })
})
