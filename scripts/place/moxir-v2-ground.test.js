// MOXIR v2 GROUND (2026-10-09, the owner 21:05, ledger N465: "other washes and beams what we dont use make on the ground, not on the
// arcs ... washs are so close on the ground ... use space right"). moxir_v2_ground.py build writes the ground layer (only the floor
// lamps) and the full rig (the spread with its non-truss, non-laser, non-smoke units replaced by that layer). This file guards both.
// ROUND 2 (2026-10-10 evening, the MOXIR lead's brief after three skeptic passes on fac5c43d): ON THE GROUND, OUT OF THE CROWD.
// The acceptance tests A1-A15 below re-compute the geometry HERE, from the rig file's own numbers, with this file's own code (not
// the builder's). Each was seen failing on fac5c43d's rig and layer first:
//   MOXIR_GROUND_RIG=/tmp/old-rig.json MOXIR_GROUND_LAYER=/tmp/old-layer.json npx vitest run scripts/place/moxir-v2-ground.test.js
// (absolute paths, or names in rigs/).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { v1Entities, v1Looks } from '../rigbuild/epic-build.mjs'
import library from '../../src/rigbuild/types/moxir.json'
import { planPatch } from '../../src/rigbuild/patchPlan.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const read = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(here, 'rigs', f), 'utf8'))
const N = read(process.env.MOXIR_GROUND_RIG || 'moxir-v2-ground-2026-10-09.json')
const layer = () => read(process.env.MOXIR_GROUND_LAYER || 'moxir-v2-ground-layer-2026-10-09.json')
const OLD = read('moxir-v2-spread-2026-10-09.json')
const ZONES = read('moxir-v2-zones-2026-10-09.json')
const HALL = read('moxir-hall-2026-10-08-v9-show-park.hall.json').geometry
const PATCH = read('moxir-v2-patch-2026-10-09.json')
const LASERS873 = read('moxir-v2-entry-lasers-2026-10-09.json')

const MIN_PAR_SPACING_M = 6.0 // the owner's "washs are so close": no two hall PARs closer (moxir_v2_ground.py PAR_MIN_SPACING_M)
const MAX_NON_TRUSS_M = 3.0
const GROUND_M = 1.0
const BARRIER_REACH_M = 0.6 // a hand over a line (FIX 2)
const HEAD_REACH_M = 1.5 // ISO 13857:2019 Table 2 (high risk): a moving head behind a 1.0-1.2 m line
const PAR_REACH_M = 1.0 // ASSUMED (a PAR is low risk): round 1's PAR pen half size
const DJ_EYE = [-5.2, 2.03, 4.3]
const CRANE_PARK = { x: [-12, 12], z: [-2, 7], above: 2.5 }
const STAGE_PEN = { x_m: [-10.5, 1.5], z_m: [-7.5, 8.2] }
const FOH_RISER = { x_m: [-6.7, -3.7], z_m: [28.0, 30.0] }
const DOOR_WALK = { x_m: [-8.0, 7.0], z_m: [43.5, 53.7] } // the unpainted strip from the hot zone to the door: everyone walks in there
const HALL_IN = { x_m: [-36.2, 60.2], z_m: [-53.6, 53.6] }
const PIT = { x_m: [-11.6, 2.0], z_m: [6.7, 8.2] } // MOXIR.md 5.3: nothing between the PA boxes' front line and the barrier
const FRONT_PARTS = ['DJ key (ground option)', 'stage front booth (ground)']
const GLARE_DEG = 30 // ASSUMED design heuristic (eyes.py), not a standard
const EYE_YS = [1.5, 1.7, 1.9]
const LEAN_M = 0.5
const LOW_EDGE_DEG = 0.9 + 2.0
const APERTURE_R_M = 0.08
const FAN_STRIP = { x_m: [-9.0, -0.4], z_m: [-5.4, -2.5] }
const CREW_LANES = [{ x_m: [-10.5, 1.5], z_m: [-7.5, -6.6] }, { x_m: [0.0, 1.5], z_m: [-7.5, -2.0] }]
const SMOKE_SERVICE = [-4.75, -6.7]
const PAR_LENS_R_M = 0.105
const PAR_CD_ROOM = 609.56 / 0.02
const OUT_OF_REACH_M = 1.4
const BARRIER_Z = 8.16
const PEAK_CAP = 0.85
const SPREAD_BEAM_GAP_M = 21.9 // the spread's largest gap between beam bases (fac5c43d checks.json beam_coverage.spread)
const BANDS = [[-99, -18], [-18, -6], [-6, 6], [6, 18], [18, 30], [30, 99]]
const EMBER = '#ff3a12'
const ASH = '#e8e4dc'
const FLOORS_LX = { peak: { 'DJ face': 44, 'booth front': 31 }, dark: { 'DJ face': 44, 'booth front': 31 } }
const TARGETS = { 'DJ face': [[-5.2, 1.9, 4.6], [0, 0, 1]], 'booth front': [[-5.2, 1.0, 5.3], [0, 0, 1]] }

const offTruss = (rig) => rig.fixtures.filter((f) => !f.part.startsWith('cut') && f.type !== 'ext-lc-ultra-mk2')
const plan = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])
const hallPars = (rig) => offTruss(rig).filter((f) => f.type === 'up-pl5403' && !FRONT_PARTS.includes(f.part) && !/stage front|DJ key/.test(f.part))
const inRect = (x, z, r, m = 0) => r.x_m[0] + m <= x && x <= r.x_m[1] - m && r.z_m[0] + m <= z && z <= r.z_m[1] - m
const rectGap = (x, z, r) => Math.hypot(Math.max(r.x_m[0] - x, x - r.x_m[1], 0), Math.max(r.z_m[0] - z, z - r.z_m[1], 0))
const D2R = Math.PI / 180
const dirOf = (az, el) => [Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), Math.cos(el * D2R) * Math.cos(az * D2R)]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => Math.hypot(a[0], a[1], a[2])
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unitV = (a) => { const n = norm(a); return [a[0] / n, a[1] / n, a[2] / n] }
const aimDir = ([a, b, c]) => {
    const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
    const m = [[cb * cc, -cb * sc, sb], [sa * sb * cc + ca * sc, -sa * sb * sc + ca * cc, -sa * cb], [-ca * sb * cc + sa * sc, ca * sb * sc + sa * cc, ca * cb]]
    return [-m[0][1], -m[1][1], -m[2][1]]
}
const inZone = (id, x, z, margin = 0) => ZONES.zones.filter((zz) => zz.id === id).some((zz) => zz.areas.some((a) => a.cells_1m.some((row) =>
    Math.abs(row.z - z) <= 0.5 + margin && row.x_runs.some(([x0, x1]) => x0 - margin <= x && x <= x1 + margin))))

// ---- the public floor (this file's own code): every painted 1 m cell (hot, wings, bar, chill) + the door walkway, not the stage
// pen, not a machine (the hall's massing at floor level), inside the walls; split into sub-cells
const massingAt = (x, z) => HALL.massing.some((m) => !m.id.startsWith('pendant') && m.x_m[0] <= x && x <= m.x_m[1] && m.z_m[0] <= z && z <= m.z_m[1] && m.y_m[0] < 1.0 && m.y_m[1] > 0.0)
let CELLS = null
const peopleCells = () => {
    if (CELLS) return CELLS
    const seen = new Set()
    CELLS = []
    const rows = []
    for (const zid of ['hot', 'use', 'bar', 'chill']) for (const zz of ZONES.zones.filter((q) => q.id === zid)) for (const a of zz.areas) for (const row of a.cells_1m) rows.push([row.z, row.x_runs])
    for (let z = Math.trunc(DOOR_WALK.z_m[0] - 0.5); z < Math.trunc(DOOR_WALK.z_m[1]); z++) rows.push([z + 0.5, [[DOOR_WALK.x_m[0], DOOR_WALK.x_m[1]]]])
    for (const [rz, runs] of rows) {
        for (const [x0, x1] of runs) {
            for (let x = Math.round(x0); x <= Math.round(x1); x++) {
                const k = `${x},${rz}`
                if (seen.has(k)) continue
                seen.add(k)
                if (inRect(x, rz, STAGE_PEN) || massingAt(x, rz) || !inRect(x, rz, HALL_IN, -0.5)) continue
                CELLS.push([x, rz])
            }
        }
    }
    return CELLS
}
const publicPoints = (step) => {
    const n = Math.max(1, Math.round(1 / step))
    const offs = [...Array(n)].map((_, i) => (i + 0.5) / n - 0.5)
    const out = []
    for (const [x, z] of peopleCells()) for (const ox of offs) for (const oz of offs) if (inRect(x + ox, z + oz, HALL_IN)) out.push([x + ox, z + oz])
    return out
}
// a bucket index for nearest-point distances
const bucketIndex = (P, cell = 2) => {
    const b = new Map()
    for (const p of P) {
        const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`
        if (!b.has(k)) b.set(k, [])
        b.get(k).push(p)
    }
    return (x, z, rmax = 6) => {
        const n = Math.ceil(rmax / cell)
        const cx = Math.floor(x / cell)
        const cz = Math.floor(z / cell)
        let d = rmax
        for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) for (const p of b.get(`${cx + i},${cz + k}`) || []) d = Math.min(d, Math.hypot(p[0] - x, p[1] - z))
        return d
    }
}
let PUB = null
const pub = () => PUB || (PUB = { P: publicPoints(0.25), dist: null })
const distPublic = (x, z, rmax = 6) => {
    const p = pub()
    if (!p.dist) p.dist = bucketIndex(p.P)
    return p.dist(x, z, rmax)
}
// the LEAN band: every 0.25 m point within LEAN_M outside the public floor's edge (a person leaning over any line)
const leanPoints = () => {
    const P = pub().P
    const key = (x, z) => `${Math.round(x * 4)},${Math.round(z * 4)}`
    const isPub = new Set(P.map(([x, z]) => key(x, z)))
    const out = new Set()
    for (const [x, z] of P) {
        for (let i = -2; i <= 2; i++) {
            for (let k = -2; k <= 2; k++) {
                if (i * i + k * k > 4) continue
                const q = [x + i * 0.25, z + k * 0.25]
                const kq = key(q[0], q[1])
                if (!isPub.has(kq) && inRect(q[0], q[1], HALL_IN)) out.add(kq)
            }
        }
    }
    return [...out].map((s) => s.split(',').map((v) => Number(v) / 4))
}
const headOf = (f) => [f.p[0], f.p[1] - 0.2, f.p[2]] // the B380F's tilt axis 0.5 m over its base (the body's p is 0.7)
// #878 (Part A, NOT merged here): the near crane parked at z 3.20 with the cut, the 6 cubes on the free crane. The numbers are copied
// from origin/feat/moxir-cranes-lasers-2026-10-09 @ 9c732712 (`git show`): rigs/moxir-crane-cut-v2-cranes-2026-10-09.json
// (derived_at_z_3_20.truss.ends, rigging.picks_u_m, rigging.tieoffs hl, pars[].p) and rigs/moxir-lasers-on-crane-2026-10-09.json
// (units[].aperture_m p05..p95, aim.end_m, the 1.008 deg tube, the 0.25 m margin). Lamp bodies: 0.2 m spheres (ASSUMED).
const SRC_878_COMMIT = '9c7327128ef3b0fd00a6242d609b36aafaba79b2'
const STAGE_BAY = { x_m: [-12.0, -10.5], z_m: [1.75, 6.5] }
const RAISED_HANDS_M = 2.5
const CUT_878 = {
    z: 3.2, section: 0.29, chord: [[-11.04, 2.89], [0.55, 6.0]], uEnds: [-6.25, 5.75], picksU: [-5.75, -0.5, 5.25],
    strap: [[-11.04, 3.04, 3.2], [-11.6, 3.04, 6.0]],
    lamps: [[-9.83, 3.606], [-8.864, 3.145], [-7.898, 4.124], [-6.932, 3.662], [-6.449, 3.792], [-5.0, 4.9], [-4.034, 4.439], [-3.068, 4.698], [-2.102, 5.676], [-1.619, 5.086], [-0.653, 5.345]],
    lampR: 0.2, girder: { dz: 1.1, halfW: 0.35, y: [7.6, 8.92], xAbs: 11.35 },
}
const CUBES_878 = { z0: -13.45, x: [-4.5, -1.0], y: [8.54, 9.09], end: [-4.031, 9.181, -53.8], fanDeg: 1.008, waist: 0.004, margin: 0.25 }
// B3 (v2.1 integration): with #878 IN the tree, read its geometry from the in-tree files (not the copied numbers above, which stay as
// the fallback for a tree without #878). `SRC_878_IN_TREE` says which one the run used; a number that differs from the copy is a finding.
const SRC_878_IN_TREE = (() => {
    try {
        const C = read(process.env.B3_FORCE_COPY ? 'nonexistent.json' : 'moxir-crane-cut-v2-cranes-2026-10-09.json')
        const Ls = read('moxir-lasers-on-crane-2026-10-09.json')
        const dz = C.derived_at_z_3_20
        const ends = dz.truss.ends
        const hl = dz.rigging.tieoffs.find((t) => t.id === 'hl')
        CUT_878.z = C.crane_z_m
        CUT_878.section = C.truss.section_m
        CUT_878.chord = ends.map((e) => [e.x_m, e.bottom_chord_m])
        CUT_878.uEnds = ends.map((e) => e.u_m)
        CUT_878.picksU = dz.rigging.picks.map((q) => q.u_m)
        CUT_878.strap = [hl.from_m, hl.to_m]
        CUT_878.lamps = C.pars.map((q) => [q.p[0], q.p[1]])
        const xs = Ls.units.map((u) => u.x_m)
        CUBES_878.z0 = Ls.units[0].aperture_m.p05[2]
        CUBES_878.x = [Math.min(...xs), Math.max(...xs)]
        CUBES_878.y = [Math.min(...Ls.units.map((u) => u.aperture_m.p05[1])), Math.max(...Ls.units.map((u) => u.aperture_m.p95[1]))]
        CUBES_878.end = Ls.aim.end_m
        return true
    } catch (e) {
        return false
    }
})()
const b3log = (line) => { if (process.env.MOXIR_B3_OUT) fs.appendFileSync(process.env.MOXIR_B3_OUT, line + '\n') } // numbers for the integration report, only when asked
const B380F_HALF_DEG = (0.0157 / 2) / D2R
const segPts = (a, b, step = 0.1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step))
    return [...Array(n + 1)].map((_, i) => [0, 1, 2].map((k) => a[k] + ((b[k] - a[k]) * i) / n))
}
const cutParts878 = () => {
    const [[xa, ya], [xb, yb]] = CUT_878.chord
    const z = CUT_878.z
    const out = [{ name: 'the cut (truss)', pts: segPts([xa, ya, z], [xb, yb, z]), r: CUT_878.section / 2 }]
    for (const u of CUT_878.picksU) {
        const f = (u - CUT_878.uEnds[0]) / (CUT_878.uEnds[1] - CUT_878.uEnds[0])
        const x = xa + f * (xb - xa)
        out.push({ name: `pick u ${u}`, pts: segPts([x, ya + f * (yb - ya) + CUT_878.section, z], [x, CUT_878.girder.y[0], z]), r: 0.02 })
    }
    out.push({ name: 'the hl strap', pts: segPts(...CUT_878.strap), r: 0.025 })
    CUT_878.lamps.forEach(([x, y], i) => out.push({ name: `cut lamp ${i + 1}`, pts: [[x, y, z]], r: CUT_878.lampR }))
    return out
}
/** A14: a point's clearance from the cube beams' volume (the box from the apertures' spread at z -13.45 to the one end at the far
 * wall), padded by the 1.008 deg tube, the 0.25 m margin and the ground beam's own half width at its distance t. < 0 = inside. */
const cubeClearance = (q, t) => {
    const C = CUBES_878
    const [ex, ey, ez] = C.end
    const s = Math.min(Math.max(C.z0 - q[2], 0), C.z0 - ez)
    const f = s / (C.z0 - ez)
    const [xl, xr] = [C.x[0] + f * (ex - C.x[0]), C.x[1] + f * (ex - C.x[1])]
    const [yl, yh] = [C.y[0] + f * (ey - C.y[0]), C.y[1] + f * (ey - C.y[1])]
    const pad = C.waist / 2 + s * Math.tan((C.fanDeg / 2) * D2R) + C.margin + t * Math.tan(B380F_HALF_DEG * D2R)
    const dx = Math.max(xl - q[0], q[0] - xr, 0)
    const dy = Math.max(yl - q[1], q[1] - yh, 0)
    const dz = Math.max(q[2] - C.z0, ez - q[2], 0)
    return Math.hypot(dx, dy, dz) - pad
}
/** Points along a beam from its head (0.3 m out) to tMax, or to the roof (10.8 m) when tMax is null: [[point, t]]. */
const rayPts = (h, d, tMax = null) => {
    const end = Math.min(tMax ?? (d[1] > 1e-6 ? (10.8 - h[1]) / d[1] : 60), 120)
    const out = []
    for (let t = 0.3; t < end; t += 0.1) out.push([[h[0] + d[0] * t, h[1] + d[1] * t, h[2] + d[2] * t], t])
    return out
}
const fencedPens = (L) => [...(L.islands || []).filter((p) => p.kind !== 'stage pen').map((p) => p.rect), ...(L.par_pens || []).map((p) => p.rect)]

/** A head's whole desk window: every pan of its limits (2.5 deg steps) x its tilts (the limit, +5, +10, +15 deg). */
const windowOf = (f) => {
    const lim = f.desk_limits
    if (!lim) return [aimDir(f.r)]
    const [az0, az1] = lim.world_az_deg
    const span = (az1 - az0 + 360) % 360
    const [el0, el1] = lim.world_el_deg
    const out = []
    // 2.5 deg steps and the window's exact far end (a pan capped by A14/A15 is not a multiple of 2.5)
    for (let k = 0; k <= Math.ceil(span / 2.5 - 1e-9); k++) for (const t of [0, 5, 10, 15]) out.push(dirOf(az0 + Math.min(k * 2.5, span), Math.min(el0 + t, el1, 89.5)))
    return out
}

/** A7 (this file's own code): the plan points (public floor every 0.5 m outside the rig's fenced pens, and the lean band 0.25 m)
 * from which any beam's window direction is within 30 deg of the line to an eye at 1.5 / 1.7 / 1.9 m, at the head. */
const fieldGlare = (rig, L, { lean = true } = {}) => {
    const pens = fencedPens(L)
    let P = publicPoints(0.5).filter(([x, z]) => !pens.some((R) => inRect(x, z, R)))
    if (lean) {
        // a fenced pen is a barrier too: its inside 0.5 m band is a leaning place
        const penLean = []
        for (const R of pens) for (let x = R.x_m[0]; x <= R.x_m[1] + 1e-9; x += 0.25) for (let z = R.z_m[0]; z <= R.z_m[1] + 1e-9; z += 0.25) if (rectGap(x, z, { x_m: [R.x_m[0] + LEAN_M, R.x_m[1] - LEAN_M], z_m: [R.z_m[0] + LEAN_M, R.z_m[1] - LEAN_M] }) > 0) penLean.push([x, z])
        P = P.concat(leanPoints(), penLean)
    }
    const beams = rig.fixtures.filter((f) => f.type === 'up-b380f').map((f) => ({ id: f.id, h: headOf(f), W: windowOf(f) }))
    const cosLim = Math.cos(GLARE_DEG * D2R)
    let fail = 0
    let worst = null
    for (const [x, z] of P) {
        const riser = inRect(x, z, FOH_RISER) ? 0.6 : 0
        let bad = false
        for (const y of EYE_YS) {
            for (const b of beams) {
                if (Math.hypot(x - b.h[0], z - b.h[2]) < 0.2) continue
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

/** A6 (this file's own code): a PAR's beam (lens deg + 1 deg, from its 0.21 m lens) between 1.5 and 1.9 m, up to its throw. */
const parFootprint = (f, lensDeg) => {
    const p = f.p
    const a = unitV(aimDir(f.r))
    const u = unitV(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    const w = cross(a, u)
    const half = lensDeg / 2 + 1.0
    const rays = [[a, 0]]
    for (const [fr, n] of [[1 / 3, 8], [2 / 3, 16], [1, 24]]) {
        const th = half * fr * D2R
        for (let j = 0; j < n; j++) {
            const ph = (2 * Math.PI * j) / n
            rays.push([[0, 1, 2].map((k) => Math.cos(th) * a[k] + Math.sin(th) * (Math.cos(ph) * u[k] + Math.sin(ph) * w[k])), fr])
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
const parEyeFails = (rig, L, lensDeg) => {
    const pens = fencedPens(L)
    const P = pub().P.filter(([x, z]) => !pens.some((R) => inRect(x, z, R)))
    const idx = bucketIndex(P)
    const out = []
    for (const f of offTruss(rig).filter((u) => u.type === 'up-pl5403')) {
        let gap = Infinity
        for (const [x, z] of parFootprint(f, lensDeg)) gap = Math.min(gap, idx(x, z, 2))
        if (gap < LEAN_M) out.push({ id: f.id, gap: Math.round(gap * 100) / 100 })
    }
    return out
}

/** R2.2 (this file's own code): one window direction's low run (lower edge under 3.0 m over the standing level), every 0.01 m. */
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
/** Every floor B380F out of the crowd: head >= 1.5 m from the public floor, every low run over its pan window (1 deg steps, at
 * its tilt limit) >= 0.6 m from it; B's fan (the stage pen): its runs inside the fan strip, clear of the crew lanes and the
 * smoke machine's refill point. Returns the violations. */
const beamReachViolations = (rig) => {
    const out = []
    for (const f of rig.fixtures.filter((u) => u.type === 'up-b380f')) {
        if (!f.desk_limits) { out.push(`${f.id}: no desk limits`); continue }
        const h = headOf(f)
        const stage = inRect(h[0], h[2], STAGE_PEN)
        if (!stage && distPublic(h[0], h[2]) < HEAD_REACH_M) out.push(`${f.id}: head ${distPublic(h[0], h[2]).toFixed(2)} m from the public floor`)
        const [az0, az1] = f.desk_limits.world_az_deg
        const span = (az1 - az0 + 360) % 360
        const el0 = f.desk_limits.world_el_deg[0]
        for (let k = 0; k <= Math.round(span); k++) {
            const run = lowRun(h, dirOf(az0 + k, el0))
            if (!run) { out.push(`${f.id}: never climbs`); break }
            const bad = stage
                ? run.find(([x, z]) => !inRect(x, z, FAN_STRIP) || Math.hypot(x - SMOKE_SERVICE[0], z - SMOKE_SERVICE[1]) < 1.0 || CREW_LANES.some((R) => rectGap(x, z, R) < 0.3))
                : run.filter((_, i) => i % 5 === 0).find(([x, z]) => distPublic(x, z) < BARRIER_REACH_M)
            if (bad) { out.push(`${f.id} at pan ${(az0 + k).toFixed(0)}: low run at ${bad[0].toFixed(2)} ${bad[1].toFixed(2)}`); break }
        }
    }
    return out
}

/** The stage front's lux from the ground lamps alone (no shadows): E = I x att x cos(i) / d^2 x level x the colour's luminance. */
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
            e += (att * PAR_CD_ROOM * Math.max(0, -dot(u, n))) / d ** 2 * lev * lum(col || f.colour)
        }
        out[name] = e
    }
    return out
}
// the painted cells a beam base should reach (hot + wings, not the bar or the chill): A5
const paintedCells = () => {
    const seen = new Set()
    const out = []
    for (const zid of ['hot', 'use']) for (const zz of ZONES.zones.filter((q) => q.id === zid)) for (const a of zz.areas) for (const row of a.cells_1m) for (const [x0, x1] of row.x_runs) {
        for (let x = Math.round(x0); x <= Math.round(x1); x++) {
            const k = `${x},${row.z}`
            if (seen.has(k) || inZone('bar', x, row.z) || inZone('chill', x, row.z)) continue
            seen.add(k)
            out.push([x, row.z])
        }
    }
    return out
}
const corridorBand = (x, z) => LASERS873.under_the_beams.find((b) => b.z_m[0] <= z && z <= b.z_m[1] && b.x_strip_m[0] <= x && x <= b.x_strip_m[1])

describe('MOXIR v2 ground: every wash and beam that is not on the truss stands on the floor', () => {
    it('stands nothing off the truss above 3 m, every lamp on the floor, and no two of the hall\'s ground PARs closer than 6 m', () => {
        for (const f of offTruss(N)) expect(f.p[1], f.id).toBeLessThanOrEqual(MAX_NON_TRUSS_M)
        for (const f of offTruss(N).filter((u) => u.type !== 'up-yz31p')) expect(f.p[1], f.id).toBeLessThanOrEqual(GROUND_M)
        const pars = hallPars(N)
        for (let i = 0; i < pars.length; i++) for (let j = i + 1; j < pars.length; j++) expect(plan(pars[i].p, pars[j].p), `${pars[i].id} ${pars[j].id}`).toBeGreaterThanOrEqual(MIN_PAR_SPACING_M - 1e-6)
    })
    it('the kit: the truss keeps 10 PARs, the ground has the other 40 and all 18 beams; the truss, smoke and cubes as the spread had them', () => {
        const pars = N.fixtures.filter((f) => f.type === 'up-pl5403')
        expect(pars.filter((f) => f.part.startsWith('cut')).length).toBe(10)
        expect(offTruss(N).filter((f) => f.type === 'up-pl5403' && f.p[1] <= GROUND_M).length).toBe(40)
        expect(offTruss(N).filter((f) => f.type === 'up-b380f' && f.p[1] <= GROUND_M).length).toBe(18)
        expect([N.fixtures.filter((f) => f.type === 'up-b380f').length, pars.length, N.fixtures.filter((f) => f.type === 'up-yz31p').length,
            N.fixtures.filter((f) => f.type === 'ext-lc-ultra-mk2').length]).toEqual([18, 50, 1, 6])
        expect(new Set(N.fixtures.map((f) => f.id)).size).toBe(N.fixtures.length)
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
            expect(g.p, f.id).toEqual(f.p)
            expect(g.r, f.id).toEqual(f.r)
        }
    })
    it('the layer file holds only the 58 ground lamps, each the same in the full rig, ids kept from the spread', () => {
        const L = layer()
        expect(L.fixtures.length).toBe(58)
        const old = new Set(OLD.fixtures.map((f) => f.id))
        for (const f of L.fixtures) {
            expect(old.has(f.id), f.id).toBe(true)
            const g = N.fixtures.find((u) => u.id === f.id)
            expect(g.p).toEqual(f.p)
            expect(g.r).toEqual(f.r)
        }
    })
})

describe('MOXIR v2 ground, round 2: the acceptance tests (the lead\'s brief, 2026-10-10)', () => {
    it('A1 PATCH: no patch of its own: every address is the official v2 patch\'s for the same unit id (patchPlan.js on the room\'s document), the cubes on the LAN', () => {
        const lasers = LASERS873.fixtures.filter((f) => f.type === 'up-la40wf').map((f) => ({ id: f.id, type: 'spotLight', name: f.id, components: { transform: { position: f.p, rotation: [0, 0, 0] }, fixture: { type: 'up-la40wf' } } }))
        const ents = v1Entities(N)
        // the official plan's block counts are the show rig's (cut 11 / planes 39 after 9cfc8ee7); this layer lays the same plan
        // with its own counts (planes-25 is still a PL5403 here), as moxir_v2_compose.py does for the composed rig, and says so
        const counts = {
            cut: N.fixtures.filter((f) => f.type === 'up-b380f' && /^rig-par-cut-\d+$/.test(f.id)).length,
            planes: N.fixtures.filter((f) => f.type === 'up-pl5403' && /^rig-par-planes-\d+$/.test(f.id)).length,
        }
        expect(N.patch.counts).toEqual(counts)
        expect(N.patch.layer_note).toMatch(/own counts/)
        const plan = JSON.parse(JSON.stringify(PATCH))
        for (const u of plan.universes) for (const b of u.blocks) {
            if (b.select.group === 'rig-par-cut') b.units = counts.cut
            else if (b.select.group === 'rig-par-planes') b.units = counts.planes
        }
        const r = planPatch({ entities: [...ents, ...lasers], library, plan })
        expect(r.errors).toEqual([])
        const want = Object.fromEntries(r.assignments.map((a) => [a.entityId, `U${a.universe}.${a.address}`]))
        for (const f of N.fixtures.filter((u) => ['up-b380f', 'up-pl5403', 'up-yz31p'].includes(u.type))) {
            expect(f.dmx, f.id).toBeTruthy()
            expect(`U${f.dmx.universe}.${f.dmx.address}`, f.id).toBe(want[f.id])
        }
        // U1 = 18 B380F + smoke (+ #873's 2 LA40WF), U2 = the 50 PL5403
        const by = (u) => N.fixtures.filter((f) => f.dmx?.universe === u).reduce((o, f) => ({ ...o, [f.type]: (o[f.type] || 0) + 1 }), {})
        expect(by(1)).toEqual({ 'up-b380f': 18, 'up-yz31p': 1 })
        expect(by(2)).toEqual({ 'up-pl5403': 50 })
        for (const f of N.fixtures.filter((u) => u.type === 'ext-lc-ultra-mk2')) {
            expect(f.dmx, f.id).toBeUndefined()
            expect(f.laser?.artnet, `${f.id} still carries an Art-Net block`).toBeUndefined()
        }
        // the lines: one per area and universe, <= 28 devices, each unit on exactly one
        const lines = N.patch.lines
        for (const l of lines) {
            expect(l.devices, l.line).toBeLessThanOrEqual(28)
            expect(l.area, l.line).toBeTruthy()
            const us = N.fixtures.filter((f) => l.units.includes(f.id))
            expect(new Set(us.map((f) => f.dmx.universe)).size, l.line).toBeLessThanOrEqual(1)
            for (const f of us) expect(f.dmx.line, f.id).toBe(l.line)
        }
        for (const f of N.fixtures.filter((u) => u.dmx)) expect(lines.filter((l) => l.units.includes(f.id)), f.id).toHaveLength(1)
    })
    it('A2 OUT OF THE CROWD: no unit and no barrier of this layer on the public floor (no island), no beam ends in the bar or the chill + food zone', () => {
        const L = layer()
        expect(fencedPens(L), 'fenced pens on the public floor').toEqual([])
        for (const f of offTruss(N).filter((u) => u.type !== 'up-yz31p')) {
            if (FRONT_PARTS.includes(f.part) || f.part.startsWith('plane 1')) { expect(inRect(f.p[0], f.p[2], STAGE_PEN), f.id).toBe(true); continue }
            expect(distPublic(f.p[0], f.p[2]), `${f.id} stands on the public floor`).toBeGreaterThan(0.18)
        }
        for (const b of N.review.beam_checks) {
            const [x, , z] = b.end
            expect(inZone('bar', x, z, 0.5) || inZone('chill', x, z, 0.5), `${b.id} ends at ${x} ${z}`).toBe(false)
            expect(b.ok, b.id).toBe(true)
        }
        expect(N.checks.public_floor.units_on_it).toEqual([])
    })
    it('A3 PALETTE: the peak keeps the spread\'s ember split (no hall PAR in ash; ash on the cut and a named few), every colour change listed with its reason', () => {
        const pk = N.looks.find((l) => l.id === 'peak').parts
        const ashPars = offTruss(N).filter((f) => f.type === 'up-pl5403' && pk[f.part]?.[0] === ASH)
        expect(ashPars.map((f) => f.part).filter((p) => !FRONT_PARTS.includes(p)), 'hall PARs in ash at the peak').toEqual([])
        expect(ashPars.length).toBeLessThanOrEqual(2)
        for (const f of offTruss(N).filter((u) => u.type === 'up-pl5403' && !FRONT_PARTS.includes(u.part))) expect(pk[f.part]?.[0], f.id).toBe(EMBER)
        const pal = N.checks.palette
        expect(pal?.peak?.length).toBeGreaterThan(0)
        for (const r of pal.changed_vs_spread) expect((r.why || '').length, `${r.part}: the reason for the change`).toBeGreaterThan(15)
    })
    it('A4 HEADROOM: no beam or PAR part of any look above 0.85; the 30 deg rule marked ASSUMED, the B380F hazard distance UNKNOWN', () => {
        for (const lk of N.looks) for (const [part, [, lev]] of Object.entries(lk.parts)) if (part !== 'laser') expect(lev, `${lk.id} ${part}`).toBeLessThanOrEqual(PEAK_CAP + 1e-9)
        expect(N.ground_rules.glare_rule_status).toMatch(/ASSUMED/)
        expect(N.checks.beam_field_glare.rule_status).toMatch(/ASSUMED/)
        expect(N.checks.headroom.b380f_iec_62471).toMatch(/UNKNOWN/)
        const e = N.checks.epic
        expect(e.crowd_eyes.beam_ratio).toBeGreaterThan(0)
        expect(N.checks.epic_peak_look.crowd_eyes.beam_ratio).toBeGreaterThan(0)
    })
    // A5 is split so the suite tells MET from NOT MET: the gap and the FOH PARs are NOT MET on this rig (expected failures,
    // it.fails: they turn red the day they start to pass, so the line gets moved, never forgotten). The gap's floor is proved by
    // the slot set: no out-of-crowd place lies within 21.9 m of the painted cell x 3 z 19.5 (moxir_v2_ground.py a5_island; the
    // OWNER DECISION's option b, one island beside the FOH riser, measures 21.88 m).
    const baseGap = () => {
        const bases = N.fixtures.filter((f) => f.type === 'up-b380f').map((f) => [f.p[0], f.p[2]])
        let worst = 0
        for (const [x, z] of paintedCells()) worst = Math.max(worst, Math.min(...bases.map((b) => Math.hypot(b[0] - x, b[1] - z))))
        return { bases, worst }
    }
    it('A5 SPREAD (bands + entry beams): a beam in every 12 m z band, every entry-side eye\'s beams >= x1.0 of the spread at the peak (equal colours)', () => {
        const { bases } = baseGap()
        for (const [a, b] of BANDS) expect(bases.filter(([, z]) => a <= z && z < b).length, `z ${a}..${b}`).toBeGreaterThan(0)
        const g = N.checks.entry_gate
        expect(g, 'no entry gate').toBeTruthy()
        for (const e of ['mid-hall', 'near the entry', 'FOH']) expect(g.beam_ratio[e], `${e} beams`).toBeGreaterThanOrEqual(1.0)
    })
    it.fails('A5 SPREAD (gap), NOT MET: the largest gap between beam bases <= 21.9 m (this rig: 24.64 m; the island option 21.88 m, an OWNER DECISION)', () => {
        const { worst } = baseGap()
        expect(worst, `the largest gap is ${worst.toFixed(1)} m`).toBeLessThanOrEqual(SPREAD_BEAM_GAP_M)
    })
    it('A5 SPREAD (gap), the measured state: the gap stays at the slot set\'s floor (<= 24.7 m) and both options are in the rig for the owner', () => {
        const { worst } = baseGap()
        expect(worst).toBeLessThanOrEqual(24.7)
        const isl = N.checks.owner_decisions?.a5_island
        expect(isl?.a_no_island?.base_gap_max_m).toBeCloseTo(worst, 1)
        expect(isl?.b_foh_island?.base_gap_max_m).toBeLessThanOrEqual(SPREAD_BEAM_GAP_M)
    })
    it.fails('A5 ENTRY PARs, NOT MET: every entry-side eye\'s PAR light >= x1.0 of the spread at the peak (this rig: FOH x0.74)', () => {
        const g = N.checks.entry_gate
        for (const e of ['mid-hall', 'near the entry', 'FOH']) expect(g.par_ratio[e], `${e} PARs`).toBeGreaterThanOrEqual(1.0)
    })
    it('A6 LENS: no standing or leaning eye in any floor PAR\'s beam, at 15 deg AND at 25 deg', () => {
        const L = layer()
        expect(parEyeFails(N, L, 15)).toEqual([])
        expect(parEyeFails(N, L, 25)).toEqual([])
        expect(N.checks.par_eye_rule['25']?.fail_count).toBe(0)
        expect(N.checks.par_eye_rule['15']?.fail_count).toBe(0)
    })
    it('A7 LEAN: nobody looks down a beam within 30 deg (ASSUMED rule) on the public floor or leaning 0.5 m over any line or barrier', () => {
        const L = layer()
        const g = fieldGlare(N, L)
        expect(g.points).toBeGreaterThan(10000)
        expect(g.fail, `${g.pct.toFixed(2)} % of the eye points fail; worst ${JSON.stringify(g.worst)}`).toBe(0)
        expect(N.checks.beam_field_glare.fail_pct).toBe(0)
    })
    it('A8 THE 40 W CORRIDOR (#873): no unit and no line or barrier of this layer inside its "nothing to stand on" strip', () => {
        const L = layer()
        for (const f of offTruss(N).filter((u) => u.type !== 'up-yz31p' && !inRect(u.p[0], u.p[2], STAGE_PEN))) expect(corridorBand(f.p[0], f.p[2]), f.id).toBeUndefined()
        for (const R of fencedPens(L)) {
            for (let x = R.x_m[0]; x <= R.x_m[1] + 1e-9; x += 0.25) {
                for (const z of R.z_m) expect(corridorBand(x, z), `a 1.1 m pen barrier at ${x.toFixed(2)} ${z}`).toBeUndefined()
            }
            for (let z = R.z_m[0]; z <= R.z_m[1] + 1e-9; z += 0.25) for (const x of R.x_m) expect(corridorBand(x, z), `a 1.1 m pen barrier at ${x} ${z.toFixed(2)}`).toBeUndefined()
        }
        for (const [x, z] of L.perimeter_faces || []) expect(corridorBand(x, z), `the line at ${x} ${z}`).toBeUndefined()
    })
    it('A9 PRACTICE: heads and low runs clear of the public floor, nothing in the pit, the smoke refilled from the crew side, cables counted on ALL public floor, the order list', () => {
        expect(beamReachViolations(N)).toEqual([])
        for (const f of offTruss(N).filter((u) => u.type === 'up-pl5403')) {
            expect(inRect(f.p[0], f.p[2], PIT), `${f.id} in the pit`).toBe(false)
            if (!inRect(f.p[0], f.p[2], STAGE_PEN) && f.part !== 'embers') expect(distPublic(f.p[0], f.p[2]), f.id).toBeGreaterThanOrEqual(PAR_REACH_M)
        }
        const sp = N.checks.smoke_path
        expect(sp?.ok).toBe(true)
        expect(inRect(SMOKE_SERVICE[0], SMOKE_SERVICE[1], STAGE_PEN)).toBe(true)
        // every cable run's public metres, re-measured here along its route (0.25 m steps against this file's public floor)
        const pubLen = (pts) => {
            let L = 0
            for (let i = 1; i < pts.length; i++) {
                const [a, b] = [pts[i - 1], pts[i]]
                const d = Math.hypot(b[0] - a[0], b[1] - a[1])
                const n = Math.max(1, Math.ceil(d / 0.25))
                for (let k = 0; k < n; k++) {
                    const x = a[0] + ((b[0] - a[0]) * (k + 0.5)) / n
                    const z = a[1] + ((b[1] - a[1]) * (k + 0.5)) / n
                    if (distPublic(x, z, 1) < 0.5) L += d / n
                }
            }
            return L
        }
        const runs = [...N.power.circuits.filter((c) => c.route), ...N.patch.lines, ...(N.power.feeders || []), ...(N.patch.network || [])]
        expect(runs.length).toBeGreaterThan(10)
        let worst = 0
        for (const r of runs) worst = Math.max(worst, pubLen(r.route))
        const cables = N.checks.cables
        expect(cables.protector_metres, 'protectors cover the longest public run').toBeGreaterThanOrEqual(Math.floor(worst) - 2)
        for (const c of N.power.circuits.filter((x) => x.legs)) for (const l of c.legs) expect(l.stock_m.reduce((s, v) => s + v, 0), `${c.circuit} -> ${l.to}`).toBeGreaterThanOrEqual(l.run_m - 1e-6)
        for (const l of N.patch.lines) for (const g of l.legs) expect(g.stock_m.reduce((s, v) => s + v, 0), `${l.line} -> ${g.to}`).toBeGreaterThanOrEqual(g.run_m - 1e-6)
        const o = N.checks.order
        for (const k of ['perimeter_line', 'floor_plates', 'sandbags', 'cable_protectors', 'stewards']) expect(o?.[k], k).toBeTruthy()
        expect(o.public_floor_lost_m2).toBe(0)
        expect(N.checks.barrier_gap_ok).toBe(true)
    })
    it('A10 DESK LIMITS: an operator setup sheet per head (pan/tilt degrees + 16-bit DMX coarse/fine), enforcement stated as OWED code', () => {
        const sheet = fs.readFileSync(path.join(repo, 'docs/moxir/moxir-v2-ground-operator-sheet.md'), 'utf8')
        expect(sheet).toMatch(/OWED code/)
        expect(sheet).toMatch(/ASSUMED until the channel walk/)
        for (const f of N.fixtures.filter((u) => u.type === 'up-b380f')) {
            const lim = f.desk_limits
            // +-10 deg, or narrower where A14/A15 (#878) capped it, with the reason on the sheet
            expect(lim.pan_deg_from_home, f.id).toEqual(lim.pan_cap_878_deg || [-10, 10])
            if (lim.pan_cap_878_deg) expect(lim.pan_cap_878_why, f.id).toMatch(/#878/)
            expect(lim.tilt_deg_from_home[1] - lim.tilt_deg_from_home[0]).toBeLessThanOrEqual(15 + 1e-6)
            for (const v of [...lim.dmx16.pan, ...lim.dmx16.tilt]) expect(v >= 0 && v <= 65535).toBe(true)
            const row = sheet.split('\n').find((l) => l.startsWith(`| ${f.id} |`))
            expect(row, f.id).toBeTruthy()
            expect(row).toContain(`U${f.dmx.universe}.${String(f.dmx.address).padStart(3, '0')}`)
            expect(row).toContain(`${lim.dmx16.pan[0]}..${lim.dmx16.pan[1]}`)
            // the pan window in degrees exactly as limited (never rounded outward: a -9.5 deg cap must not read -10)
            const sg = (v) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}`
            expect(row, f.id).toContain(`| ${sg(lim.pan_deg_from_home[0])}..${sg(lim.pan_deg_from_home[1])} |`)
            expect(row).toContain(`${lim.dmx16.tilt[0]}..${lim.dmx16.tilt[1]}`)
        }
        expect(N.owed.join(' ')).toMatch(/OWED code/)
    })
    it('A11 MOXIR.md: the v2 ground section and its change-log line, 5.3\'s barrier line fixed, the B380F\'s power-trip behaviour UNKNOWN with a crew line', () => {
        const t = fs.readFileSync(path.join(repo, 'docs/moxir/MOXIR.md'), 'utf8')
        expect(t).toMatch(/^#{2,4} .*v2 ground/m)
        const log = t.slice(t.indexOf('## 11 · Change log'))
        expect(log).toMatch(/v2 ground/)
        const s53 = t.slice(t.indexOf('### 5.3'), t.indexOf('## 6 ·'))
        expect(s53).not.toMatch(/z 25\.8/)
        expect(s53).toMatch(/z 8\.2/)
        expect(t).toMatch(/B380F[^\n]*(power|trip)[^\n]*UNKNOWN|UNKNOWN[^\n]*B380F[^\n]*(power|trip)/)
        expect(t).toMatch(/lamp (channel )?off/)
    })
    it('A12 LOOKED AT: the twelve frames of round 2 measured, every audience view within 0.65 % white-out, the DJ view\'s white-out stated', () => {
        const g = N.checks.floor_glare_peak_measured
        expect(g?.round).toBe('r2-2026-10-10')
        expect(g.white_pct).toBeLessThanOrEqual(0.65)
        expect(g.every_view_ok).toBe(true)
        for (const [name, f] of Object.entries(g.all_frames)) if (!name.endsWith('-dj')) expect(f.white_pct, name).toBeLessThanOrEqual(0.65)
        expect(Object.keys(g.all_frames).length).toBe(12)
        expect(typeof g.dj_white_pct?.peak).toBe('number')
        expect(g.drawn_by.ev100).toBe(2.84)
    })
    it('A13 THE BAY (#878): the stage pen\'s barrier takes in x -12..-10.5, z 1.75..6.5, and raised hands (2.5 m) on every floor point outside it stay >= 0.5 m from the near crane\'s cut', () => {
        const L = layer()
        const bay = (L.islands || []).find((p) => p.kind === 'stage pen' && /bay/.test(p.island))
        expect(bay?.rect, 'the layer\'s stage pen takes in the bay').toEqual({ x_m: STAGE_BAY.x_m, z_m: STAGE_BAY.z_m })
        const parts = cutParts878()
        let worst = { d: 99 }
        for (let x = -16 + 0.125; x < 4; x += 0.25) {
            for (let z = CUT_878.z - 6 + 0.125; z < CUT_878.z + 6; z += 0.25) {
                if (inRect(x, z, STAGE_PEN) || inRect(x, z, STAGE_BAY) || !inRect(x, z, HALL_IN) || massingAt(x, z)) continue
                for (const { name, pts, r } of parts) {
                    for (const q of pts) {
                        const d = Math.hypot(Math.hypot(q[0] - x, q[2] - z), Math.max(q[1] - RAISED_HANDS_M, 0)) - r
                        if (d < worst.d) worst = { d, name, at: [x, z] }
                    }
                }
            }
        }
        b3log('B3 A13 in_tree=' + SRC_878_IN_TREE + ' raised_hands_gap_m=' + worst.d.toFixed(4) + ' at ' + worst.at + ' ' + worst.name)
        expect(worst.d, `raised hands at ${worst.at} are ${worst.d.toFixed(3)} m from ${worst.name}`).toBeGreaterThanOrEqual(0.5)
        expect(N.checks.near_crane_878?.a13?.with_the_bay?.gap_m).toBeCloseTo(worst.d, 2)
    })
    it('A14 THE CUBE BEAMS (#878): no ground unit, cable or beam (aim or any direction of its desk window) inside the 6 cube beams\' volume behind the stage', () => {
        const units = N.fixtures.filter((f) => ['up-pl5403', 'up-b380f', 'up-yz31p'].includes(f.type) && !f.part.startsWith('cut'))
        for (const f of units) expect(cubeClearance([f.p[0], f.p[1] + 0.5, f.p[2]], 0), f.id).toBeGreaterThan(0)
        const runs = [...N.power.circuits.filter((c) => c.route), ...N.patch.lines, ...(N.power.feeders || []), ...(N.patch.network || [])]
        for (const r of runs) for (const [x, z] of r.route) expect(cubeClearance([x, 0, z], 0), 'a cable on the floor').toBeGreaterThan(0)
        let near = { d: 99 }
        for (const f of N.fixtures.filter((u) => u.type === 'up-b380f')) {
            const h = headOf(f)
            const dirs = [[aimDir(f.r), f.throw_m], ...windowOf(f).map((d) => [d, null])]
            for (const [d, tMax] of dirs) for (const [q, tt] of rayPts(h, d, tMax)) { const c = cubeClearance(q, tt); if (c < near.d) near = { d: c, id: f.id } }
        }
        b3log('B3 A14 in_tree=' + SRC_878_IN_TREE + ' cube_beam_clearance_m=' + near.d.toFixed(4) + ' ' + near.id)
        expect(near.d, `${near.id} comes ${near.d.toFixed(2)} m from the cube beams`).toBeGreaterThan(0)
        expect(N.checks.near_crane_878?.source?.commit).toBe(SRC_878_COMMIT)
    })
    it('A15 THE NEAR CRANE (#878): no ground beam, aim or any direction of its desk window, meets the near crane parked at z 3.20 (its girders) or its cut (truss, picks, strap, lamps; + 0.3 m)', () => {
        const parts = cutParts878()
        const hits = []
        for (const f of N.fixtures.filter((u) => u.type === 'up-b380f')) {
            const h = headOf(f)
            const dirs = [[aimDir(f.r), f.throw_m], ...windowOf(f).map((d) => [d, null])]
            for (const [d, tMax] of dirs) {
                let what = null
                for (const [q] of rayPts(h, d, tMax)) {
                    if (Math.abs(q[0]) <= CUT_878.girder.xAbs && q[1] >= CUT_878.girder.y[0] && q[1] <= CUT_878.girder.y[1] &&
                        [-1, 1].some((s) => Math.abs(q[2] - (CUT_878.z + s * CUT_878.girder.dz)) <= CUT_878.girder.halfW)) { what = 'a girder'; break }
                    if (Math.abs(q[2] - CUT_878.z) >= 1.0) continue
                    const p = parts.find(({ pts, r }) => pts.some((s) => Math.hypot(s[0] - q[0], s[1] - q[1], s[2] - q[2]) <= r + 0.3))
                    if (p) { what = p.name; break }
                }
                if (what) { hits.push(`${f.id} meets ${what}`); break }
            }
        }
        b3log('B3 A15 in_tree=' + SRC_878_IN_TREE + ' hits=' + hits.length)
        expect(hits).toEqual([])
        expect(N.checks.near_crane_878?.ok?.a15).toBe(true)
    })
})

describe('MOXIR v2 ground: the rest of the safety and the room', () => {
    it('THE STAGE FRONT FROM THE GROUND: the DJ key and the booth lamp meet their lux floors, behind the PA line and out of reach', () => {
        for (const lk of ['dark', 'peak']) {
            const e = frontLux(N, lk)
            for (const [t, floor] of Object.entries(FLOORS_LX[lk])) expect(e[t], `${lk}: ${t}`).toBeGreaterThanOrEqual(floor)
        }
        expect(N.checks.stage_front.all_floors_met).toBe(true)
        for (const part of FRONT_PARTS) {
            const f = N.fixtures.find((u) => u.part === part)
            expect(inRect(f.p[0], f.p[2], STAGE_PEN), part).toBe(true)
            expect(BARRIER_Z - f.p[2], part).toBeGreaterThanOrEqual(OUT_OF_REACH_M)
        }
        expect(N.fixtures.find((f) => f.part === 'DJ key (ground option)').combine_with).toMatch(/truss DJ light/)
        expect(N.checks.owner_decisions.pa_faces.question).toMatch(/PA/)
    })
    it('ends no beam on the entry wall or (but B\'s fan) in the crane park; nothing above 2.5 m in the crane park; the fan never into the cut', () => {
        for (const b of N.review.beam_checks) {
            expect(b.end[2]).toBeLessThanOrEqual(53)
            expect(b.into_crane_or_park).toBe(false)
            expect(b.glare_min_deg_any).toBeGreaterThanOrEqual(29.5)
            if (b.island === 'the stage pen') expect(b.near_crane_parks.cut, b.id).toEqual([])
        }
        for (const f of offTruss(N)) {
            const inPark = CRANE_PARK.x[0] <= f.p[0] && f.p[0] <= CRANE_PARK.x[1] && CRANE_PARK.z[0] <= f.p[2] && f.p[2] <= CRANE_PARK.z[1]
            if (inPark) expect(f.p[1], f.id).toBeLessThanOrEqual(CRANE_PARK.above)
        }
    })
    it('keeps clear of the entry lasers (#873): nothing in the tower\'s pen, no beam within 1 m of a laser unit, no beam end within 3 m of a far-wall block', () => {
        const ko2 = { x_m: [-10.244, -5.244], z_m: [45.778, 50.778] }
        for (const f of N.fixtures.filter((u) => u.type !== 'ext-lc-ultra-mk2')) expect(inRect(f.p[0], f.p[2], ko2), f.id).toBe(false)
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
            if ((a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) / d < Math.cos(f.angle_rad)) continue
            expect((Math.acos(-v[2] / d) * 180) / Math.PI, f.id).toBeGreaterThanOrEqual(20)
        }
        expect(N.review.dj_glare_all_at_full.ok).toBe(true)
    })
    it('powers every lamp within the limits (16 A <= 2 944 W, volt drop <= 5 %, every circuit on a phase), no DMX address shared', () => {
        for (const c of N.power.circuits.filter((x) => x.circuit !== 'C-LASER')) {
            expect(c.load_w, c.circuit).toBeLessThanOrEqual(2944)
            expect(c.vdrop_pct, c.circuit).toBeLessThanOrEqual(5)
        }
        for (const c of N.power.circuits) expect(['L1', 'L2', 'L3'], c.circuit).toContain(c.phase)
        const powered = new Set(N.power.circuits.flatMap((c) => c.units))
        for (const f of N.fixtures.filter((u) => u.type !== 'ext-lc-ultra-mk2')) expect(powered.has(f.id), f.id).toBe(true)
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

    it('feeds every unit from its own side: no power or DMX leg runs round the hall (each <= 65 m; c5388f3e fed the house-left entry PARs from D-ENTRY, one leg 213 m)', () => {
        const legs = [
            ...N.power.circuits.filter((c) => c.legs).flatMap((c) => c.legs.map((l) => [`power ${c.circuit} -> ${l.to}`, l.run_m])),
            ...N.patch.lines.flatMap((l) => l.legs.map((g) => [`dmx ${l.line} -> ${g.to}`, g.run_m])),
        ]
        expect(legs.length).toBeGreaterThan(50)
        for (const [id, m] of legs) expect(m, id).toBeLessThanOrEqual(65)
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
