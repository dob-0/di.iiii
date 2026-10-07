// @vitest-environment node
//
// The owner's stage line (2026-10-07): the crane parked at z 24, the cut re-derived there, the scratch copy moved as
// ops. These hold the numbers the scratch report states: the decided shape unchanged, the tie-offs clear of the cab
// and the pipe racks, the raised-hands margin, the park table's pick, and that the ops move only what they say.
import { describe, expect, it } from 'vitest'

import { slopedLineRigging, stageFrame } from '../place/rig-lib.mjs'
import { tieoffCabClashes } from './safety.mjs'
import { crowdSightline, djEyeLine, hallWithCraneAt, theirsFromOps, loadInputs, nearestMassing, ownerMoves, paEntities, parkOptions, pickPark, riserClearance, stageLineOps, stageLineRig } from './stage-line.mjs'

const inputs = loadInputs()
const { design, hall, oldHall, oldRig } = inputs
const rig = stageLineRig(inputs)
const t = rig.truss

describe('the stage line: the design file and the hall record agree', () => {
    it('parks the near crane at the design z, the far one where it was seen', () => {
        expect(hall.geometry.cranes[0].z_m).toBe(design.crane.z_m)
        expect(hall.geometry.cranes[1].z_m).toBe(oldHall.geometry.cranes[1].z_m)
        expect(hall.geometry.cranes[0].girder_bottom_m).toBe(7.95)
    })
    it('starts the dance floor at the barrier, in front of the line', () => {
        const dance = hall.geometry.zones.dance.used
        expect(dance.z_m[0]).toBe(design.barrier.z_m)
        expect(design.barrier.z_m).toBeCloseTo(design.stage_line.z_m + design.barrier.pit_m, 6)
        expect(dance.x_m).toEqual([-5.35, 5.35])
    })
})

describe('stageFrame: a booth with its front stated (front_z_m)', () => {
    const s = stageFrame(rig, hall)
    it('puts the one-step riser behind the line on the nave axis, under the cut\'s axis (owner: "keep max dj center")', () => {
        expect(s.front).toBe(24.5)
        expect(s.back).toBe(22.5)
        expect(s.axis).toBe(0)
        expect(s.trussAxis).toBe(0)
        expect(s.deck).toBe(0.4)
        expect(s.trussZ).toBe(24)
    })
    it('changes nothing for a rig that does not state it (the trussAxis is the booth axis)', () => {
        const old = stageFrame(oldRig, oldHall)
        expect(old.trussAxis).toBe(old.axis)
        expect(old.front).toBe(6.2)
        expect(old.trussZ).toBe(4.8)
    })
})

describe('the cut at z 24: the shape the owner decided, unchanged', () => {
    const was = oldRig.truss
    it('has the same ends, trim, picks and bridles as Known · full today', () => {
        expect(t.ends).toEqual(was.ends)
        expect(t.trim_m).toBe(was.trim_m)
        expect(t.ends[0]).toMatchObject({ x_m: -6.04, bottom_chord_m: 3.24 })
        expect(t.ends[1]).toMatchObject({ x_m: 5.55, bottom_chord_m: 6.35 })
        const keys = ['u_m', 'x_m', 'top_chord_m', 'bottom_chord_m', 'apex_m', 'bridle_included_deg', 'line_kg', 'on_bridge_kg', 'leg_kg']
        const pick = (p) => Object.fromEntries(keys.map((k) => [k, p[k]]))
        expect(t.rigging.picks.map(pick)).toEqual(was.rigging.picks.map(pick))
        expect(t.rigging.picks.map((p) => p.bridle_included_deg)).toEqual([26, 42, 119])
    })
    it('keeps the 0.5 m raised-hands margin at the low end (house left)', () => {
        expect(t.clearance.low_end.side).toBe('house-left')
        expect(t.clearance.low_end.over_raised_hands_m).toBeGreaterThanOrEqual(0.5)
    })
    it('ties off straight across to the z 24 columns, under the cab and over the pipe racks', () => {
        for (const tie of t.rigging.tieoffs) expect(tie.to_m[2], tie.id).toBe(24)
        expect(tieoffCabClashes(rig, hall)).toEqual([])
        const hr = t.rigging.tieoffs.find((x) => x.id === 'hr')
        expect(hr.under_cab_m).toBeCloseTo(0.19, 2)
        const nearest = nearestMassing(hr.from_m, hr.to_m, hall)
        expect(nearest.id).toBe('pipe-rack-3')
        expect(nearest.gap_m).toBeGreaterThanOrEqual(0.1)
    })
    it('holds the hr anchor window the cut file states (4.60 … ≈4.8 m)', () => {
        const hr = t.rigging.tieoffs.find((x) => x.id === 'hr')
        const at = (y) => ({ clash: tieoffCabClashes({ truss: { rigging: { tieoffs: [{ id: 'hr', from_m: hr.from_m, to_m: [11.6, y, 24] }] } } }, hall).length > 0, gap: nearestMassing(hr.from_m, [11.6, y, 24], hall).gap_m })
        expect(at(4.6)).toEqual({ clash: false, gap: 0.1 })
        expect(at(4.8).clash).toBe(false)
        expect(at(4.86).clash).toBe(true)
        expect(at(4.58).gap).toBeLessThan(0.1)
    })
    it('still refuses a line slid along the bridge toward the cab (+2 m: its hr tie-off crosses the cab)', () => {
        expect(() => stageLineRig({ ...inputs, design: { ...design, truss: { ...design.truss, axis_x_m: 2 } } })).toThrow(/passes through a crane cab/)
    })
    it('gives the DJ on the 0.4 m step 1.96 m over raised hands to the line\'s centre (bottom chord 4.86 − 0.4 − 2.5)', () => {
        expect(t.clearance.over_dj_raised_hands_m).toBe(1.96)
    })
})

describe('the roller conveyor (hall v8, owner 2026-10-07): the centred booth and the PA clear it', () => {
    const s = stageFrame(rig, hall)
    const conveyor = hall.geometry.massing.find((m) => m.id === 'roller-conveyor')
    const stack = (side) => paEntities(design).find((e) => e.id === `rig-pa-${side}-subs`).components.transform
    it('keeps the centred riser 2.1 m from it (it overlapped where he first drew it)', () => {
        expect(riserClearance(s, hall)).toEqual({ id: 'roller-conveyor', gap_m: 2.1 })
        expect(riserClearance({ ...s, axis: design.booth.drawn_centre_x_m }, hall)).toEqual({ id: 'roller-conveyor', gap_m: 0 })
    })
    it('sets the stereo pair symmetric about the DJ, at the smallest spacing outside the conveyor with the 0.1 m clearance', () => {
        const [l, r] = [stack('l'), stack('r')]
        expect(l.position[0]).toBe(-r.position[0])
        expect(r.position[0] - r.scale[0] / 2 - conveyor.x_m[1]).toBeCloseTo(0.13, 2)
        expect(r.position[0] - 0.1 - r.scale[0] / 2 - conveyor.x_m[1]).toBeLessThan(design.booth.clear_of_fixed_m)
        // where he drew them (~3.9 m from the DJ) the right stack would stand on the conveyor
        expect(3.9 + r.scale[0] / 2 > conveyor.x_m[0] && 3.9 - r.scale[0] / 2 < conveyor.x_m[1]).toBe(true)
    })
})

const SIGHT_24 = parkOptions({ rig, hall, design }).find((o) => o.z_m === 24).sightline_to_dj_m
describe('can the crowd see a DJ on one step? (owner: "just one step thing", then "two decks low")', () => {
    it('the copy\'s step is the owner\'s 0.4 m: front row 80 mm, 2 rows over 60 mm, the DJ\'s eye 0.25 m over the front heads', () => {
        const s0 = stageFrame(rig, hall)
        const c = crowdSightline({ deckH: s0.deck, djZ: s0.back + s0.into * (s0.depth / 2 - 0.2), barrierZ: design.barrier.z_m })
        expect(c).toMatchObject({ deck_h_m: 0.4, c_front_row_mm: 80, rows_c60: 2, rows_c90: 0 })
        expect(SIGHT_24).toBeGreaterThan(1.5)
    })
    const s = stageFrame(rig, hall)
    const djZ = s.back + s.into * (s.depth / 2 - 0.2)
    const at = (h) => crowdSightline({ deckH: h, djZ, barrierZ: design.barrier.z_m })
    it('on a level floor nobody behind the front row clears even C 60 mm over the head in front at 0.2 m; the old 1.2 m gave 9 rows at C 90', () => {
        expect(at(0.2)).toMatchObject({ front_row_m: 2.8, c_front_row_mm: 45, rows_c60: 0, rows_c90: 0 })
        expect(at(0.6)).toMatchObject({ rows_c60: 6, rows_c90: 2 })
        expect(at(1.2)).toMatchObject({ rows_c60: 16, rows_c90: 9, rows_c120: 5 })
    })
    it('leaves the DJ\'s own eye line 0.07 m over the front row\'s heads (0.96 m on the old riser)', () => {
        const back = hall.geometry.zones.dance.used.z_m[1]
        expect(djEyeLine({ deckH: 0.2, djZ, barrierZ: design.barrier.z_m, backZ: back }).over_front_row_heads_m).toBe(0.07)
        expect(djEyeLine({ deckH: 1.2, djZ, barrierZ: design.barrier.z_m, backZ: back }).over_front_row_heads_m).toBe(0.96)
    })
    it('does not change the crane park: the 1 m rule reads the riser\'s depth, not its height', () => {
        const low = parkOptions({ rig, hall, design })
        const high = parkOptions({ rig: stageLineRig({ ...inputs, design: { ...design, booth: { ...design.booth, deck_h_m: 1.2 } } }), hall, design })
        expect(low.map((o) => [o.z_m, o.dj_offset_m, o.fails.length])).toEqual(high.map((o) => [o.z_m, o.dj_offset_m, o.fails.length]))
        expect(pickPark(low).z_m).toBe(24)
        expect(low.find((o) => o.z_m === 24).sightline_to_dj_m).toBe(SIGHT_24)
    })
})

describe('parkOptions: where the crane parks', () => {
    const options = parkOptions({ rig, hall, design })
    const at = (z) => options.find((o) => o.z_m === z)
    it('picks z 24 and says why the others fail', () => {
        expect(pickPark(options).z_m).toBe(24)
        expect(at(24).fails).toEqual([])
        expect(at(24).dj_offset_m).toBe(0.7)
        expect(at(24).tieoffs.map((x) => x.along_z_m)).toEqual([0, 0])
        expect(at(22).fails.join(' ')).toMatch(/DJ is 1\.3 m/)
        expect(at(26).fails.join(' ')).toMatch(/over the dance floor/)
        expect(at(26).fails.join(' ')).toMatch(/DJ is 2\.7 m/)
    })
    it('leaves the front row a clear line to the DJ under the cut', () => {
        expect(at(24).sightline_to_dj_m).toBeGreaterThan(1)
        expect(at(22).sightline_to_dj_m).toBe(null) // the line hangs behind the DJ
    })
    it('keeps the cab clear of the fixed massing under it', () => {
        for (const o of options) for (const m of o.cab_over_massing) expect(m.gap_m, `${o.z_m} ${m.id}`).toBeGreaterThan(1)
    })
    it('moves only the near crane', () => {
        const h = hallWithCraneAt(hall, 22)
        expect(h.geometry.cranes[0]).toMatchObject({ z_m: 22, from_entry_m: 32 })
        expect(h.geometry.cranes[1]).toEqual(hall.geometry.cranes[1])
    })
})

// a copy of the version as load-plot leaves it, in the old place: the rigging rig-lib derives there, the booth, a
// lamp on the cut, a floor lamp, the hall
const oldDoc = () => {
    const was = stageFrame(oldRig, oldHall)
    const ent = (id, name, position, extra = {}) => ({ id, type: 'box', name, components: { transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, ...extra } })
    return {
        entities: [
            ent('place-hall', 'MOXIR — the hall', [0, 0, 0], { venuePlan: {} }),
            ...slopedLineRigging(oldRig, was, oldHall).filter((e) => e.id !== 'rig-truss-header'),
            ent('rig-line-1', 'truss line (hung from the crane bridge, sloped)', [-4.588, 3.98, 4.8]),
            ent('rig-deck-2', 'DJ riser', [0, 0, 5.2]),
            ent('rig-dj-table', 'DJ table', [0, 1.2, 5.6]),
            ent('rig-dj-stair-1', 'Booth stair tread 1/6', [-2, 0, 5.83]),
            ent('rig-crowd-barrier', 'Crowd barrier 9 m, 1.3 m pit', [0, 0, 7.5]),
            ent('rig-par-cut-x-01', 'UP-PL5403 par-cut-x 1', [-4.69, 3.58, 4.8]),
            ent('rig-par-columns-07', 'UP-PL5403 par-columns 7', [-11.16, 0.31, 24])
        ]
    }
}
const apply = (doc, ops) => {
    const out = JSON.parse(JSON.stringify(doc))
    for (const op of ops) {
        if (op.type === 'createEntity') out.entities.push(op.payload.entity)
        if (op.type === 'deleteEntity') out.entities = out.entities.filter((x) => x.id !== op.payload.entityId)
        const e = out.entities.find((x) => x.id === op.payload.entityId)
        if (op.type === 'updateComponent') e.components[op.payload.component] = { ...e.components[op.payload.component], ...op.payload.patch }
        if (op.type === 'updateEntity') Object.assign(e, op.payload.patch)
    }
    return out
}

describe('stageLineOps: the copy moved, and nothing else', () => {
    const doc = oldDoc()
    const { ops } = stageLineOps({ doc, rig, hall, oldRig, oldHall, design })
    const next = apply(doc, ops)
    const pos = (d, id) => d.entities.find((e) => e.id === id).components.transform.position
    it('moves the booth to the line on the nave axis as one 0.4 m step, the table on it, the stair gone', () => {
        expect(pos(next, 'rig-deck-2')).toEqual([0, 0, 23.5])
        expect(next.entities.find((e) => e.id === 'rig-deck-2').components.transform.scale).toEqual([1, 0.4, 1])
        expect(pos(next, 'rig-dj-table')).toEqual([0, 0.4, 23.9])
        expect(next.entities.some((e) => e.id === 'rig-dj-stair-1')).toBe(false)
    })
    it('translates the cut 19.2 m along z: its rigging re-derived equals the old rigging moved, the tie-offs excepted', () => {
        for (const e of doc.entities.filter((x) => /^rig-hoist-/.test(x.id))) {
            const p = e.components.transform.position
            expect(pos(next, e.id), e.id).toEqual([p[0], p[1], Math.round((p[2] + 19.2) * 1000) / 1000].map((v, i) => expect.closeTo(v, i === 2 ? 2 : 3)))
        }
        expect(pos(next, 'rig-line-1')).toEqual([-4.588, 3.98, 24])
        expect(pos(next, 'rig-par-cut-x-01')).toEqual([-4.69, 3.58, 24])
        expect(next.entities.find((e) => e.id === 'rig-tieoff-hr').name).toMatch(/grid line z 24/)
    })
    it('leaves the floor lamps where they are, adds the PA, re-derives the plan', () => {
        expect(pos(next, 'rig-par-columns-07')).toEqual([-11.16, 0.31, 24])
        expect(next.entities.filter((e) => /^rig-pa-/.test(e.id)).map((e) => e.id)).toEqual(['rig-pa-l-subs', 'rig-pa-l-tops', 'rig-pa-r-subs', 'rig-pa-r-tops'])
        const plan = next.entities.find((e) => e.id === 'place-hall').components.venuePlan
        expect(plan.overhead.find((o) => o.id === 'crane-1').line[0][1]).toBe(24)
        expect(plan.zones.find((z) => z.id === 'dance').rects[0]).toEqual([-5.35, 25.8, 5.35, 48])
    })
    it('stands every PA stack on the line, facing the audience, at the design\'s x', () => {
        for (const p of paEntities(design).filter((e) => e.id.endsWith('subs'))) {
            const [x, y, z] = p.components.transform.position
            const [w, , d] = p.components.transform.scale
            expect(y).toBe(0)
            expect(z + d / 2).toBeCloseTo(design.stage_line.z_m, 2)
            const side = design.pa.sides.find((s) => p.id.includes(`-${s.id.toLowerCase()}-`))
            expect(x).toBe(side.centre_x_m)
            expect(w).toBe(1.34)
        }
    })
    it('moves the cut rigidly onto the derived trim when the copy hangs at another (the PONYO copy: 0.2 m high)', () => {
        const high = oldDoc()
        for (const e of high.entities) if (/^rig-(hoist|tieoff|line|par-cut)/.test(e.id)) e.components.transform.position[1] += 0.2
        const r = stageLineOps({ doc: high, rig, hall, oldRig, oldHall, design })
        expect(r.dCut).toEqual([0, -0.2, 19.2])
        expect(pos(apply(high, r.ops), 'rig-line-1')).toEqual([-4.588, 3.98, 24])
        const bent = oldDoc()
        bent.entities.find((e) => e.id === 'rig-hoist-1').components.transform.position[1] += 0.3
        expect(() => stageLineOps({ doc: bent, rig, hall, oldRig, oldHall, design })).toThrow(/rigidly/)
    })
    it('is a no-op the second time, moves only the booth when its x changed, and refuses a riser in neither place', () => {
        expect(stageLineOps({ doc: next, rig, hall, oldRig, oldHall, design }).ops).toEqual([])
        const shifted = JSON.parse(JSON.stringify(next))
        for (const e of shifted.entities) if (/^rig-(deck|dj-)/.test(e.id)) e.components.transform.position[0] += 2.0
        const again = stageLineOps({ doc: shifted, rig, hall, oldRig, oldHall, design })
        expect(again.moved.map((m) => m.id).sort()).toEqual(['rig-deck-2', 'rig-dj-table'])
        expect(pos(apply(shifted, again.ops), 'rig-deck-2')).toEqual([0, 0, 23.5])
        const odd = oldDoc()
        odd.entities.find((e) => e.id === 'rig-deck-2').components.transform.position = [0, 0, 12]
        expect(() => stageLineOps({ doc: odd, rig, hall, oldRig, oldHall, design })).toThrow(/refusing/)
    })
})

describe('the conflict guard: what someone else moved is kept', () => {
    const doc = oldDoc()
    const next = apply(doc, stageLineOps({ doc, rig, hall, oldRig, oldHall, design }).ops)
    it('finds his moves against the document this script last wrote', () => {
        const his = JSON.parse(JSON.stringify(next))
        his.entities.find((e) => e.id === 'rig-pa-l-subs').components.transform.position = [-4, 0, 24.14]
        expect(ownerMoves(next, his)).toEqual([expect.objectContaining({ id: 'rig-pa-l-subs', what: 'moved' })])
        expect(ownerMoves(next, next)).toEqual([])
    })
    it('never writes over them', () => {
        const his = JSON.parse(JSON.stringify(next))
        his.entities.find((e) => e.id === 'rig-pa-l-subs').components.transform.position = [-4, 0, 24.14]
        for (const e of his.entities) if (/^rig-(deck|dj-)/.test(e.id)) e.components.transform.position[0] += 1
        const keep = new Set(['rig-pa-l-subs', 'rig-deck-2'])
        const r = stageLineOps({ doc: his, rig, hall, oldRig, oldHall, design, keep: new Set(keep) })
        expect(r.ops.some((o) => keep.has(o.payload.entityId))).toBe(false)
        // the booth is one unit: a hand-moved deck keeps the table where he left it too
        expect([...new Set(r.kept)].sort()).toEqual(['rig-deck-2', 'rig-dj-table', 'rig-pa-l-subs'])
        expect(r.moved).toEqual([])
    })
    it('changes only the step\'s HEIGHT of a booth he placed, never its place', () => {
        const his = JSON.parse(JSON.stringify(next))
        for (const e of his.entities) if (/^rig-(deck|dj-)/.test(e.id)) e.components.transform.position[0] += 0.128
        his.entities.find((e) => e.id === 'rig-deck-2').components.transform.scale[1] = 0.2
        his.entities.find((e) => e.id === 'rig-dj-table').components.transform.position[1] = 0.2
        const r = stageLineOps({ doc: his, rig, hall, oldRig, oldHall, design, keep: new Set(['rig-deck-2']) })
        const after = apply(his, r.ops)
        const pos = (d, id) => d.entities.find((e) => e.id === id).components.transform.position
        expect(pos(after, 'rig-deck-2')).toEqual([0.128, 0, 23.5])
        expect(after.entities.find((e) => e.id === 'rig-deck-2').components.transform.scale[1]).toBe(0.4)
        expect(pos(after, 'rig-dj-table')).toEqual([0.128, 0.4, 23.9])
    })
})

describe('planKey: the same plan whatever the server did to its words', () => {
    it('ignores a shortened label, not a moved solid', async () => {
        const { planKey } = await import('./stage-line.mjs')
        const a = { zones: [], solids: [{ id: 'c', label: 'a long label', rect: [1, 2, 3, 4], top: 1 }], overhead: [], columns: [], outline: [] }
        expect(planKey(a)).toBe(planKey({ ...a, solids: [{ ...a.solids[0], label: 'a long' }] }))
        expect(planKey(a)).not.toBe(planKey({ ...a, solids: [{ ...a.solids[0], rect: [1, 2, 3, 5] }] }))
    })
})

describe('theirsFromOps: the op log says who touched what', () => {
    const ops = [
        { version: 1, clientId: 'server', type: 'replaceDocument', payload: {} },
        { version: 2, clientId: 'stage-line', type: 'updateComponent', payload: { entityId: 'rig-deck-1', component: 'transform' } },
        { version: 3, clientId: 'b9fff4ed-9dc', type: 'updateComponent', payload: { entityId: 'rig-deck-1', component: 'transform' } },
        { version: 4, clientId: 'b9fff4ed-9dc', type: 'deleteEntity', payload: { entityId: 'rig-dj-stair-1' } },
        { version: 5, clientId: 'b9fff4ed-9dc', type: 'updateComponent', payload: { entityId: 'rig-par-columns-01', component: 'light' } },
        { version: 6, clientId: 'stage-line', type: 'updateComponent', payload: { entityId: 'rig-deck-2', component: 'transform' } }
    ]
    it('names what another client moved or removed, not what the scripts did, not other components', () => {
        const t = theirsFromOps(ops)
        expect(t.ids.map((x) => x.id)).toEqual(['rig-deck-1', 'rig-dj-stair-1'])
        expect(t).toMatchObject({ views: false, complete: true })
    })
    it('says when the log is only a window (cannot vouch for older edits)', () => {
        expect(theirsFromOps(ops.slice(2)).complete).toBe(false)
    })
})
