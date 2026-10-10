// MOXIR v2 cranes (owner 2026-10-09, N463 / N464): the near crane parked at z 3.20 with the cut half behind the DJ and lighting him
// (11 PL5403), the six LaserCubes SITTING on the free crane's far-side girder at z -12 (B-L). Guards what moxir_v2_cranes.py wrote.
// The pins the brief asks for, each re-derived HERE from the geometry alone (a second implementation, not a re-read of the Python's numbers):
//   - laser margins: every body the cube tubes pass keeps >= 0.25 m (true box + 0.25 m, the 1.008 deg tube), every standing level 3.0 m over /
//     2.5 m beside, every opening of the far wall 2.5 m beside / 3.0 m over its top; every lamp body >= 0.25 m from every cube tube;
//   - person clearance: every part of the cut >= 0.5 m from raised hands (2.5 m) of the DJ on his step and of the public (outside the stage pen
//     and the bay the pen's owed barrier takes in), the lowest lens >= 2.7 m (ISO 13857);
//   - picks: cut-count.mjs on THIS stage and THIS lamp list: every pick <= 146 kg (line and on the bridge), every bridle <= 120 deg.
// MOXIR_V2_CRANES_DIR=<dir> reads the four v2-cranes files from <dir> instead (a tampered copy: how each pin was seen failing first).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { theCut, cutCount, clampPoints, PICK_CAP_KG } from './cut-count.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const RIGS = join(here, 'rigs')
const DIR = process.env.MOXIR_V2_CRANES_DIR || RIGS
const read = (f, dir = RIGS) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const STAGE_FILE = join(DIR, 'moxir-stage-v2-cranes-2026-10-09.json')
const L = read('moxir-lasers-on-crane-2026-10-09.json', DIR)
const rig = read('moxir-v2-cranes-2026-10-09.json', DIR)
const stage = read('moxir-stage-v2-cranes-2026-10-09.json', DIR)
const cutj = read('moxir-crane-cut-v2-cranes-2026-10-09.json', DIR)
const hall = read('moxir-hall-2026-10-09-v10-show-park.hall.json').geometry
const entry = read('moxir-v2-entry-lasers-2026-10-09.json')
const spread = read('moxir-v2-spread-2026-10-09.json')

const rad = (d) => (d * Math.PI) / 180
const sub = (a, b) => a.map((v, i) => v - b[i])
const add = (a, b) => a.map((v, i) => v + b[i])
const mul = (a, k) => a.map((v) => v * k)
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
const norm = (a) => Math.sqrt(dot(a, a))
const rBody = (s) => 0.002 + s * Math.tan(rad(1.008))                      // the body rule's tube
const rPlace = (s) => s * Math.tan(rad(0.8)) + (0.004 + 0.001 * s) / 2      // the levels' tube (0.8 deg fan + 4 mm + 1 mrad)
const boxDist = (q, lo, hi) => Math.hypot(...q.map((v, i) => Math.max(lo[i] - v, v - hi[i], 0)))
const segDist = (q, a, b) => {
    const ab = sub(b, a)
    const t = Math.min(1, Math.max(0, dot(sub(q, a), ab) / dot(ab, ab)))
    return norm(sub(q, add(a, mul(ab, t))))
}
// the tube p -> T sampled every 5 cm: [point, s]
const samples = (p, T, step = 0.05) => {
    const Lb = norm(sub(T, p))
    const d = mul(sub(T, p), 1 / Lb)
    const out = []
    for (let s = 0.05; s <= Lb; s += step) out.push([add(p, mul(d, s)), s])
    out.push([T, Lb])
    return out
}
// body rule: the gap from the tube to a TRUE box padded by `pad` (the laser margin is gap; the rule is gap >= 0.25)
const bodyGap = (p, T, lo, hi, pad = 0.25) => Math.min(...samples(p, T).map(([q, s]) => boxDist(q, lo, hi) - rBody(s) - pad))
const TOPS = ['p05', 'p50', 'p95']
const GIRDER = { dz: hall.cranes[1].girders_dz_m[1], w: hall.cranes[1].girder_w_m }

describe('MOXIR v2 cranes: the pair as decided (N463, N464)', () => {
    it('parks the near crane at z 3.20 and the free crane at z -12, in the stage json and in hall v10 (the scene draws both moved)', () => {
        expect(stage.crane.z_m).toBe(3.2)
        expect(stage.truss.crane_z_m).toBe(3.2)
        expect(stage.crane.hall_record).toMatch(/v10-show-park/)
        expect(hall.cranes[0].z_m).toBeCloseTo(3.2, 6)
        expect(hall.cranes[1].z_m).toBeCloseTo(-12.0, 6)
        expect(hall.cranes[1].trolley.x_m).toEqual([7.6, 10.2])                // H3: the free crane's trolley at the +x end
        expect(rig.near_crane.show_z_m).toBe(3.2)
        expect(rig.far_crane.show_z_m).toBe(-12.0)
    })
    it('keeps the old versions: v2 spread and the laser session\'s aerial-far-crane.json, byte for byte', () => {
        const prev = readFileSync(join(RIGS, 'moxir-aerial-far-crane-2026-10-09.json'))
        expect(createHash('sha256').update(prev).digest('hex')).toBe(L.previous.sha256)
        expect(spread.fixtures.find((f) => f.id === 'rig-par-planes-25').p).toEqual([0.4, 4.5, 7.3])   // v2 spread untouched (the pit stand there)
        expect(rig.kit).toEqual(spread.kit)
        const n = (r, t) => r.fixtures.filter((f) => f.type === t).length
        for (const t of ['up-pl5403', 'up-b380f', 'ext-lc-ultra-mk2', 'up-yz31p']) expect(n(rig, t), t).toBe(n(spread, t))   // the kit stays 50 + 18 + 6 + 1
    })
})

describe('MOXIR v2 cranes: the cut at z 3.20 (11 PL5403)', () => {
    const cut = rig.fixtures.filter((f) => f.layer === 'the cut')
    const C = theCut(STAGE_FILE)
    it('hangs 11 PARs on clamp points of the cut, three of them on the DJ, nothing over the step or the transformer', () => {
        expect(cut).toHaveLength(11)
        const pts = new Set(clampPoints({ uEnds: C.truss.ends.map((e) => e.u_m), picks: C.rigging.picks.map((p) => p.u_m) }))
        for (const l of cutj.pars) expect(pts.has(l.u_m), `${l.id} u ${l.u_m}`).toBe(true)
        expect(cut.filter((f) => f.part === 'dj back')).toHaveLength(2)
        expect(cut.filter((f) => f.part === 'dj kicker')).toHaveLength(1)
        expect(rig.fixtures.some((f) => f.id === 'rig-par-planes-25')).toBe(false)      // the pit stand is gone: its PAR is the kicker
        const stepBack = stage.booth.front_z_m - stage.booth.depth_m
        for (const f of cut) {
            expect(f.p[2]).toBe(3.2)
            expect(f.p[2] + 0.16, `${f.id} hangs over the step`).toBeLessThan(stepBack)   // the body's front (0.16 m) behind the step's back edge
            const hung = f.part !== 'cut up'
            expect(hung && f.p[0] + 0.25 > -11 && f.p[0] - 0.25 < -9.5, `${f.id} hangs over the transformer`).toBe(false)
        }
    })
    it('PICKS: every pick <= 146 kg (line AND on the bridge), every bridle <= 120 deg, for THIS lamp list at THIS park (cut-count.mjs)', () => {
        const u = cutj.pars.map((l) => l.u_m)
        expect(u).toHaveLength(cut.length)
        const cc = cutCount(cut.length, C, { places: u })
        for (const p of cc.picks) {
            expect(p.line_kg, `pick u ${p.u_m}`).toBeLessThanOrEqual(PICK_CAP_KG)
            expect(p.on_bridge_kg, `pick u ${p.u_m} on the bridge`).toBeLessThanOrEqual(PICK_CAP_KG)
            expect(p.bridle_included_deg).toBeLessThanOrEqual(120)
        }
        expect(cc.worst_pick_kg).toBe(rig.review.rigging.worst_line_kg)               // the file says what the tool says
    })
    it('PERSON CLEARANCE: the cut >= 0.5 m from raised hands (2.5 m) of the DJ and of the public, with the pen condition; the lowest lens >= 2.7 m', () => {
        const H = 2.5, CL = 0.5
        const t = C.truss
        const a = [t.ends[0].x_m, t.ends[0].bottom_chord_m + 0.145, 3.2], b = [t.ends[1].x_m, t.ends[1].bottom_chord_m + 0.145, 3.2]
        const parts = []
        parts.push((lo, hi) => { let m = Infinity; for (let k = 0; k <= 400; k += 1) m = Math.min(m, boxDist(add(a, mul(sub(b, a), k / 400)), lo, hi)); return m - 0.145 * Math.SQRT2 })
        for (const tie of t.rigging.tieoffs) parts.push((lo, hi) => { let m = Infinity; for (let k = 0; k <= 400; k += 1) m = Math.min(m, boxDist(add(tie.from_m, mul(sub(tie.to_m, tie.from_m), k / 400)), lo, hi)); return m - 0.05 })
        for (const p of t.rigging.picks) parts.push((lo, hi) => Math.hypot(...[0, 1, 2].map((i) => Math.max(lo[i] - [p.x_m + 0.25, 7.2, 3.2 + 0.8][i], [p.x_m - 0.25, p.apex_m - 0.85, 3.2 - 0.8][i] - hi[i], 0))))
        for (const f of cut) parts.push((lo, hi) => boxDist(f.p, lo, hi) - 0.25)
        const gap = (lo, hi) => Math.min(...parts.map((fn) => fn(lo, hi)))
        const bt = stage.booth
        expect(gap([bt.centre_x_m - bt.width_m / 2, 0, bt.front_z_m - bt.depth_m], [bt.centre_x_m + bt.width_m / 2, bt.deck_h_m + H, bt.front_z_m])).toBeGreaterThanOrEqual(CL)
        // the public: everywhere outside the stage pen and the bay its owed barrier takes in (stage json truss.pen_condition)
        const pen = rig.checks.stage_pen, s = stage.truss.pen_condition
        const slabs = [[[-36.4, 0, -53.8], [s.x_m[0], H, 53.8]], [[s.x_m[0], 0, -53.8], [pen.x_m[0], H, s.z_m[0]]], [[s.x_m[0], 0, s.z_m[1]], [pen.x_m[0], H, 53.8]],
            [[pen.x_m[1], 0, -53.8], [60.4, H, 53.8]], [[-36.4, 0, -53.8], [60.4, H, pen.z_m[0]]], [[-36.4, 0, pen.z_m[1]], [60.4, H, 53.8]]]
        expect(Math.min(...slabs.map(([lo, hi]) => gap(lo, hi)))).toBeGreaterThanOrEqual(CL)
        expect(Math.min(...cut.map((f) => f.p[1]))).toBeGreaterThanOrEqual(2.7)
        expect(s.x_m[0]).toBeLessThanOrEqual(-11.6)                                // the bay reaches the column face (the hl strap's anchor)
    })
    it('lights the DJ from the cut and keeps every lens he sees lit >= 20 deg off his eye line (every unit at full)', () => {
        const eye = [-5.2, 2.03, 4.3]
        const aim = (r) => {                                                     // three.js Euler XYZ (Rx Ry Rz, lights_beta_options.euler_xyz) on (0, -1, 0)
            const [x, y, z] = r
            const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)]
            return [-(-cy * sz), -(cx * cz - sx * sz * sy), -(sx * cz + cx * sz * sy)]
        }
        let seen = 0
        for (const f of rig.fixtures.filter((g) => g.type === 'up-pl5403' || g.type === 'up-b380f')) {
            const to = sub(eye, f.p)
            const d = norm(to)
            if (dot(aim(f.r), mul(to, 1 / d)) < Math.cos(f.angle_rad)) continue  // his eye outside its cone
            seen += 1
            const off = (Math.acos(Math.max(-1, Math.min(1, -to[2] / d))) * 180) / Math.PI
            expect(off, `${f.id} lit in his eyes`).toBeGreaterThanOrEqual(20)
        }
        expect(seen).toBeGreaterThanOrEqual(3)                                   // the back pair + the kicker (behind him) and the key
        const lx = rig.review.summary.dj_face_eye_height_lx
        for (const k of ['dark', 'peak']) expect(lx[k]).toBeGreaterThan(15)
        for (const k of ['dark', 'peak']) expect(rig.review.summary.dj_head_top_lx[k]).toBeGreaterThan(100)
    })
})

describe('MOXIR v2 cranes: the six cubes ON the free crane (B-L)', () => {
    const units = L.units
    const end = L.aim.end_m
    const ops = L.far_wall_openings
    const g = ops.photo_007.far_gate, dr = ops.photo_007.steel_door
    const openings = [{ x: [g.x_left_m.p05, g.x_right_m.p95], top: Math.max(g.top_m.p95, 7.47) }, { x: [dr.x_left_m.p05, dr.x_right_m.p95], top: Math.max(dr.top_m.p95, 2.48) },
        { x: ops.model_gate.x_m, top: ops.model_gate.top_m }]
    const cubeBox = (p) => [[p[0] - 0.0775, p[1] - 0.08, p[2]], [p[0] + 0.0775, p[1] + 0.07, p[2] + 0.155]]
    it('sits six cubes on the far-side girder top (z -13.45), 0.70 m apart, one static beam each to ONE point on the far wall; dark until the sign-off', () => {
        expect(units).toHaveLength(6)
        const xs = units.map((u) => u.x_m)
        for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBeCloseTo(0.7, 6)
        for (const u of units) {
            expect(u.p[2]).toBeCloseTo(hall.cranes[1].z_m - GIRDER.dz - GIRDER.w / 2, 6)   // the far girder's outer edge
            for (const k of TOPS) expect(u.aperture_m[k][1]).toBeCloseTo(L.mount.free_crane_top_m[k] + L.mount.aperture_over_base_m, 6)
            expect(u.to).toEqual(end)
            expect(u.x_m + 0.0775 + 0.25).toBeLessThan(7.6)                      // clear of the parked trolley (x 7.6..10.2, H3) and the cab (x 8.35..)
            expect(u.x_m - 0.0775).toBeGreaterThan(-10.95)                        // and of the end trucks
        }
        expect(end[2]).toBe(-hall.end_wall_inner_y_m)
        const cubes = rig.fixtures.filter((f) => f.type === 'ext-lc-ultra-mk2')
        for (const f of cubes) {
            expect(f.laser.beams).toHaveLength(1)
            expect(f.laser.signed_off).toBe(false)
            expect(units.find((u) => u.id === f.id).p).toEqual(f.p)
        }
        expect(rig.solids.some((s) => s.id === 'rig-crane-bar')).toBe(false)     // nothing hangs (N464)
    })
    it('LASER MARGINS >= 0.25 m: every body the tubes pass, re-derived here (the other cubes, the roof at 10.6, the ASSUMED lamps, #873\'s keep-out, both cranes)', () => {
        const bodies = []
        for (const k of [-54, -48, -42, -36, -30, -24, -18, -12, -6]) {
            if (k !== -54) bodies.push(['roof chord z ' + k, [-12, 10.48, k - 0.12], [12, 10.72, k + 0.12]])
            for (const x of [-12, -6, 0, 6, 12]) bodies.push([`gusset ${x} ${k}`, [x - 0.45, 10.35, k - 0.45], [x + 0.45, 10.72, k + 0.45]])
        }
        for (const z of [-48, -42, -36, -30, -24, -18, -12, -6]) for (const x of [-11.2, -6, 0, 6, 11.2]) bodies.push([`lamp ${x} ${z}`, [x - 0.3, 9.0, z - 0.3], [x + 0.3, 10.6, z + 0.3]])
        for (const sgn of [-1, 1]) bodies.push(['near girder ' + sgn, [-11.35, 7.2, 3.2 + sgn * 1.1 - 0.35], [11.35, 9.02, 3.2 + sgn * 1.1 + 0.35]])
        bodies.push(['free crane stage-side girder', [-11.35, 7.69, -12 + 1.1 - 0.35], [11.35, 9.01, -12 + 1.1 + 0.35]])
        const kos = entry.keep_out.boxes.map((b) => [b.id, [b.x_m[0], b.y_m[0], b.z_m[0]], [b.x_m[1], b.y_m[1], b.z_m[1]]])
        let least = Infinity
        for (const top of TOPS) {
            for (const u of units) {
                const p = u.aperture_m[top]
                for (const [name, lo, hi] of bodies) {
                    const gp = bodyGap(p, end, lo, hi, 0.25)
                    least = Math.min(least, gp)
                    expect(gp, `${u.id} ${top} vs ${name}`).toBeGreaterThanOrEqual(0.25)
                }
                for (const [name, lo, hi] of kos) expect(bodyGap(p, end, lo, hi, 0), `${u.id} ${top} vs ${name}`).toBeGreaterThanOrEqual(0.25)
                for (const o of units) {
                    if (o.id === u.id) continue
                    const [lo, hi] = cubeBox(o.aperture_m[top])
                    expect(bodyGap(p, end, lo, hi, 0), `${u.id} ${top} vs ${o.id}`).toBeGreaterThanOrEqual(0.25)
                }
                // the Python's own per-group margins say the same (margin = gap - 0.25 >= 0)
                for (const [grp, v] of Object.entries(L.checks.beams.find((b) => b.cube === u.id).tops[top].by_group)) expect(v.margin_m, `${u.id} ${top} ${grp}`).toBeGreaterThanOrEqual(0)
            }
        }
        // the binding body (the roof chord at z -48, low end) agrees with the Python within 1 cm: min gap 0.448 m
        expect(Math.abs(least - L.checks.summary.lasers_min_body_gap_m)).toBeLessThan(0.01)
    })
    it('LASER MARGINS: every lamp body of the rig >= 0.25 m from every cube tube (moxir_v2_spread.tube_clearance), re-derived here', () => {
        const R = { 'up-pl5403': 0.25, 'up-b380f': 0.45, 'up-yz31p': 0.5 }
        let least = Infinity
        for (const f of rig.fixtures.filter((x) => R[x.type])) {
            for (const u of units) {
                const Lb = norm(sub(u.to, u.p))
                const d = mul(sub(u.to, u.p), 1 / Lb)
                const s = Math.min(Lb, Math.max(0, dot(sub(f.p, u.p), d)))
                const gp = norm(sub(f.p, add(u.p, mul(d, s)))) - rBody(s) - R[f.type]
                least = Math.min(least, gp)
                expect(gp, `${f.id} vs ${u.id}`).toBeGreaterThanOrEqual(0.25)
            }
        }
        expect(Math.abs(least - L.checks.summary.lamp_bodies_min_gap_to_a_cube_tube_m)).toBeLessThan(0.01)
    })
    it('STANDING LEVELS and the far wall: 3.0 m over the floor (5.0) and the free crane\'s cab, the end 2.5 m beside / 3.0 m over every opening, under the plaster top', () => {
        for (const top of TOPS) {
            for (const u of units) {
                const p = u.aperture_m[top]
                const floor = Math.min(...samples(p, end).map(([q, s]) => q[1] - rPlace(s) - (2.0 + 3.0)))
                expect(floor, `${u.id} over the floor`).toBeGreaterThanOrEqual(0)
                const cab = Math.min(...samples(p, end).map(([q, s]) => Math.max(Math.hypot(Math.max(8.35 - q[0], q[0] - 10.35, 0), Math.max(-13 - q[2], q[2] + 11, 0)) - rPlace(s) - 2.5,
                    q[1] - rPlace(s) - (6.15 + 2.0 + 3.0))))
                expect(cab, `${u.id} vs the free crane's cab`).toBeGreaterThanOrEqual(0)
                const Lb = norm(sub(end, p))
                for (const op of openings) {
                    const lat = Math.max(op.x[0] - end[0], end[0] - op.x[1], 0) - rPlace(Lb)
                    expect(Math.max(lat - 2.5, end[1] - rPlace(Lb) - (op.top + 3.0)), `${u.id} end vs ${JSON.stringify(op)}`).toBeGreaterThanOrEqual(0)
                }
                expect(10.79 - 0.5 - (end[1] + rBody(Lb))).toBeGreaterThanOrEqual(0)
            }
        }
        // the binding term (the far gate as the model draws it) agrees with the Python within 1 cm
        const u0 = units[units.length - 1], Lb = norm(sub(end, u0.aperture_m.p50))
        const gate = Math.max(Math.max(-2.4 - end[0], end[0] - 2.4, 0) - rPlace(Lb) - 2.5, end[1] - rPlace(Lb) - 8.4)
        expect(Math.abs(gate - L.checks.summary.lasers_min_opening_margin_m)).toBeLessThan(0.01)
    })
    it('casts every ray of both fans onto the far wall\'s block, clear of its openings; the mounts are clear; the Safety Zone fits the window less 0.5 deg', () => {
        expect(L.checks.casts).toHaveLength(6)
        for (const c of L.checks.casts) {
            for (const top of TOPS) {
                for (const k of ['fan_0_8', 'fan_1_008']) {
                    expect(c[top][k].rays).toBe(61)
                    expect(c[top][k].all_first_hit_far_wall_block, `${c.cube} ${top} ${k}`).toBe(true)
                    expect(c[top][k].all_clear_of_openings, `${c.cube} ${top} ${k}`).toBe(true)
                    expect(c[top][k].first_hits).toEqual(['hall-block'])
                }
                expect(c[top].mount.clear_first_2_m).toBe(true)
            }
        }
        for (const s of L.setup_sheet) {
            expect(s.laseros_safety_zone_keep_in_deg.inside_window_less_0_5_mount, s.cube).toBe(true)
            for (const w of s.window_rule_holds_deg.half_widths_pan_tilt.map(Math.abs)) expect(w).toBeGreaterThanOrEqual(0.8)
        }
        expect(L.checks.passes).toBe(true)
        expect(rig.review.fails).toEqual([])
    })
    it('re-checks #873\'s two 40 W beams at the new park: their own terms pass (+0.23 m); the cubes\' body rule on the near girders is reported, not hidden', () => {
        for (const v of Object.values(L.checks.forty_watt)) {
            expect(v.their_worst_m).toBeGreaterThanOrEqual(0)
            expect(v.cubes_body_rule_on_the_near_girders_m).toBeLessThan(0)       // the match's finding for the lead: stated in the file
        }
    })
})
