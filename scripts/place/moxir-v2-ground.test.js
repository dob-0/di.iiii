// MOXIR v2 GROUND (2026-10-09, the owner 21:05, ledger N465: "other washes and beams what we dont use make on the ground, not on the
// arcs ... washs are so close on the ground ... use space right"). moxir_v2_ground.py build writes the ground layer (only the floor
// lamps) and the full rig (the spread with its non-truss, non-laser, non-smoke units replaced by that layer). This file guards both.
// 2026-10-10 (the two reviews of #875): the rules below re-compute the safety geometry HERE, from the rig file's own numbers, with
// their own code (not the builder's): the dense 30 deg rule, no standing eye in a PAR's beam, pens sized for each head's whole desk
// window, the stage front's lux floors, every non-truss unit on the ground. Each was seen failing on the first build (4d76fc1c):
// MOXIR_GROUND_RIG / MOXIR_GROUND_LAYER point the file at another rig and layer (absolute paths, or names in rigs/).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { v1Entities, v1Looks } from '../rigbuild/epic-build.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(here, 'rigs', f), 'utf8'))
const N = read(process.env.MOXIR_GROUND_RIG || 'moxir-v2-ground-2026-10-09.json')
const layer = () => read(process.env.MOXIR_GROUND_LAYER || 'moxir-v2-ground-layer-2026-10-09.json') // read where it is used: the first rule runs without it
const OLD = read('moxir-v2-spread-2026-10-09.json')
const ZONES = read('moxir-v2-zones-2026-10-09.json')
const HALL = read('moxir-hall-2026-10-08-v9-show-park.hall.json').geometry

const MIN_PAR_SPACING_M = 6.0 // the stated rule (moxir_v2_ground.py PAR_MIN_SPACING_M): the column pitch, one PAR per column foot, pools in pieces
const MAX_NON_TRUSS_M = 3.0 // the brief: no unit off the truss above 3 m
const GROUND_M = 1.0 // the brief: on the floor
const BARRIER_REACH_M = 0.6
const DJ_EYE = [-5.2, 2.03, 4.3]
const CRANE_PARK = { x: [-12, 12], z: [-2, 7], above: 2.5 }
const STAGE_PEN = { x_m: [-10.5, 1.5], z_m: [-7.5, 8.2] }
const FOH_RISER = { x_m: [-6.7, -3.7], z_m: [28.0, 30.0] }
const FRONT_PARTS = ['DJ key (ground option)', 'stage front booth (ground)', 'stage front PA L (ground)', 'stage front PA R (ground)']
// the rules this file states (moxir_v2_ground.py FIX block, 2026-10-10): the same numbers, checked by this file's own code
const GLARE_DEG = 30 // eyes.py GLARE_DEG: nobody looks down a beam within 30 deg
const EYE_YS = [1.5, 1.7, 1.9] // standing eyes, short to tall adult (+0.6 m on the FOH riser)
const LOW_EDGE_DEG = 0.9 + 2.0 // the B380F's half beam + the aim tolerance (base levelled +-1 deg, repeat +-1 deg)
const APERTURE_R_M = 0.08 // the B380F's 160 mm lens: the lower edge leaves its lowest point
const HEAD_REACH_M = 1.5 // ISO 13857:2019 Table 2 (high risk): a 0.6-0.8 m moving head behind a 1.0-1.2 m barrier
const FAN_STRIP = { x_m: [-9.0, -0.4], z_m: [-5.4, -2.5] } // the stage pen's beam strip: crew never walk in it
const CREW_LANES = [{ x_m: [-10.5, 1.5], z_m: [-7.5, -6.6] }, { x_m: [0.0, 1.5], z_m: [-7.5, -2.0] }]
const SMOKE_SERVICE = [-4.75, -6.7] // the smoke machine refilled from behind
const PAR_HALF_DEG = 7.5 + 1.0 // the PL5403's 15 deg lens + 1 deg aim tolerance
const PAR_LENS_R_M = 0.105
const LEAN_M = 0.5 // a head leaning over a 1.1 m barrier
const PAR_CD_ROOM = 609.56 / 0.02 // the room's own PAR (epic-build candelaOf)
const OUT_OF_REACH_M = 1.4 // ISO 13857:2019 Table 2 (high risk): a 0.4-0.6 m lamp behind a 1.0 m barrier
const BARRIER_Z = 8.16
// the stage front as the owner saw it on 10-09 (the spread's room, review.stage_light_after.room_30478cd), rounded down
const FLOORS_LX = { peak: { 'DJ face': 44, 'booth front': 31, 'PA L face': 35, 'PA R face': 35 }, dark: { 'DJ face': 44, 'booth front': 31, 'PA L face': 35, 'PA R face': 19 } }
const TARGETS = { 'DJ face': [[-5.2, 1.9, 4.6], [0, 0, 1]], 'booth front': [[-5.2, 1.0, 5.3], [0, 0, 1]], 'PA L face': [[-8.25, 1.0, 6.75], [0, 0, 1]], 'PA R face': [[-1.5, 1.0, 7.25], [0, 0, 1]] }

const offTruss = (rig) => rig.fixtures.filter((f) => !f.part.startsWith('cut') && f.type !== 'ext-lc-ultra-mk2') // the cubes: the free crane, another workflow
const plan = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])
const hallPars = (rig) => offTruss(rig).filter((f) => f.type === 'up-pl5403' && !FRONT_PARTS.includes(f.part))

/** The owner's rule as a check: nothing off the truss above 3 m, no two of the hall's ground PARs closer than the stated minimum
 * (the three stage-front lamps light the stage, not the hall). Pure. */
const groundViolations = (rig, minSpacing = MIN_PAR_SPACING_M) => {
    const out = []
    for (const f of offTruss(rig)) if (f.p[1] > MAX_NON_TRUSS_M) out.push(`${f.id} (${f.part}) stands at ${f.p[1]} m`)
    const pars = hallPars(rig)
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
const rectGap = (x, z, r) => Math.hypot(Math.max(r.x_m[0] - x, x - r.x_m[1], 0), Math.max(r.z_m[0] - z, z - r.z_m[1], 0))
const D2R = Math.PI / 180
const dirOf = (az, el) => [Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), Math.cos(el * D2R) * Math.cos(az * D2R)]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => Math.hypot(a[0], a[1], a[2])
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unitV = (a) => { const n = norm(a); return [a[0] / n, a[1] / n, a[2] / n] }

// ---- the public floor, as moxir_v2_ground.people_cells / public_points: every painted 1 m cell people may stand on (hot, wings,
// bar, chill), not the stage pen, not a machine (the hall's massing at floor level), split into sub-cells; the fenced pens out
const massingAt = (x, z) => HALL.massing.some((m) => !m.id.startsWith('pendant') && m.x_m[0] <= x && x <= m.x_m[1] && m.z_m[0] <= z && z <= m.z_m[1] && m.y_m[0] < 1.0 && m.y_m[1] > 0.0)
let CELLS = null
const peopleCells = () => {
    if (CELLS) return CELLS
    const seen = new Set()
    CELLS = []
    for (const zid of ['hot', 'use', 'bar', 'chill']) {
        for (const zz of ZONES.zones.filter((q) => q.id === zid)) {
            for (const a of zz.areas) {
                for (const row of a.cells_1m) {
                    for (const [x0, x1] of row.x_runs) {
                        for (let x = Math.round(x0); x <= Math.round(x1); x++) {
                            const k = `${x},${row.z}`
                            if (seen.has(k)) continue
                            seen.add(k)
                            if (inRect(x, row.z, STAGE_PEN) || massingAt(x, row.z)) continue
                            CELLS.push([x, row.z])
                        }
                    }
                }
            }
        }
    }
    return CELLS
}
const publicPoints = (step, exclude) => {
    const n = Math.max(1, Math.round(1 / step))
    const offs = [...Array(n)].map((_, i) => (i + 0.5) / n - 0.5)
    const out = []
    for (const [x, z] of peopleCells()) {
        for (const ox of offs) {
            for (const oz of offs) {
                const px = x + ox
                const pz = z + oz
                if (!exclude.some((R) => inRect(px, pz, R))) out.push([px, pz])
            }
        }
    }
    return out
}
const fencedPens = (L) => [...(L.islands || []).filter((p) => p.kind !== 'stage pen').map((p) => p.rect), ...(L.par_pens || []).map((p) => p.rect)]
const headOf = (f) => [f.p[0], f.p[1] - 0.2, f.p[2]] // the B380F's tilt axis 0.5 m over its base (the body's p is 0.7)

/** A head's whole desk window: every pan of its limits (2.5 deg steps) x its tilts (the limit, +5, +10, +15 deg), from the rig's
 * own desk_limits. A head without limits is its aim alone (and fails the rule that asks for them). */
const windowOf = (f) => {
    const lim = f.desk_limits
    if (!lim) return [aimDir(f.r)]
    const [az0, az1] = lim.world_az_deg
    const span = (az1 - az0 + 360) % 360
    const [el0, el1] = lim.world_el_deg
    const out = []
    for (let k = 0; k <= Math.round(span / 2.5); k++) for (const t of [0, 5, 10, 15]) out.push(dirOf(az0 + k * 2.5, Math.min(el0 + t, el1, 89.5)))
    return out
}

/** FIX 3, this file's own code: the share (%) of the public floor (0.5 m points, eyes at 1.5 / 1.7 / 1.9 m) from which any beam's
 * window direction is within 30 deg of the line to the eye, at the head. Returns { pct, points, fail, worst }. */
const fieldGlare = (rig, L) => {
    const P = publicPoints(0.5, fencedPens(L))
    const beams = rig.fixtures.filter((f) => f.type === 'up-b380f').map((f) => ({ id: f.id, h: headOf(f), W: windowOf(f) }))
    const cosLim = Math.cos(GLARE_DEG * D2R)
    let fail = 0
    let worst = null
    for (const [x, z] of P) {
        const riser = inRect(x, z, FOH_RISER) ? 0.6 : 0
        let bad = false
        for (const y of EYE_YS) {
            for (const b of beams) {
                const v = [x - b.h[0], y + riser - b.h[1], z - b.h[2]]
                const n = norm(v)
                for (const d of b.W) {
                    const c = dot(d, v) / n
                    if (c > cosLim) {
                        bad = true
                        if (!worst || c > worst.c) worst = { c, x, z, y, beam: b.id }
                        break
                    }
                }
                if (bad) break
            }
            if (bad) break
        }
        if (bad) fail++
    }
    return { pct: (100 * fail) / P.length, points: P.length, fail, worst: worst && { ...worst, deg: Math.acos(worst.c) / D2R } }
}

/** FIX 5, this file's own code: a PAR's beam (15 deg + 1 deg, from its 0.21 m lens) between 1.5 and 1.9 m, up to its throw (the
 * rig's throw_m, else 30 m): the plan points an eye there would be in. Rays: the axis + rings at 1/3, 2/3, 1 of the half angle. */
const parFootprint = (f) => {
    const p = f.p
    const a = unitV(aimDir(f.r))
    const u = unitV(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    const w = cross(a, u)
    const rays = [[a, 0]]
    for (const [fr, n] of [[1 / 3, 8], [2 / 3, 16], [1, 24]]) {
        const th = PAR_HALF_DEG * fr * D2R
        for (let j = 0; j < n; j++) {
            const ph = (2 * Math.PI * j) / n
            const d = [0, 1, 2].map((k) => Math.cos(th) * a[k] + Math.sin(th) * (Math.cos(ph) * u[k] + Math.sin(ph) * w[k]))
            rays.push([d, fr])
        }
    }
    const throwM = (f.throw_m ?? 30) * 1.05
    const pts = []
    for (const [d, fr] of rays) {
        if (d[1] <= 1e-6) continue
        const side = [0, 1, 2].map((k) => d[k] - a[k] * dot(d, a))
        const sn = norm(side)
        const s0 = sn > 1e-9 ? [0, 1, 2].map((k) => p[k] + (side[k] / sn) * PAR_LENS_R_M * fr) : p
        const lo = Math.max((Math.min(...EYE_YS) - s0[1]) / d[1], 0)
        const hi = Math.min((Math.max(...EYE_YS) - s0[1]) / d[1], throwM)
        if (hi < lo) continue
        for (let k = 0; k <= 5; k++) {
            const s = lo + ((hi - lo) * k) / 5
            pts.push([s0[0] + d[0] * s, s0[2] + d[2] * s])
        }
    }
    return pts
}
/** FIX 5: every floor PAR whose eye footprint comes within LEAN_M of a public feet point (0.25 m). Returns [{ id, gap }]. */
const parEyeFails = (rig, L) => {
    const P = publicPoints(0.25, fencedPens(L))
    const out = []
    for (const f of offTruss(rig).filter((u) => u.type === 'up-pl5403')) {
        const fp = parFootprint(f)
        if (!fp.length) continue
        const xs = fp.map((q) => q[0])
        const zs = fp.map((q) => q[1])
        const [x0, x1, z0, z1] = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...zs) - 1, Math.max(...zs) + 1]
        let gap = Infinity
        for (const [x, z] of P) {
            if (x < x0 || x > x1 || z < z0 || z > z1) continue
            for (const q of fp) gap = Math.min(gap, Math.hypot(x - q[0], z - q[1]))
        }
        if (gap < LEAN_M) out.push({ id: f.id, gap: Math.round(gap * 100) / 100 })
    }
    return out
}

/** FIX 2, this file's own code: one window direction's low run (the lower edge, from the lens's lowest point, under 3.0 m over
 * the standing level), every 0.01 m. Returns the plan points of the run. */
const levelAt = (x, z) => (x >= -6.7 && x <= -3.7 && z >= 3.65 && z <= 5.65 ? 0.4 : x >= -6.7 && x <= -3.7 && z >= 27 && z <= 31 ? 0.6 : 0)
const lowRun = (h, d) => {
    const k = d[1] - Math.tan(LOW_EDGE_DEG * D2R)
    if (k <= 1e-3) return null
    const smax = (3.0 + 0.6 + APERTURE_R_M - h[1]) / k + 0.05
    const out = []
    for (let s = 0; s <= smax; s += 0.01) {
        const q = [h[0] + d[0] * s, h[1] + d[1] * s, h[2] + d[2] * s]
        if (q[1] - s * Math.tan(LOW_EDGE_DEG * D2R) - APERTURE_R_M - levelAt(q[0], q[2]) < 3.0) out.push([q[0], q[2]])
    }
    return out
}
/** FIX 2 + 4: every B380F's low runs over its whole pan window (1 deg steps, at its tilt limit) inside its pen less the hand reach;
 * in the stage pen also inside the fan strip, >= 1.0 m from the smoke machine's refill point and >= 0.3 m from the crew lanes;
 * a fenced pen's head >= HEAD_REACH_M from its barrier. Returns the violations. */
const penViolations = (rig, L) => {
    const pens = Object.fromEntries((L.islands || []).map((p) => [p.island, p]))
    const out = []
    for (const f of rig.fixtures.filter((u) => u.type === 'up-b380f')) {
        const pen = pens[f.island]
        if (!pen) { out.push(`${f.id}: no pen`); continue }
        if (!f.desk_limits) { out.push(`${f.id}: no desk limits`); continue }
        const h = headOf(f)
        const stage = pen.kind === 'stage pen'
        if (!stage && Math.min(h[0] - pen.rect.x_m[0], pen.rect.x_m[1] - h[0], h[2] - pen.rect.z_m[0], pen.rect.z_m[1] - h[2]) < HEAD_REACH_M - 1e-6) {
            out.push(`${f.id}: head within ${HEAD_REACH_M} m of its barrier`)
        }
        const [az0, az1] = f.desk_limits.world_az_deg
        const span = (az1 - az0 + 360) % 360
        const el0 = f.desk_limits.world_el_deg[0]
        for (let k = 0; k <= Math.round(span); k++) {
            const run = lowRun(h, dirOf(az0 + k, el0))
            if (!run) { out.push(`${f.id}: never climbs`); break }
            const bad = run.find(([x, z]) => !inRect(x, z, pen.rect, BARRIER_REACH_M - 1e-6) || (stage && (!inRect(x, z, FAN_STRIP) ||
                Math.hypot(x - SMOKE_SERVICE[0], z - SMOKE_SERVICE[1]) < 1.0 || CREW_LANES.some((R) => rectGap(x, z, R) < 0.3))))
            if (bad) { out.push(`${f.id} at pan ${(az0 + k).toFixed(0)}: run at ${bad[0].toFixed(2)} ${bad[1].toFixed(2)}`); break }
        }
    }
    return out
}

/** The stage front's lux from the ground lamps alone (this file's own code, no shadows): E = I x att x cos(i) / d^2 x level x the
 * colour's luminance share, the three.js spot cone (penumbra 0.5, smoothstep), at the room's PAR candela. */
const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
const frontLux = (rig, lookId) => {
    const lk = rig.looks.find((l) => l.id === lookId)
    const out = {}
    for (const [name, [tp, n]] of Object.entries(TARGETS)) {
        let e = 0
        for (const f of rig.fixtures.filter((u) => FRONT_PARTS.includes(u.part) && lk.parts[u.part])) {
            const [col, lev] = lk.parts[f.part]
            const v = [tp[0] - f.p[0], tp[1] - f.p[1], tp[2] - f.p[2]]
            const d = norm(v)
            const u = [v[0] / d, v[1] / d, v[2] / d]
            const att = smooth(Math.cos(f.angle_rad), Math.cos(f.angle_rad * 0.5), dot(aimDir(f.r), u))
            const cosi = Math.max(0, -dot(u, n))
            e += (att * PAR_CD_ROOM * cosi) / d ** 2 * lev * lum(col || f.colour)
        }
        out[name] = e
    }
    return out
}

describe('MOXIR v2 ground: every wash and beam that is not on the truss stands on the floor', () => {
    it('stands nothing off the truss above 3 m, every lamp on the floor, and no two of the hall\'s ground PARs closer than 6 m', () => {
        expect(groundViolations(N)).toEqual([])
        for (const f of offTruss(N).filter((u) => u.type !== 'up-yz31p')) expect(f.p[1], f.id).toBeLessThanOrEqual(GROUND_M)
    })
    it('the control: the spread breaks the same rule (beams at 3.7 m, PARs on brackets, two PARs on one column)', () => {
        const v = groundViolations(OLD)
        expect(v.some((s) => /rig-beam-planes-\d+ \(plane 2/.test(s) && /3\.7 m/.test(s))).toBe(true)
        expect(v.some((s) => / are 1\.\d\d m apart/.test(s))).toBe(true)
    })
    it('EVERY NON-TRUSS UNIT ON THE GROUND: the truss keeps 10 PARs, the ground has the other 40 and all 18 beams, none held back', () => {
        const pars = N.fixtures.filter((f) => f.type === 'up-pl5403')
        expect(pars.filter((f) => f.part.startsWith('cut')).length).toBe(10)
        const ground = offTruss(N).filter((f) => f.type === 'up-pl5403' || f.type === 'up-b380f')
        expect(ground.filter((f) => f.type === 'up-pl5403' && f.p[1] <= GROUND_M).length).toBe(40)
        expect(ground.filter((f) => f.type === 'up-b380f' && f.p[1] <= GROUND_M).length).toBe(18)
        expect(ground.every((f) => f.p[1] <= GROUND_M)).toBe(true)
        expect(N.reserved_for_truss).toMatchObject({ pars: 10, held_back: 0 })
        expect([N.fixtures.filter((f) => f.type === 'up-b380f').length, pars.length, N.fixtures.filter((f) => f.type === 'up-yz31p').length,
            N.fixtures.filter((f) => f.type === 'ext-lc-ultra-mk2').length]).toEqual([18, 50, 1, 6])
        const ids = new Set(N.fixtures.map((f) => f.id))
        expect(ids.size).toBe(N.fixtures.length)
    })
    it('leaves the truss, its lamps, the smoke machine and the cubes exactly as the spread had them (other workflows own them)', () => {
        for (const f of OLD.fixtures.filter((u) => u.part.startsWith('cut') || u.type === 'ext-lc-ultra-mk2' || u.type === 'up-yz31p')) {
            const g = N.fixtures.find((u) => u.id === f.id)
            expect(g.p).toEqual(f.p)
            expect(g.r).toEqual(f.r)
        }
    })
    it('EPIC: B\'s ember fan behind the DJ is the one the owner saw and kept (the spread\'s six plane-1 heads, same place, same aim)', () => {
        const fan = OLD.fixtures.filter((f) => f.part.startsWith('plane 1'))
        expect(fan).toHaveLength(6)
        for (const f of fan) {
            const g = N.fixtures.find((u) => u.id === f.id)
            expect(g, f.id).toBeDefined()
            expect(g.p, f.id).toEqual(f.p)
            expect(g.r, f.id).toEqual(f.r)
            expect(g.part).toBe(f.part)
        }
    })
    it('EPIC: beams in the entry half too (a fenced pen centred past the floor centre, z >= 24), the beam strength vs the spread written', () => {
        const pens = layer().islands.filter((p) => p.kind !== 'stage pen')
        expect(pens.some((p) => (p.rect.z_m[0] + p.rect.z_m[1]) / 2 >= 24), JSON.stringify(pens.map((p) => p.island))).toBe(true)
        const e = N.checks.epic
        expect(e?.crowd_eyes?.beam_ratio).toBeGreaterThan(0)
        expect(e?.people_weighted?.beam_ratio).toBeGreaterThan(0)
    })
    it('the layer file holds only the 58 ground lamps, each the same in the full rig, ids kept from the spread', () => {
        const L = layer()
        expect(L.fixtures.length).toBe(58)
        expect(L.fixtures.filter((f) => f.type === 'up-pl5403').length).toBe(40)
        const old = new Set(OLD.fixtures.map((f) => f.id))
        for (const f of L.fixtures) {
            expect(old.has(f.id), f.id).toBe(true)
            const g = N.fixtures.find((u) => u.id === f.id)
            expect(g.p).toEqual(f.p)
            expect(g.r).toEqual(f.r)
            expect(f.part.startsWith('cut')).toBe(false)
        }
    })
    it('NOBODY LOOKS DOWN A BEAM WITHIN 30 deg anywhere on the public floor: 0.5 m grid, eyes 1.5 / 1.7 / 1.9 m, every head\'s whole window', () => {
        const L = layer()
        const g = fieldGlare(N, L)
        expect(g.points).toBeGreaterThan(10000)
        expect(g.fail, `${g.pct.toFixed(2)} % of the public floor fails; worst ${JSON.stringify(g.worst)}`).toBe(0)
        for (const f of N.fixtures.filter((u) => u.type === 'up-b380f')) expect(f.desk_limits, `${f.id} has no desk limits`).toBeTruthy()
        // the builder's own figure agrees
        expect(N.checks.beam_field_glare.fail_pct).toBe(0)
    })
    it('NO STANDING EYE IN A FLOOR PAR\'S BEAM: no public place within 0.5 m (a lean) of any PAR\'s beam between 1.5 and 1.9 m', () => {
        const L = layer()
        expect(parEyeFails(N, L)).toEqual([])
        expect(N.checks.par_eye_rule.fail_count).toBe(0)
        // every floor PAR among people stands in its own fenced pen; the others in the stage pen, a machine or a beam pen
        for (const f of hallPars(N)) expect(['stage pen', 'machine', 'own pen'].includes(f.stands_in) || /^beam pen /.test(f.stands_in || ''), f.id).toBe(true)
        for (const f of hallPars(N).filter((u) => u.stands_in === 'own pen')) expect(L.par_pens.some((p) => p.id === f.id), f.id).toBe(true)
    })
    it('PENS SIZED FOR EACH HEAD\'S WHOLE PAN / TILT WINDOW: desk limits as DMX data, every low run inside its pen, the fan clear of the crew', () => {
        const L = layer()
        expect(penViolations(N, L)).toEqual([])
        for (const f of N.fixtures.filter((u) => u.type === 'up-b380f')) {
            const lim = f.desk_limits
            expect(lim.pan_deg_from_home).toEqual([-10, 10])
            expect(lim.tilt_deg_from_home[1] - lim.tilt_deg_from_home[0]).toBeLessThanOrEqual(15 + 1e-6)
            for (const v of [...lim.dmx16.pan, ...lim.dmx16.tilt]) expect(v >= 0 && v <= 65535).toBe(true)
            expect(f.base?.push_at_top_n_with_factor, f.id).toBeGreaterThan(f.base?.head_alone_push_n)
        }
        // the fan: its low runs stay clear of the smoke machine's refill point (the crew hazard of the first build)
        expect(N.checks.fan.smoke_service_gap_m_min).toBeGreaterThanOrEqual(1.0)
    })
    it('THE STAGE FRONT FROM THE GROUND meets its lux floors in both looks (the stage front as the owner saw it on 10-09)', () => {
        for (const lk of ['dark', 'peak']) {
            const e = frontLux(N, lk)
            for (const [t, floor] of Object.entries(FLOORS_LX[lk])) expect(e[t], `${lk}: ${t}`).toBeGreaterThanOrEqual(floor)
        }
        expect(N.checks.stage_front.all_floors_met).toBe(true)
        // the DJ key and the booth lamp out of reach of the crowd (ISO 13857: 1.4 m behind the barrier); every pit lamp in the stage
        // pen under a mesh guard; the two PA lamps cannot be 1.4 m back (their faces are 0.96 / 1.46 m from the barrier): flagged in the rig
        const key = N.fixtures.find((f) => f.part === 'DJ key (ground option)')
        expect(key.combine_with).toMatch(/truss DJ light/)
        for (const part of FRONT_PARTS) {
            const f = N.fixtures.find((u) => u.part === part)
            expect(f, part).toBeDefined()
            expect(inRect(f.p[0], f.p[2], STAGE_PEN), part).toBe(true)
            expect(f.guard, part).toMatch(/mesh guard/)
            if (part === FRONT_PARTS[0] || part === FRONT_PARTS[1]) expect(BARRIER_Z - f.p[2], part).toBeGreaterThanOrEqual(OUT_OF_REACH_M)
        }
        for (const k of ['PA L', 'PA R']) expect(N.checks.stage_front.lamps[k].reach.out_of_reach).toBe(false) // stated, not hidden
    })
    it('ends no beam in the bar or the chill + food zone, on the entry wall or (but B\'s fan) in the crane park; nothing above 2.5 m in the crane park', () => {
        for (const b of N.review.beam_checks) {
            expect(b.ok, b.id).toBe(true)
            const [x, , z] = b.end
            expect(inZone('bar', x, z, 0.5) || inZone('chill', x, z, 0.5), `${b.id} ends at ${x} ${z}`).toBe(false)
            expect(z).toBeLessThanOrEqual(53)
            expect(b.into_crane_or_park).toBe(false)
            expect(b.glare_min_deg_any).toBeGreaterThanOrEqual(29.5) // nobody looks down a beam (eyes.py 30 deg)
            if (b.island === 'the stage pen') expect(b.near_crane_parks.cut, b.id).toEqual([]) // the fan never into the cut at any park
        }
        for (const f of offTruss(N)) {
            const inPark = CRANE_PARK.x[0] <= f.p[0] && f.p[0] <= CRANE_PARK.x[1] && CRANE_PARK.z[0] <= f.p[2] && f.p[2] <= CRANE_PARK.z[1]
            if (inPark) expect(f.p[1], f.id).toBeLessThanOrEqual(CRANE_PARK.above)
        }
    })
    it('keeps clear of the entry lasers (#873): nothing in the tower\'s pen, no beam within 1 m of a laser unit, no beam end within 3 m of a far-wall block', () => {
        const ko2 = { x_m: [-10.244, -5.244], z_m: [45.778, 50.778] }
        for (const f of N.fixtures.filter((u) => u.type !== 'ext-lc-ultra-mk2')) expect(inRect(f.p[0], f.p[2], ko2), f.id).toBe(false)
        for (const p of [...layer().islands, ...(layer().par_pens || [])]) {
            const apart = p.rect.x_m[1] <= ko2.x_m[0] || ko2.x_m[1] <= p.rect.x_m[0] || p.rect.z_m[1] <= ko2.z_m[0] || ko2.z_m[1] <= p.rect.z_m[0]
            expect(apart, p.island || p.id).toBe(true)
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
        expect(N.fixtures.filter((f) => f.part === 'DJ key (ground option)')).toHaveLength(1) // a ground OPTION, to combine with the truss DJ light
    })
    it('powers and patches every lamp within the limits, with headroom (16 A <= 2 944 W, volt drop <= 5 %, DMX lines <= 28 devices and 512 channels)', () => {
        const circ = N.power.circuits
        for (const c of circ.filter((x) => x.circuit !== 'C-LASER')) {
            expect(c.load_w, c.circuit).toBeLessThanOrEqual(2944)
            expect(c.vdrop_pct, c.circuit).toBeLessThanOrEqual(5)
        }
        for (const c of circ) expect(['L1', 'L2', 'L3'], c.circuit).toContain(c.phase) // the laser circuit too
        const powered = new Set(circ.flatMap((c) => c.units))
        for (const f of N.fixtures.filter((u) => u.type !== 'ext-lc-ultra-mk2')) {
            expect(powered.has(f.id), f.id).toBe(true)
            expect(f.dmx?.universe, f.id).toBeGreaterThan(0)
        }
        for (const l of N.patch.lines) {
            expect(l.devices, l.line).toBeLessThanOrEqual(28)
            expect(l.channels).toBeLessThanOrEqual(512)
            expect(l.route?.length, l.line).toBeGreaterThan(1) // a route for the cable plan
        }
        for (const l of N.power.headroom_for_the_truss.dmx_lines_with_truss_lamps) expect(l.devices, l.line).toBeLessThanOrEqual(28) // the truss's lines keep 4 of 32 spare
        for (const b of N.patch.branches) expect(b.ok && b.devices <= 28 && b.channels <= 512, b.branch).toBe(true)
        for (const ch of Object.values(N.patch.slots)) expect(ch).toBeLessThanOrEqual(512)
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
    it('measured the glare in every audience view within the budget (0.65 % white-out), the lasers at their drawn cap', () => {
        const g = N.checks.floor_glare_peak_measured
        expect(g).toBeTruthy()
        expect(g.white_pct).toBeLessThanOrEqual(0.65)
        const cap = OLD.looks.find((l) => l.id === 'peak').desk_caps.laser.fader // a9d4b0d1: fader 0.16 = the drawn fraction measured under budget
        expect(cap).toBe(0.16)
        expect(g.laser_fader).toBe(cap)
        expect(N.looks.find((l) => l.id === 'peak').parts.laser[1]).toBe(cap)
        expect(g.every_view_ok).toBe(true)
        for (const [name, f] of Object.entries(g.all_frames)) if (!name.endsWith('-dj')) expect(f.white_pct, name).toBeLessThanOrEqual(0.65)
        expect(Object.keys(g.all_frames).length).toBe(12)
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
