// MOXIR v2 GROUND (2026-10-09, the owner 21:05, ledger N465: "other washes and beams what we dont use make on the ground, not on the
// arcs ... washs are so close on the ground ... use space right"). moxir_v2_ground.py build writes the ground layer (only the floor
// lamps) and the full rig (the spread with its non-truss, non-laser, non-smoke units replaced by that layer). This file guards both.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { v1Entities, v1Looks } from '../rigbuild/epic-build.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, 'rigs', f), 'utf8'))
// MOXIR_GROUND_RIG lets the rule run on another rig file (how it was seen failing first: the spread, 2026-10-09)
const N = read(process.env.MOXIR_GROUND_RIG || 'moxir-v2-ground-2026-10-09.json')
const layer = () => read('moxir-v2-ground-layer-2026-10-09.json') // read where it is used: the rule above runs without it
const OLD = read('moxir-v2-spread-2026-10-09.json')
const ZONES = read('moxir-v2-zones-2026-10-09.json')

const MIN_PAR_SPACING_M = 6.0 // the stated rule (moxir_v2_ground.py PAR_MIN_SPACING_M): the column pitch, one PAR per column foot, pools in pieces
const MAX_NON_TRUSS_M = 3.0 // the brief: no unit off the truss above 3 m
const GROUND_M = 1.0 // the brief: on the floor
const BARRIER_REACH_M = 0.6
const DJ_EYE = [-5.2, 2.03, 4.3]
const CRANE_PARK = { x: [-12, 12], z: [-2, 7], above: 2.5 }

const offTruss = (rig) => rig.fixtures.filter((f) => !f.part.startsWith('cut') && f.type !== 'ext-lc-ultra-mk2') // the cubes: the free crane, another workflow
const plan = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])

/** The owner's rule as a check: nothing off the truss above 3 m, no two ground PARs closer than the stated minimum. Pure. */
const groundViolations = (rig, minSpacing = MIN_PAR_SPACING_M) => {
    const out = []
    const units = offTruss(rig)
    for (const f of units) if (f.p[1] > MAX_NON_TRUSS_M) out.push(`${f.id} (${f.part}) stands at ${f.p[1]} m`)
    const pars = units.filter((f) => f.type === 'up-pl5403')
    for (let i = 0; i < pars.length; i++) {
        for (let j = i + 1; j < pars.length; j++) {
            const d = plan(pars[i].p, pars[j].p)
            if (d < minSpacing - 1e-6) out.push(`${pars[i].id} and ${pars[j].id} are ${d.toFixed(2)} m apart`)
        }
    }
    return out
}

// the light's direction from the room's Euler XYZ (a spot's unrotated beam points -Y), as lights_beta_options.aim_dir
const aimDir = ([a, b, c]) => {
    const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
    const m = [[cb * cc, -cb * sc, sb], [sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb], [-ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb]]
    return [-m[0][1], -m[1][1], -m[2][1]]
}
const inZone = (id, x, z, margin = 0) => ZONES.zones.filter((zz) => zz.id === id).some((zz) => zz.areas.some((a) => a.cells_1m.some((row) =>
    Math.abs(row.z - z) <= 0.5 + margin && row.x_runs.some(([x0, x1]) => x0 - margin <= x && x <= x1 + margin))))
const inRect = (x, z, r, m = 0) => r.x_m[0] + m <= x && x <= r.x_m[1] - m && r.z_m[0] + m <= z && z <= r.z_m[1] - m

describe('MOXIR v2 ground: every wash and beam that is not on the truss stands on the floor', () => {
    it('stands nothing off the truss above 3 m, every lamp on the floor, and no two ground PARs closer than 6 m', () => {
        expect(groundViolations(N)).toEqual([])
        for (const f of offTruss(N).filter((u) => u.type !== 'up-yz31p')) expect(f.p[1], f.id).toBeLessThanOrEqual(GROUND_M)
    })
    it('the control: the spread breaks the same rule (beams at 3.7 m, PARs on brackets, two PARs on one column)', () => {
        const v = groundViolations(OLD)
        expect(v.some((s) => /rig-beam-planes-\d+ \(plane 2/.test(s) && /3\.7 m/.test(s))).toBe(true)
        expect(v.some((s) => / are 1\.\d\d m apart/.test(s))).toBe(true)
    })
    it('is the kit: 18 B380F, 48 PL5403 hung + 2 held back for the truss (12 for it, 10 on it today), 1 smoke machine, 6 cubes', () => {
        const n = (t) => N.fixtures.filter((f) => f.type === t).length
        expect([n('up-b380f'), n('up-pl5403'), n('up-yz31p'), n('ext-lc-ultra-mk2')]).toEqual([18, 48, 1, 6])
        expect(N.fixtures.filter((f) => f.part.startsWith('cut')).length).toBe(10)
        expect(N.reserved_for_truss).toMatchObject({ pars: 12, held_back: 2 })
        expect(n('up-pl5403') - 10 + 12).toBe(50)
        const ids = new Set(N.fixtures.map((f) => f.id))
        for (const id of N.reserved_for_truss.held_back_ids) expect(ids.has(id)).toBe(false)
        expect(ids.size).toBe(N.fixtures.length)
    })
    it('leaves the truss, its lamps, the smoke machine and the cubes exactly as the spread had them (other workflows own them)', () => {
        for (const f of OLD.fixtures.filter((u) => u.part.startsWith('cut') || u.type === 'ext-lc-ultra-mk2' || u.type === 'up-yz31p')) {
            const g = N.fixtures.find((u) => u.id === f.id)
            expect(g.p).toEqual(f.p)
            expect(g.r).toEqual(f.r)
        }
    })
    it('the layer file holds only the 56 ground lamps, each the same in the full rig, ids kept from the spread', () => {
        const L = layer()
        expect(L.fixtures.length).toBe(56)
        expect(L.fixtures.filter((f) => f.type === 'up-pl5403').length).toBe(38)
        const old = new Set(OLD.fixtures.map((f) => f.id))
        for (const f of L.fixtures) {
            expect(old.has(f.id), f.id).toBe(true)
            const g = N.fixtures.find((u) => u.id === f.id)
            expect(g.p).toEqual(f.p)
            expect(g.r).toEqual(f.r)
            expect(f.part.startsWith('cut')).toBe(false)
        }
    })
    it('puts the 18 beams in four pens (the stage pen + three fenced islands), each beam\'s low run inside its pen, short of its barrier', () => {
        const pens = layer().islands
        expect(pens.length).toBe(4)
        expect(pens.filter((p) => p.kind === 'stage pen').length).toBe(1)
        for (const f of N.fixtures.filter((u) => u.type === 'up-b380f')) {
            const pen = pens.find((p) => p.island === f.island)
            expect(pen, f.id).toBeDefined()
            expect(f.p[1]).toBe(0.7) // base on the floor (the head's tilt axis 0.5 m up)
            for (const [x, z] of f.pen_segment) expect(inRect(x, z, pen.rect, BARRIER_REACH_M - 1e-6), `${f.id} low run at ${x} ${z}`).toBe(true)
        }
        for (const p of pens.filter((q) => q.kind !== 'stage pen')) expect(p.heads.length).toBe(4)
    })
    it('ends no beam in the bar or the chill + food zone, on the entry wall or in the crane park; nothing above 2.5 m in the crane park', () => {
        for (const b of N.review.beam_checks) {
            expect(b.ok, b.id).toBe(true)
            const [x, , z] = b.end
            expect(inZone('bar', x, z, 0.5) || inZone('chill', x, z, 0.5), `${b.id} ends at ${x} ${z}`).toBe(false)
            expect(z).toBeLessThanOrEqual(53)
            expect(b.into_crane_or_park).toBe(false)
            expect(b.glare_min_deg_any).toBeGreaterThanOrEqual(29.5) // nobody looks down a beam (eyes.py 30 deg)
        }
        for (const f of offTruss(N)) {
            const inPark = CRANE_PARK.x[0] <= f.p[0] && f.p[0] <= CRANE_PARK.x[1] && CRANE_PARK.z[0] <= f.p[2] && f.p[2] <= CRANE_PARK.z[1]
            if (inPark) expect(f.p[1], f.id).toBeLessThanOrEqual(CRANE_PARK.above)
        }
    })
    it('keeps clear of the entry lasers (#873): nothing in the tower\'s pen, no beam within 1 m of a laser unit, no beam end within 3 m of a far-wall block', () => {
        const ko2 = { x_m: [-10.244, -5.244], z_m: [45.778, 50.778] }
        for (const f of N.fixtures.filter((u) => u.type !== 'ext-lc-ultra-mk2')) expect(inRect(f.p[0], f.p[2], ko2), f.id).toBe(false)
        for (const p of layer().islands) {
            const apart = p.rect.x_m[1] <= ko2.x_m[0] || ko2.x_m[1] <= p.rect.x_m[0] || p.rect.z_m[1] <= ko2.z_m[0] || ko2.z_m[1] <= p.rect.z_m[0]
            expect(apart, p.island).toBe(true)
        }
        const blocks = [[-6.794, 6.669, -53.8], [-6.619, 6.669, -53.8]]
        for (const b of N.review.beam_checks) {
            expect(Math.min(...blocks.map((k) => Math.hypot(b.end[0] - k[0], b.end[1] - k[1], b.end[2] - k[2]))), b.id).toBeGreaterThanOrEqual(3)
            expect(b.entry_aperture_gap_m, b.id).toBeGreaterThanOrEqual(1)
            expect(b.cubes_box_gap_m, b.id).toBeGreaterThanOrEqual(1)
            expect(b.into_laser_keep_out, b.id).toBe(false)
        }
    })
    it('never blinds the DJ: no lamp he sees lit stands within 20 deg of his eye line toward the crowd, at full', () => {
        for (const f of N.fixtures.filter((u) => u.type === 'up-pl5403' || u.type === 'up-b380f')) {
            const v = DJ_EYE.map((e, i) => e - f.p[i])
            const d = Math.hypot(...v)
            const a = aimDir(f.r)
            const inCone = (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) / d >= Math.cos(f.angle_rad)
            if (!inCone) continue
            const deg = (Math.acos(-v[2] / d) * 180) / Math.PI
            expect(deg, f.id).toBeGreaterThanOrEqual(20)
        }
        expect(N.review.dj_glare_all_at_full.ok).toBe(true)
        const key = N.fixtures.filter((f) => f.part === 'DJ key (ground option)')
        expect(key).toHaveLength(1) // a ground OPTION, to combine with the truss DJ light
        expect(key[0].combine_with).toMatch(/truss DJ light/)
    })
    it('guards every floor PAR that stands among people (outside a fenced pen and outside the machines)', () => {
        const isl = layer().islands
        for (const f of offTruss(N).filter((u) => u.type === 'up-pl5403')) {
            const pen = isl.find((p) => inRect(f.p[0], f.p[2], p.rect))
            if (pen || f.part === 'embers') continue
            expect(f.guard, f.id).toMatch(/guard cage/)
        }
    })
    it('powers and patches every lamp within the limits (16 A <= 2 944 W, volt drop <= 5 %, DMX lines <= 32 devices and 512 channels)', () => {
        const circ = N.power.circuits.filter((c) => c.circuit !== 'C-LASER')
        for (const c of circ) {
            expect(c.load_w, c.circuit).toBeLessThanOrEqual(2944)
            expect(c.vdrop_pct, c.circuit).toBeLessThanOrEqual(5)
        }
        const powered = new Set(circ.flatMap((c) => c.units))
        for (const f of N.fixtures.filter((u) => u.type !== 'ext-lc-ultra-mk2')) {
            expect(powered.has(f.id), f.id).toBe(true)
            expect(f.dmx?.universe, f.id).toBeGreaterThan(0)
        }
        for (const l of N.patch.lines) {
            expect(l.devices).toBeLessThanOrEqual(32)
            expect(l.channels).toBeLessThanOrEqual(512)
        }
        // the spread's own summary shape (branches + slots) stays, every branch within the line limits
        for (const b of N.patch.branches) expect(b.ok && b.devices <= 32 && b.channels <= 512, b.branch).toBe(true)
        for (const ch of Object.values(N.patch.slots)) expect(ch).toBeLessThanOrEqual(512)
        // every lamp's address range sits inside its universe, and no two lamps share a channel
        const used = new Map()
        for (const f of N.fixtures.filter((u) => u.dmx)) {
            expect(f.dmx.address + f.dmx.footprint - 1, f.id).toBeLessThanOrEqual(512)
            for (let c = f.dmx.address; c < f.dmx.address + f.dmx.footprint; c++) {
                const k = `${f.dmx.universe}/${c}`
                expect(used.has(k), `${f.id} on ${k} with ${used.get(k)}`).toBe(false)
                used.set(k, f.id)
            }
        }
    })
    it('measured the floor glare at the peak within the budget (0.65 % white-out, lasers at their 40 % cap)', () => {
        const g = N.checks.floor_glare_peak_measured
        expect(g).toBeTruthy()
        expect(g.white_pct).toBeLessThanOrEqual(0.65)
        expect(g.laser_fader).toBe(0.4)
        expect(N.looks.find((l) => l.id === 'peak').parts.laser[1]).toBe(0.4)
        // every other audience view (both looks) held to the same budget, drawn on the real GPU at EV100 2.84
        expect(g.every_view_ok).toBe(true)
        for (const [name, f] of Object.entries(g.all_frames)) expect(f.white_pct, name).toBeLessThanOrEqual(0.65)
        expect(Object.keys(g.all_frames).length).toBe(10)
        expect(g.drawn_by.ev100).toBe(2.84)
    })
    it('builds: every look holds only parts the rig has, and the room draws every lamp and the 6 laser lines', () => {
        const parts = new Set(N.fixtures.map((f) => f.part))
        for (const lk of N.looks) for (const p of Object.keys(lk.parts)) expect(parts.has(p) || p === 'laser', p).toBe(true)
        const ents = v1Entities(N)
        expect(ents.filter((e) => e.id.startsWith('rig-laser-'))).toHaveLength(6)
        for (const f of N.fixtures.filter((u) => u.type === 'up-pl5403' || u.type === 'up-b380f')) expect(ents.some((e) => e.id === f.id), f.id).toBe(true)
        const looks = v1Looks(N, ents, { axis: 0.13, stage: { front: 5.65, into: 1 } }, 'x.json')
        expect(looks.looks.map((l) => l.id)).toEqual(['black', 'dark', 'peak'])
    })
})
