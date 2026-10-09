// MOXIR v2, the two Poligraf UP-LA40WF at the entry (owner 2026-10-09, N460.2 / N462; the cubes on the crane, N464).
// Guards what moxir_entry_lasers.py wrote: both beams pass the cubes' rule set (3.0 m over / 2.5 m beside every standing place,
// the 0.8 deg fan, the safe ends of every range), every ray of the fan first-hits the far wall's matte block, the places are the
// cubes' 13 (+ the free crane's cab), the mounts that cannot pass are said to fail, the hard stop fits the window, the NOHD is
// the IEC 60825-1 formula, and the keep-out envelope leaves the upper entry wall to the cubes. A few margins are re-derived here
// in JS from the beam geometry alone (a second implementation of the same tube): they must agree with the Python to 1 cm.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(here, 'rigs', f), 'utf8'))
const rig = read('moxir-v2-entry-lasers-2026-10-09.json')
const v11 = read('moxir-epic-v1-1-2026-10-08.json')
const hall = read('moxir-hall-2026-10-08-v9-show-park.hall.json').geometry
const stage = read('moxir-stage-v1-1-2026-10-08.json')

const rad = (d) => (d * Math.PI) / 180
const fanR = (s, half = rig.rule.fan_deg) => s * Math.tan(rad(half)) + (rig.unit_kind.aperture_m['tube (clearance)'] + (rig.unit_kind.divergence_mrad / 1000) * s) / 2
// the beam as a line p -> T: the axis point and the distance from the aperture at a given z
const atZ = (p, T, z) => {
    const t = (z - p[2]) / (T[2] - p[2])
    const q = p.map((v, i) => v + t * (T[i] - v))
    return { q, s: Math.hypot(...q.map((v, i) => v - p[i])) }
}

describe('MOXIR v2: the two UP-LA40WF at the entry', () => {
    const units = rig.fixtures
    it('hangs two units, house left at the entry end, each with one beam that passes', () => {
        expect(units).toHaveLength(2)
        for (const f of units) {
            expect(f.type).toBe('up-la40wf')
            expect(f.laser.beams).toHaveLength(1)
            const b = f.laser.beams[0]
            expect(b.pass, b.id).toBe(true)
            expect(b.worst_margin_m, b.id).toBeGreaterThanOrEqual(0)
            expect(b.margin_after_zone_deg, b.id).toBeGreaterThan(0)            // the 0.8 deg fan fits, with some left
            expect(f.p[2]).toBeGreaterThan(40)                                  // up at the entry end
            expect(f.p[0]).toBeLessThan(0)                                      // house left: the only side with a line
            expect(f.p[0]).toBeGreaterThanOrEqual(-11.0 + 2.5)                  // 2.5 m beside the left runway walkway
            expect(f.p[1]).toBeGreaterThanOrEqual(rig.rule.person_m + rig.rule.vertical_m)
            expect(f.laser.signed_off).toBe(false)                              // the desk holds it at 0 until the sign-off
            expect(b.to[2]).toBe(rig.rule.end_z_m)                              // the far (SE) end wall
        }
        expect(Math.abs(units[0].p[0] - units[1].p[0])).toBeCloseTo(0.7, 6)    // side by side, one bar
    })
    it('casts the axis + 60 rays of each fan on the hall triangles: every first hit is the far wall matte block', () => {
        for (const f of units) {
            const c = f.laser.beams[0].cast
            expect(c.rays).toBe(61)
            expect(c.all_on_matte_block, f.id).toBe(true)
            expect(c.first_hits).toEqual(['end wall z -54 [hall-block]'])       // never glass, the gate, steel, a crane, the cut, a lamp, a cube, people
            expect(c.end_y_m[0]).toBeGreaterThanOrEqual(rig.rule.person_m + rig.rule.vertical_m)
            expect(f.laser.beams[0].cast_bad_rays).toEqual([])
        }
    })
    it('uses the cubes\' 13 places (v1.1 rig) and adds only the free crane\'s cab', () => {
        const cubes = v11.checks_v1_1.laser_rule.places.map((p) => [p.name, p.x_m, p.z_m, p.surface_m])
        const mine = rig.rule.places.map((p) => [p.name, p.x_m, p.z_m, p.surface_m])
        expect(mine.slice(0, cubes.length)).toEqual(cubes)
        expect(mine).toHaveLength(cubes.length + 1)
        expect(mine.at(-1)[0]).toMatch(/^free crane cab/)
        expect(rig.rule.near_crane_underside_used_m).toBe(v11.checks_v1_1.laser_rule.crane_underside_used_m)   // 7.2, the safe end
        expect(rig.rule.fan_deg).toBe(v11.checks_v1_1.laser_rule.fan_deg)
        expect([rig.rule.person_m, rig.rule.vertical_m, rig.rule.lateral_m]).toEqual([v11.checks_v1_1.laser_rule.person_m, v11.checks_v1_1.laser_rule.vertical_m, v11.checks_v1_1.laser_rule.lateral_m])
    })
    it('clears every body by its margin: lamps of all three rigs, the cubes on the free crane, the cut, its tie-offs, the other unit', () => {
        for (const f of units) {
            const b = f.laser.beams[0]
            for (const [name, v] of Object.entries(b.lamp_bodies)) expect(v.margin_m, `${b.id} vs ${name}`).toBeGreaterThanOrEqual(0)
            expect(Object.keys(b.lamp_bodies)).toHaveLength(3)
            for (const k of ['near_crane_under_margin_m', 'free_crane_under_margin_m', 'cubes_on_the_free_crane_margin_m', 'cut_truss_margin_m', 'cut_picks_margin_m',
                'cut_tieoffs_margin_m', 'pendant_lamp_margin_m', 'other_unit_margin_m', 'end_gate_margin_m', 'end_under_roof_frame_margin_m']) {
                expect(b[k], `${b.id} ${k}`).toBeGreaterThanOrEqual(0)
            }
            for (const [k, v] of Object.entries(b.all_margins_m)) expect(v, `${b.id} ${k}`).toBeGreaterThanOrEqual(0)
        }
    })
    it('re-derives the binding margins in JS from the geometry alone (the near crane, the DJ step, the far floor): within 1 cm', () => {
        const c0 = hall.cranes[0]
        const b = stage.booth
        for (const f of units) {
            const B = f.laser.beams[0]
            // the near crane: the tube's top under the safe underside 7.2 wherever it is under a girder. The v1.1 rule (moxir_v1_1.py
            // beam_path_checks) widens each girder's z band by the tube radius, the conservative way: mirrored here.
            let crane = Infinity
            for (const dz of c0.girders_dz_m) {
                const g0 = c0.z_m + dz - c0.girder_w_m / 2, g1 = c0.z_m + dz + c0.girder_w_m / 2
                for (let z = g0 - 1.5; z <= g1 + 1.5; z += 0.005) {
                    const a = atZ(f.p, B.to, z)
                    const R = fanR(a.s)
                    if (z < g0 - R || z > g1 + R) continue
                    crane = Math.min(crane, rig.rule.near_crane_underside_used_m - (a.q[1] + R))
                }
            }
            expect(crane).toBeGreaterThanOrEqual(0)
            expect(Math.abs(crane - B.near_crane_under_margin_m)).toBeLessThan(0.01)
            // the DJ step: within 2.5 m of its footprint the tube's bottom is >= 0.4 + 2.0 + 3.0; the lowest such point
            let dj = Infinity
            for (let z = b.front_z_m - b.depth_m - 4; z <= b.front_z_m + 4; z += 0.01) {
                const a = atZ(f.p, B.to, z)
                const x0 = b.centre_x_m - b.width_m / 2, x1 = b.centre_x_m + b.width_m / 2
                const hg = Math.hypot(Math.max(x0 - a.q[0], a.q[0] - x1, 0), Math.max(b.front_z_m - b.depth_m - z, z - b.front_z_m, 0)) - fanR(a.s)
                if (hg - rig.rule.lateral_m >= 0) continue
                dj = Math.min(dj, Math.max(hg - rig.rule.lateral_m, a.q[1] - fanR(a.s) - (b.deck_h_m + rig.rule.person_m + rig.rule.vertical_m)))
            }
            expect(dj).toBeGreaterThanOrEqual(0)
            expect(Math.abs(dj - B.places['DJ step'].margin_m)).toBeLessThan(0.01)
            // the floor at the far wall: the fan's bottom >= 5.0 there
            const end = B.to[1] - fanR(B.length_m) - (rig.rule.person_m + rig.rule.vertical_m)
            expect(end).toBeGreaterThanOrEqual(0)
            expect(B.end_fan_y_m[0]).toBeCloseTo(B.to[1] - fanR(B.length_m), 2)
        }
    })
    it('says plainly which mounts fail: the columns (the walkway), the entry platform, house right, the centre, the door frame', () => {
        const m = Object.fromEntries(rig.mount_options.map((r) => [r.id, r]))
        for (const id of ['tower-z48', 'tower-z50', 'tower-z46', 'tower-z44', 'wall-z53']) expect(m[id].passes, id).toBe(true)
        for (const id of ['column-x-12-z48', 'column-x-12-z54', 'entry-platform', 'tower-right-z48', 'tower-centre-z48', 'door-frame']) {
            expect(m[id].passes, id).toBe(false)
            expect(m[id].worst_margin_m, id).toBeLessThan(0)
        }
        expect(m['column-x-12-z48'].binding).toMatch(/runway walkway left/)
        expect(rig.mount.chosen).toBe('tower-z48')
        // further in buys margin, nearer the door costs it (the fan grows with the throw)
        expect(m['tower-z44'].worst_margin_m).toBeGreaterThan(m['tower-z48'].worst_margin_m)
        expect(m['wall-z53'].worst_margin_m).toBeLessThan(m['tower-z48'].worst_margin_m)
    })
    it('fits the hard stop (aperture mask, aim +-0.3 deg) inside the window after the 0.5 deg mount tolerance', () => {
        for (const s of rig.setup_sheet) {
            expect(s.hard_stop_aperture_mask_deg.why, s.unit).toMatch(/: yes$/)
            for (const w of s.window_rule_holds_deg.half_widths_pan_tilt.map(Math.abs)) expect(w).toBeGreaterThanOrEqual(rig.rule.fan_deg)
            expect(s.beam_block.lowest_ray_allowed_tilt_deg).toBeCloseTo(s.window_rule_holds_deg.tilt[0], 6)
        }
    })
    it('states the NOHD by the IEC 60825-1 formula: about 1.1 km at 41 W, far longer than the 108 m hall', () => {
        const mpe = (18 * 0.25 ** 0.75) / 0.25
        const nohd = (P, a, phi) => (Math.sqrt((4 * P) / (Math.PI * mpe)) - a) / phi
        const P = Object.values(rig.unit_kind.power_w_by_nm).reduce((x, y) => x + y, 0)
        expect(P).toBe(41)
        expect(rig.nohd.all_colours_41w_0_25s_m).toBe(Math.round(nohd(P, rig.unit_kind.aperture_m.nohd, rig.unit_kind.divergence_mrad / 1000)))
        expect(rig.nohd.all_colours_41w_0_25s_m).toBeGreaterThan(10 * 108)
        expect(rig.nohd.dimming_0_25s_m['1 %']).toBeGreaterThan(3)                 // dimming is not a control
    })
    it('hands back a keep-out envelope that leaves the upper entry wall (y >= 9, x -6..4) to the cubes (N464)', () => {
        const boxes = rig.keep_out.boxes
        expect(boxes.length).toBeGreaterThanOrEqual(3)
        for (const k of boxes) {
            const onUpperWall = k.y_m[1] >= 9 && k.x_m[0] <= 4 && k.x_m[1] >= -6 && k.z_m[1] >= hall.end_wall_inner_y_m - 0.25
            expect(onUpperWall, k.id).toBe(false)
            expect(k.y_m[1], k.id).toBeLessThan(9 - 0.25)
        }
        // the units sit inside KO-1, and KO-3 holds every beam's tube top
        const ko1 = boxes.find((k) => k.id.startsWith('KO-1'))
        for (const f of units) {
            expect(f.p[0]).toBeGreaterThan(ko1.x_m[0])
            expect(f.p[0]).toBeLessThan(ko1.x_m[1])
            expect(f.p[1]).toBeGreaterThan(ko1.y_m[0])
            expect(f.p[1]).toBeLessThan(ko1.y_m[1])
        }
        expect(rig.keep_out.tubes_highest_y_m).toBe(Math.max(...boxes.filter((k) => k.id.startsWith('KO-3')).map((k) => k.y_m[1])))
    })
})
