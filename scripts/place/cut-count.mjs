#!/usr/bin/env node
/**
 * cut-count.mjs — MOXIR v2 (2026-10-09): how many UP-PL5403 PARs on "the cut" (the one sloped 12 m H30V truss under the near
 * crane, behind the DJ). The owner, 2026-10-09: TRUSS = only the cut; how many PARs on it is ours to work out (v1.0 had 17);
 * no moving heads on it (rule of 09-30, still standing).
 *
 *   node scripts/place/cut-count.mjs                 # the table for 6..24 PARs, JSON
 *   node scripts/place/cut-count.mjs --n 12          # one count, JSON
 *   node scripts/place/cut-count.mjs --n 11 --places -5,-4,... --design scripts/place/rigs/moxir-stage-v2-cranes-2026-10-09.json   # at another park
 *
 * What it weighs, and from where (nothing typed twice):
 *   GEOMETRY + RIGGING: the cut at v1.1 exactly as stage-line.mjs derives it (stageLineRig on
 *     rigs/moxir-stage-v1-1-2026-10-08.json): the 3 picks (u -5.75 / -0.5 / 5.25), their bridle angles (26 / 42 / 119 deg, all
 *     <= 120), the hoist (20 kg) + chain (0.59 kg/m x 12 m) + bridle hardware (6 kg) that load the bridge on top, the truss
 *     (H30V 6.3 kg/m, Prolyte's table). The load split: versions.mjs threePointReactions (a continuous beam on 3 supports,
 *     the flexibility method), the SAME function v1.0/v1.1 used for their 59 / 146 / 44.5 kg.
 *   WHAT A PAR ADDS: 8.0 kg body (UP-PL5403, maker EXACT, fixtures-exact.md) + a half coupler 0.5 kg + a safety bond 0.15 kg
 *     (ESTIMATE: catalogue class) + its power and DMX link jumpers 0.6 kg (ESTIMATE: 2 x 1.5 m) = 9.25 kg per lamp, and the
 *     home runs along the truss as a uniform 0.35 kg/m over 12 m (power + DMX multicore, ESTIMATE). No +10 % on top (the
 *     extras are now itemised).
 *   THE LIMIT: each pick's line load <= 146 kg — v1.0's middle pick, the ceiling MOXIR.md 5.2 writes ("3 picks <= 146 kg each").
 *     It is a DESIGN cap, not a rating: the crane's SWL, the runway and the hoists' WLL are still unknown (MOXIR.md 6 #1).
 *   PLACES: the truss's clamp points every 0.5 m, 0.25 m in from each end (src/rigbuild/pieces.js), never closer than 0.25 m to a
 *     pick (no beam rises through a bridle or chain), spread as evenly as the points allow.
 *   THE LOOK: two families alternating along the line (odd = DOWN, a shaft to the floor; even = UP, a pool on the crane bridge's
 *     girders at 7.6 m, the steel seen in pieces). A family's pitch = 2 x the lamp pitch. A shaft reads as its own piece when the
 *     family pitch is wider than its footprint on the floor, 2 h tan(half angle) (15 deg standard lens; 25 deg shown as the
 *     alternative because the rental's lens is UNKNOWN). Where the footprints overlap, the shafts merge into a sheet: "a wall",
 *     which the owner does not want. Practice (layout-practice.md B8, HYPOTHESIS, no sourced figure): 0.5-1 m spacing is "rich";
 *     above about 20 on 12 m it becomes a wall.
 *   POWER: 200 W per PAR (the rig files' figure, fixtures.json; the EQUIVALENT 162 W is lower) on 16 A circuits loaded to 80 %
 *     (2 944 W, the v1.0/v1.1 circuit rule, BS 7671 practice). DMX: 8 channels per PAR (TESTED map), one RS-485 branch <= 32
 *     devices (EIA-485 unit loads, ANSI E1.11).
 */
import { fileURLToPath } from 'node:url'

import { loadInputs, stageLineRig } from '../rigbuild/stage-line.mjs'
import { threePointReactions } from '../rigbuild/versions.mjs'

export const DESIGN = 'scripts/place/rigs/moxir-stage-v1-1-2026-10-08.json'
export const PER_LAMP = { body_kg: 8.0, coupler_kg: 0.5, safety_kg: 0.15, jumpers_kg: 0.6 }
export const LOOM_KG_PER_M = 0.35
export const PICK_CAP_KG = 146
export const PAR_W = 200
export const CIRCUIT_W = 2944
export const BRANCH_MAX = 32
export const DMX_CH = 8
const r2 = (v) => Math.round(v * 100) / 100
const r1 = (v) => Math.round(v * 10) / 10
const DEG = Math.PI / 180

/** The cut as v1.1 derives it: ends, slope, picks, bridges. Pure apart from reading the committed files. */
export const theCut = (design = DESIGN) => {
    const inputs = loadInputs(design)
    const rig = stageLineRig(inputs)
    const t = rig.truss
    return { truss: t, rigging: t.rigging, axis: (t.ends[0].x_m + t.ends[1].x_m) / 2 - ((t.ends[0].u_m + t.ends[1].u_m) / 2) * Math.cos(t.slope_deg * DEG) }
}

/** n clamp points spread evenly over the line, away from the picks. Pure. */
export const placesFor = (n, { uEnds = [-6.25, 5.75], picks = [-5.75, -0.5, 5.25], step = 0.5, inset = 0.25, gap = 0.25 } = {}) => {
    const pts = []
    for (let u = uEnds[0] + inset; u <= uEnds[1] - inset + 1e-9; u += step) {
        if (picks.every((p) => Math.abs(p - u) >= gap - 1e-9)) pts.push(Math.round(u * 100) / 100)
    }
    if (n > pts.length) throw new Error(`the cut has ${pts.length} clamp points clear of the picks; ${n} lamps do not fit`)
    const L = uEnds[1] - uEnds[0]
    const used = new Set()
    const out = []
    for (let i = 0; i < n; i++) {
        const ideal = uEnds[0] + ((i + 0.5) * L) / n
        const best = pts.filter((p) => !used.has(p)).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0]
        used.add(best)
        out.push(best)
    }
    return out.sort((a, b) => a - b)
}

/** The clamp points of the cut (every 0.5 m, 0.25 m in from each end, >= 0.25 m from a pick). Pure. */
export const clampPoints = ({ uEnds = [-6.25, 5.75], picks = [-5.75, -0.5, 5.25], step = 0.5, inset = 0.25, gap = 0.25 } = {}) => {
    const pts = []
    for (let u = uEnds[0] + inset; u <= uEnds[1] - inset + 1e-9; u += step) {
        if (picks.every((p) => Math.abs(p - u) >= gap - 1e-9)) pts.push(Math.round(u * 100) / 100)
    }
    return pts
}

/** One count, every number; `places` (u, metres) instead of the even spread when a lamp has to sit elsewhere (MOXIR v2
 * spread, 2026-10-09: PAR 08 one clamp point toward house left, clear of laser 4a). Each must be a clamp point. Pure. */
export const cutCount = (n, cut = theCut(), { places = null } = {}) => {
    const { truss, rigging } = cut
    const th = truss.slope_deg * DEG
    const uEnds = truss.ends.map((e) => e.u_m)
    const picksU = rigging.picks.map((p) => p.u_m)
    let us = placesFor(n, { uEnds, picks: picksU })
    if (places) {
        const ok = new Set(clampPoints({ uEnds, picks: picksU }))
        const bad = places.filter((u) => !ok.has(Math.round(u * 100) / 100))
        if (bad.length) throw new Error(`not clamp points of the cut (every 0.5 m, clear of the picks): ${bad.join(', ')}`)
        if (places.length !== n || new Set(places).size !== n) throw new Error(`${n} lamps need ${n} distinct places, got ${places.length}`)
        us = [...places].sort((a, b) => a - b)
    }
    const each = PER_LAMP.body_kg + PER_LAMP.coupler_kg + PER_LAMP.safety_kg + PER_LAMP.jumpers_kg
    const x = (u) => u * Math.cos(th)
    const trussKgm = rigging.truss_kg_per_m
    const split = threePointReactions({
        supports: picksU.map(x),
        loads: us.map((u) => ({ x: x(u), kg: each })),
        udl: [{ from: x(uEnds[0]), to: x(uEnds[1]), kgm: (trussKgm * truss.width_m + LOOM_KG_PER_M * truss.width_m) / (x(uEnds[1]) - x(uEnds[0])) }]
    })
    const chainKg = rigging.chain_kg_per_m * rigging.chain_carried_m
    const picks = rigging.picks.map((p, i) => {
        const line = split.kg[i]
        const onBridge = line + rigging.hoist_kg + chainKg + rigging.bridle.hardware_kg
        return { u_m: p.u_m, bridle_included_deg: p.bridle_included_deg, line_kg: r1(line), on_bridge_kg: r1(onBridge), leg_kg: r1((line + rigging.hoist_kg + chainKg) / (2 * Math.cos((p.bridle_included_deg / 2) * DEG))), ok: line <= PICK_CAP_KG && p.bridle_included_deg <= 120 }
    })
    // heights: the bottom chord at u, a hung PAR's lens 0.33 m under it (body 330 mm), a standing one's 0.62 m over it
    const bottomAt = (u) => truss.trim_m + u * Math.sin(th)
    const pitch = n > 1 ? r2((us[us.length - 1] - us[0]) / (n - 1)) : null
    const family = pitch == null ? null : r2(2 * pitch)
    const look = [15, 25].map((lens) => {
        const k = Math.tan((lens / 2) * DEG) * 2
        const downs = us.filter((_, i) => i % 2 === 0)
        const foot = downs.map((u) => r2(k * (bottomAt(u) - 0.33)))
        const ups = us.filter((_, i) => i % 2 === 1)
        const pool = ups.map((u) => r2(k * Math.max(0.1, rigging.picks[0] ? (7.6 - (bottomAt(u) + 0.29 + 0.33)) : 0)))
        const separate = family == null ? 1 : downs.filter((_, i) => foot[i] < family).length / Math.max(1, downs.length)
        return { lens_deg: lens, floor_footprint_m: [Math.min(...foot), Math.max(...foot)], girder_pool_m: pool.length ? [Math.min(...pool), Math.max(...pool)] : null, shafts_separate_pct: Math.round(separate * 100), reads_as: separate >= 0.99 ? 'pieces (every shaft its own)' : separate >= 0.5 ? 'pieces at the low end, a sheet at the high end' : 'a sheet (a wall of light)' }
    })
    const watts = n * PAR_W
    return {
        n, places_u_m: us, pitch_m: pitch, family_pitch_m: family,
        weight: { per_lamp_kg: r2(each), lamps_kg: r1(n * each), truss_kg: r1(trussKgm * truss.width_m), loom_kg: r1(LOOM_KG_PER_M * truss.width_m), total_on_line_kg: r1(n * each + (trussKgm + LOOM_KG_PER_M) * truss.width_m) },
        picks, picks_ok: picks.every((p) => p.ok), worst_pick_kg: Math.max(...picks.map((p) => p.line_kg)), headroom_kg: r1(PICK_CAP_KG - Math.max(...picks.map((p) => p.line_kg))),
        power: { w: watts, circuits_16a: Math.ceil(watts / CIRCUIT_W) }, dmx: { channels: n * DMX_CH, branches: Math.ceil(n / BRANCH_MAX) },
        look
    }
}

export const table = (counts = [6, 8, 10, 12, 14, 16, 17, 20, 24]) => {
    const cut = theCut()
    return counts.map((n) => {
        try {
            return cutCount(n, cut)
        } catch (e) {
            return { n, error: e.message }
        }
    })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const i = process.argv.indexOf('--n')
    const j = process.argv.indexOf('--places')
    const places = j > 0 ? process.argv[j + 1].split(',').map(Number) : null
    // `--design <stage json>`: the cut as THAT stage derives it (MOXIR v2 cranes, 2026-10-10: the near crane parked at z 3.20,
    // rigs/moxir-stage-v2-cranes-2026-10-09.json); the loads do not depend on the park, the picks' geometry is re-derived
    const k = process.argv.indexOf('--design')
    const cut = theCut(k > 0 ? process.argv[k + 1] : DESIGN)
    const out = i > 0 ? cutCount(Number(process.argv[i + 1]), cut, { places }) : { cut: { ends: cut.truss.ends, trim_m: cut.truss.trim_m, picks: cut.rigging.picks.map((p) => ({ u_m: p.u_m, bridle_included_deg: p.bridle_included_deg })) }, cap_kg: PICK_CAP_KG, rows: table() }
    process.stdout.write(JSON.stringify(out, null, 1) + '\n')
}
