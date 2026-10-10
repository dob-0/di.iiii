#!/usr/bin/env node
/**
 * stage-line.mjs — MOXIR's stage on the owner's stage line (2026-10-07): where the crane parks, the cut
 * re-derived at that place, and the scratch copy of Known · full moved there AS OPS.
 *
 * Owner, 2026-10-07, on video frame 954: a stage line across the floor at z 24.5, the DJ behind it (x 0.84–4.05),
 * speakers L and R on it, the audience everything in front. "We can move the crane." His order: stage → crane
 * place → truss → lights. The design lives in scripts/place/rigs/moxir-stage-line-2026-10-07.json (what he drew,
 * with its sources and accuracy); this file only DERIVES from it, never types a number of its own:
 *
 *   parkOptions   — the crane's park z compared (default 22 / 24 / 26): DJ distance, tie-offs (grid line, cab,
 *                   fixed massing), the truss over the audience or not, the front row's sightline to the DJ.
 *   stageLineRig  — Known · full's rig with the booth on the line and the near crane at the chosen z
 *                   (versions.mjs versionRig → craneCut: trim, picks, bridles, tie-offs re-derived; the shape
 *                   the owner decided is unchanged — the test holds it).
 *   stageLineOps  — the ops that move an EXISTING copy of the version there: the booth (decks, table, stair) and the
 *                   barrier to the line; everything on the cut translated along z, its rigging replaced by the
 *                   derived one; two PA stacks added as labelled placeholders of a real product; the venue plan
 *                   re-derived from the new hall record (the crane line and the zones). Nothing else is touched:
 *                   the floor lights, the looks, the patch, the night, the hall model (swap-hall.mjs does that).
 *
 *   node scripts/rigbuild/stage-line.mjs --evaluate                       # the park table, no server
 *   node scripts/rigbuild/stage-line.mjs --api http://127.0.0.1:4323/serverXR --project <copy> \
 *       [--token-file <dummy env>] [--out <dir>] [--last <doc it last wrote>] [--kept <ids file>] [--apply]   # dry run unless --apply
 *
 * Scratch only: refuses any host but localhost / 127.0.0.1. A followed space is changed on dev, never here.
 * Not an engineered design: a rigger signs the rigging, the crane's owner its travel, brakes and rated load.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { linePoint, slopedLineRigging, stageFrame } from '../place/rig-lib.mjs'
import { venuePlanFromHall } from '../../src/rigbuild/venuePlan.js'
import { isCut, mirrorEntity } from './mirror-cut.mjs'
import { clearUnderCab, segmentHitsBox, tieoffCabClashes, TIEOFF_CAB_MARGIN_M } from './safety.mjs'
import { RIGS_DIR, VERSIONS_FILE, rigFileOf, versionRig } from './versions.mjs'

export const STAGE_LINE_FILE = 'scripts/place/rigs/moxir-stage-line-2026-10-07.json'
export const VERSION_ID = 'known-full'
/** Raised hands over the floor (the cut's brief, moxir-crane-cut-2026-09-29.json clearance) and a standing eye. */
export const EYE_M = 1.6
export const DJ_HEAD_M = 1.75
/** A hung PAR's body under the bottom chord (UP-PL5403 drawn ~0.3 m; ESTIMATE) — what a sightline must clear. */
export const HUNG_BODY_M = 0.35

const read = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(REPO_ROOT, f), 'utf8'))
const clone = (v) => JSON.parse(JSON.stringify(v))
const r3 = (v) => Math.round(v * 1000) / 1000
const r2 = (v) => Math.round(v * 100) / 100

/** The committed inputs: the versions spec, its base rig, the stage-line design, its hall record, the old rig file. */
export const loadInputs = (designFile = STAGE_LINE_FILE) => {
    const spec = read(VERSIONS_FILE)
    const base = read(path.join(RIGS_DIR, spec.base))
    const design = read(designFile)
    return {
        spec, base, design,
        hall: read(design.crane.hall_record),
        oldHall: read(spec.hall),
        oldRig: read(rigFileOf(spec.set, VERSION_ID))
    }
}

/** The base rig's stage, put on the line: the booth's front on it, at the x he drew; the cut's axis as the design says. */
export const stageAtLine = (base, design) => ({
    ...clone(base.stage),
    x_m: design.booth.centre_x_m,
    front_z_m: design.booth.front_z_m,
    truss_axis_x_m: design.truss.axis_x_m,
    ...(design.truss.behind_m !== undefined ? { truss_behind_m: design.truss.behind_m } : {}),
    ...(design.truss.crane_z_m !== undefined ? { truss_crane_z_m: design.truss.crane_z_m } : {}),
    deck_h_m: design.booth.deck_h_m ?? base.stage.deck_h_m,
    ...(design.booth.stairs === false ? { stairs: null } : {}),
    label: `DJ place on the owner's stage line (z ${design.stage_line.z_m}), 2026-10-07`
})

/** Known · full's rig at the line: the version's own groups and looks, the stage-line cut and hall. Pure. */
export const stageLineRig = ({ spec, base, design }) => {
    const s = clone(spec)
    s.hall = design.crane.hall_record
    for (const list of [s.versions, s.variants || [], s.candidates || []]) {
        const v = list.find((x) => x.id === VERSION_ID)
        if (v) v.craneCut = design.truss.cut
    }
    return versionRig({ spec: s, base: { ...base, stage: stageAtLine(base, design) }, id: VERSION_ID })
}

/** The hall with crane `i` (the near one) rolled to `z`. Pure. */
export const hallWithCraneAt = (hall, z, i = 0) => {
    const h = clone(hall)
    const c = h.geometry.cranes[i]
    c.from_entry_m = r3(c.from_entry_m + (c.z_m - z))
    c.z_m = z
    return h
}

const boxOf = (m) => ({ min: [m.x_m[0], m.y_m[0], m.z_m[0]], max: [m.x_m[1], m.y_m[1], m.z_m[1]] })
const pointBoxGap = (p, b) => Math.hypot(...[0, 1, 2].map((k) => Math.max(b.min[k] - p[k], 0, p[k] - b.max[k])))
/** The smallest gap from the segment a→b to the box (sampled every ≤ 5 cm; 0 = touching or through). */
export const segmentBoxGap = (a, b, box) => {
    if (segmentHitsBox(a, b, box)) return 0
    const n = Math.max(20, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.05))
    let best = Infinity
    for (let i = 0; i <= n; i += 1) best = Math.min(best, pointBoxGap(a.map((v, k) => v + (b[k] - v) * (i / n)), box))
    return best
}

/** The fixed massing nearest a segment: { id, gap_m }. */
export const nearestMassing = (a, b, hall) => (hall.geometry.massing || [])
    .map((m) => ({ id: m.id, gap_m: r2(segmentBoxGap(a, b, boxOf(m))) }))
    .sort((p, q) => p.gap_m - q.gap_m)[0]

/**
 * The crane's park z compared. `rig` is the stage-line rig at the design's z (its truss and stage); each candidate
 * moves only the bridge (and so the line, which hangs in the bridge's plane) and re-derives the tie-offs the way
 * craneCut does — to the nave columns' inner faces on the grid line nearest the bridge. Pure.
 */
export const parkOptions = ({ rig, hall, design, zs = design.crane.candidates_m }) => {
    const cut = read(design.truss.cut)
    const s0 = stageFrame(rig, hall)
    const t = rig.truss
    const djZ = s0.back + s0.into * (s0.depth / 2 - 0.2)
    const g = hall.geometry
    const barrierZ = design.barrier.z_m
    const lineZ = design.stage_line.z_m
    const uEnds = t.ends.map((e) => e.u_m)
    return zs.map((z) => {
        const hz = hallWithCraneAt(hall, z)
        const crane = hz.geometry.cranes[0]
        const stage = { ...s0, trussZ: z, crane }
        const gridZ = [...g.column_grid_z_m].sort((p, q) => Math.abs(p - z) - Math.abs(q - z))[0]
        const tieoffs = cut.rigging.tieoffs.map((tie) => {
            const from = linePoint(stage, tie.u_m, 'axis')
            const to = [tie.side * g.column_inner_face_x_m, tie.y_m === 'end' ? r2(from[1]) : tie.y_m, gridZ]
            const under = clearUnderCab(from, to, hz)
            return { id: tie.id, from_m: from.map(r2), to_m: to, along_z_m: r2(Math.abs(gridZ - z)), under_cab_m: under == null ? null : r2(under), nearest_massing: nearestMassing(from, to, hz) }
        })
        const cabClash = tieoffCabClashes({ truss: { rigging: { tieoffs } } }, hz)
        const line = [linePoint(stage, uEnds[0], 'bottom'), linePoint(stage, uEnds[1], 'bottom')]
        const cab = crane.cab
        const underCab = (g.massing || []).filter((m) => m.x_m[1] > cab.x_m[0] && m.x_m[0] < cab.x_m[1] && m.z_m[1] > z + cab.dz_m[0] && m.z_m[0] < z + cab.dz_m[1])
        // the front of the crowd (barrier to the entry) looking at the DJ's head: where the sight line crosses the
        // line's plane, how far it passes under the lowest thing hung there (bottom chord − a hung body)
        let sight = Infinity
        if (z > djZ) {
            for (let x = -5.35; x <= 5.35 + 1e-9; x += 0.5) {
                for (let ez = barrierZ + 0.3; ez <= 48; ez += 1) {
                    const eye = [x, EYE_M, ez]
                    const head = [design.booth.centre_x_m, s0.deck + DJ_HEAD_M, djZ]
                    if (z >= ez) continue
                    const k = (ez - z) / (ez - djZ)
                    const p = eye.map((v, i) => v + (head[i] - v) * k)
                    const u = (p[0] - (s0.trussAxis ?? s0.axis)) / Math.cos(s0.trussSlope)
                    if (u < uEnds[0] || u > uEnds[1]) continue
                    sight = Math.min(sight, s0.trussH - s0.trussSection / 2 + u * Math.sin(s0.trussSlope) - HUNG_BODY_M - p[1])
                }
            }
        }
        const over = z > barrierZ ? 'the dance floor' : z > lineZ ? 'the pit (between the line and the barrier)' : 'behind the stage line'
        const fails = []
        if (Math.abs(z - djZ) > 1) fails.push(`the DJ is ${r2(Math.abs(z - djZ))} m from the bridge (> 1 m: rig-lib refuses a crane-hung line not over the performer)`)
        if (cabClash.length) fails.push(`tie-off ${cabClash.join(', ')} through the crane cab`)
        for (const tie of tieoffs) if (tie.nearest_massing && tie.nearest_massing.gap_m < TIEOFF_CAB_MARGIN_M) fails.push(`tie-off ${tie.id} ${tie.nearest_massing.gap_m} m from ${tie.nearest_massing.id}`)
        if (z > lineZ) fails.push(`the line hangs over ${over}`)
        return {
            z_m: z,
            dj_offset_m: r2(z - djZ),
            grid_z_m: gridZ,
            tieoffs,
            over,
            low_end_over_raised_hands_m: t.clearance.low_end.over_raised_hands_m,
            line_nearest_massing: nearestMassing(line[0], line[1], hz),
            cab_over_massing: underCab.map((m) => ({ id: m.id, gap_m: r2(cab.y_m[0] - m.y_m[1]) })),
            sightline_to_dj_m: Number.isFinite(sight) ? r2(sight) : null,
            fails
        }
    })
}

/**
 * Can the crowd see the DJ on a LEVEL floor? The C-value (the sightline's clearance over the eyes of the person one row
 * in front: 60 mm minimum, 90 mm recommended, 120 mm optimum — FIFA's standard as given in Wikipedia "Sightline
 * (architecture)", read 2026-10-07; the Green Guide itself not opened). On a flat floor, a viewer D metres from the
 * focus with the row in front `rowM` closer, both eyes at `eye`: C = (F − eye) · rowM / D. The focus F is the DJ's eyes
 * (deck + 1.65 m). Returns how far into the crowd each C holds, from the front row (barrier + 0.3 m). Pure.
 */
export const crowdSightline = ({ deckH, djZ, barrierZ, eye = EYE_M, rowM = 0.5, djEye = 1.65 }) => {
    const F = deckH + djEye
    const nearest = barrierZ + 0.3 - djZ
    const reach = (c) => (F - eye) * rowM / c
    const rows = (c) => Math.max(0, Math.floor((reach(c) - nearest) / rowM) + 1)
    return {
        deck_h_m: deckH, focus_m: r2(F), front_row_m: r2(nearest),
        c_front_row_mm: Math.round(((F - eye) * rowM / nearest) * 1000),
        rows_c60: rows(0.06), rows_c90: rows(0.09), rows_c120: rows(0.12),
        reach_c90_m: r2(reach(0.09)),
        basis: `level floor, eyes ${eye} m, a row every ${rowM} m (ESTIMATE for a dense standing crowd), the DJ's eyes ${djEye} m over the deck`
    }
}

/** The DJ's eye line to the back of the floor: how far it passes over the front row's heads (head top `head` m). Pure. */
export const djEyeLine = ({ deckH, djZ, barrierZ, backZ, eye = EYE_M, head = 1.75, djEye = 1.65 }) => {
    const E = deckH + djEye
    const front = barrierZ + 0.3
    const at = E + (eye - E) * ((front - djZ) / (backZ - djZ))
    return { dj_eye_m: r2(E), over_front_row_heads_m: r2(at - head), basis: `head tops ${head} m (ESTIMATE), the back of the floor z ${backZ} at eye ${eye} m` }
}

// ---------------------------------------------------------------------------------------------------------------
// THE CUT AS A BACKDROP (owner, 2026-10-07: "the truss at the back of the DJ — where the DJ stage line finishes, the
// crane line there — with the truss flipped"). The park rule changes: not "the DJ within 1 m of the bridge" but
// "nothing hung over the riser": every hung part stands a clear gap behind the riser's back edge.
// ---------------------------------------------------------------------------------------------------------------

/** The hall's fixed things a strap must miss: the massing, and the crane runway beams on the column lines (ESTIMATE 0.8 m wide). */
export const fixedBoxes = (hall) => {
    const g = hall.geometry
    const rail = g.crane_rail_x_m ?? 11.35
    const L = g.end_wall_inner_y_m ?? 54
    return [
        ...(g.massing || []).map((m) => ({ id: m.id, ...boxOf(m) })),
        ...[-1, 1].map((k) => ({ id: k < 0 ? 'runway-l' : 'runway-r', min: [k * rail - 0.4, g.runway_bottom_m, -L], max: [k * rail + 0.4, g.runway_top_m, L] }))
    ]
}

/** The smallest gap from a→b to any fixed box, and to which. */
export const nearestFixed = (a, b, hall) => fixedBoxes(hall)
    .map((x) => ({ id: x.id, gap_m: r2(segmentBoxGap(a, b, x)) }))
    .sort((p, q) => p.gap_m - q.gap_m)[0]

/**
 * The anchor heights on a column that a tie-off from `from` can use: it misses every crane cab (safety.mjs, its 0.1 m
 * margin) and every fixed box by `margin`, and never dips under raised hands (`minY`). Scanned every 1 cm up to the
 * runway's underside. Returns the windows [[lo, hi], …]. Pure.
 */
export const anchorWindows = ({ from, colX, gridZ, hall, margin = 0.1, minY = 2.5, step = 0.01, coarse = 0.05 }) => {
    const top = Math.round((hall.geometry.runway_bottom_m - margin) * 100) / 100
    const boxes = fixedBoxes(hall)
    const ok = (y) => {
        const to = [colX, y, gridZ]
        if (tieoffCabClashes({ truss: { rigging: { tieoffs: [{ id: 't', from_m: from, to_m: to }] } } }, hall).length) return false
        if (Math.min(from[1], y) < minY) return false
        return boxes.every((x) => segmentBoxGap(from, to, x) >= margin - 1e-9)
    }
    const c2 = (v) => Math.round(v * 100) / 100
    // a coarse scan, then each edge found to `step` (a window narrower than `coarse` — 5 cm — can be missed: below any
    // rigging tolerance)
    const ys = []
    for (let y = 0.5; y <= top + 1e-9; y += coarse) ys.push(c2(y))
    if (ys[ys.length - 1] !== top) ys.push(top)
    const flags = ys.map(ok)
    const edge = (a, b, rising) => {
        for (let y = c2(a + step); y < b - 1e-9; y = c2(y + step)) if (ok(y) === rising) return y
        return b
    }
    const wins = []
    let lo = flags[0] ? ys[0] : null
    for (let k = 1; k < ys.length; k += 1) {
        if (!flags[k - 1] && flags[k]) lo = edge(ys[k - 1], ys[k], true)
        if (flags[k - 1] && !flags[k]) { wins.push([lo, c2(edge(ys[k - 1], ys[k], false) - step)]); lo = null }
    }
    if (lo !== null) wins.push([lo, ys[ys.length - 1]])
    return wins
}

/** The anchor height nearest the preferred one inside the windows (null if there is none). */
export const nearestInWindows = (wins, pref) => {
    let best = null
    for (const [lo, hi] of wins) {
        const y = Math.min(hi, Math.max(lo, pref))
        if (best === null || Math.abs(y - pref) < Math.abs(best - pref)) best = y
    }
    return best === null ? null : r2(best)
}

/** Where the hung parts of a line in the plane z reach along z: the bridle clamps on the girders' inner flanges are outermost. */
export const hungReach = (rig, z) => {
    const b = rig.truss.rigging.bridle
    const half = Math.max(b.leg_spread_m / 2 + 0.07, (rig.truss.section_m ?? 0.29) / 2)
    return { front: r3(z + half), back: r3(z - half), half_m: r3(half) }
}

/**
 * The backdrop park compared: for each bridge z and each rig (`rigs`: { name: rig derived for the line }), the gap from
 * the riser's back edge to the front-most hung part, the tie-offs to the two nearest column grid lines (the anchor
 * windows, the height kept or the least change, the angle off the bridge's plane), the raised-hands margin and what
 * fixed thing the line passes nearest. Pure.
 */
export const behindOptions = ({ rigs, hall, design, zs, gapMin }) => {
    const g = hall.geometry
    const out = []
    for (const [name, rig] of Object.entries(rigs)) {
        const cut = read(rig.truss.rigging.source)
        const s0 = stageFrame(rig, hall)
        const back = s0.back
        const uEnds = rig.truss.ends.map((e) => e.u_m)
        for (const z of zs) {
            const hz = hallWithCraneAt(hall, z)
            const stage = { ...s0, trussZ: z, crane: hz.geometry.cranes[0] }
            const reach = hungReach(rig, z)
            const gap = r2(s0.into > 0 ? back - reach.front : reach.back - back)
            const grids = [...g.column_grid_z_m].sort((p, q) => Math.abs(p - z) - Math.abs(q - z) || q - p).slice(0, 2)
            const ties = cut.rigging.tieoffs.map((tie) => {
                const from = linePoint(stage, tie.u_m, 'axis').map(r3)
                const pref = tie.y_m === 'end' ? r2(from[1]) : tie.y_m
                const options = grids.map((gz) => {
                    const wins = anchorWindows({ from, colX: tie.side * g.column_inner_face_x_m, gridZ: gz, hall: hz })
                    const y = nearestInWindows(wins, pref)
                    const to = [tie.side * g.column_inner_face_x_m, y, gz]
                    const horiz = Math.hypot(to[0] - from[0], to[2] - from[2])
                    return {
                        grid_z_m: gz, windows: wins, y_m: y, change_m: y === null ? null : r2(y - pref),
                        angle_off_plane_deg: Math.round((Math.atan2(Math.abs(gz - z), Math.abs(to[0] - from[0])) * 180) / Math.PI),
                        slope_deg: y === null ? null : Math.round((Math.atan2(y - from[1], horiz) * 180) / Math.PI),
                        nearest: y === null ? null : nearestFixed(from, to, hz)
                    }
                })
                // the least change, then the straightest, then the column further from the DJ (its pull draws the line back)
                const usable = options.filter((o) => o.y_m !== null).sort((p, q) => Math.abs(p.change_m) - Math.abs(q.change_m) || p.angle_off_plane_deg - q.angle_off_plane_deg || s0.into * (p.grid_z_m - q.grid_z_m))
                return { id: tie.id, side: tie.side, from_m: from, preferred_y_m: pref, options, pick: usable[0] || null }
            })
            const line = [linePoint(stage, uEnds[0], 'bottom'), linePoint(stage, uEnds[1], 'bottom')]
            const fails = []
            if (gap < gapMin) fails.push(`the front-most hung part (bridle clamps, z ${reach.front}) is ${gap} m behind the riser's back edge (< ${gapMin} m)`)
            for (const t of ties) {
                if (!t.pick) fails.push(`tie-off ${t.id}: no anchor height on either column (z ${grids.join(' / ')}) misses the cab, the fixed metal and raised hands`)
                else if (Math.abs(t.pick.change_m) > 0.005) fails.push(`tie-off ${t.id}: its own height (${t.preferred_y_m} m) is blocked — least change ${t.pick.change_m > 0 ? '+' : ''}${t.pick.change_m} m to ${t.pick.y_m} m on z ${t.pick.grid_z_m} (soft)`)
            }
            out.push({
                rig: name, z_m: z, riser_back_z_m: r2(back), hung_front_z_m: reach.front, gap_m: gap,
                low_end_over_raised_hands_m: rig.truss.clearance.low_end.over_raised_hands_m, low_end_side: rig.truss.clearance.low_end.side,
                line_nearest_fixed: nearestFixed(line[0], line[1], hz), ties,
                hard: fails.filter((f) => !f.endsWith('(soft)')), soft: fails.filter((f) => f.endsWith('(soft)'))
            })
        }
    }
    return out
}

/**
 * The cut slid along the bridge toward house left (owner, 2026-10-07: "we can a bit go left with truss … from the
 * perspective of the audience"): for each shift (m, toward −x), the same line re-derived (craneCut) with its axis at
 * −shift, and what it changes — the tie-offs (length, angle off the bridge's plane, anchor kept or the least change,
 * nearest fixed thing, the cab), the clamps' gap behind the riser, the low end against raised hands, the dance floor's
 * left edge and PA L, and where the line stands over the DJ. Pure (reads the committed files).
 */
export const shiftOptions = ({ inputs, shifts, djX = inputs.design.booth.centre_x_m }) => shifts.map((sh) => {
    const design = clone(inputs.design)
    design.truss.axis_x_m = r2(-sh)
    let rig
    try { rig = stageLineRig({ ...inputs, design }) } catch (e) { return { shift_m: sh, refused: e.message } }
    const t = rig.truss
    const z = inputs.design.crane.z_m
    const o = behindOptions({ rigs: { design: rig }, hall: inputs.hall, design, zs: [z], gapMin: design.truss.clear_gap_m })[0]
    const st = stageFrame(rig, inputs.hall)
    const low = [...t.ends].sort((p, q) => p.bottom_chord_m - q.bottom_chord_m)[0]
    const high = [...t.ends].sort((p, q) => q.bottom_chord_m - p.bottom_chord_m)[0]
    const pa = paEntities(design).find((e) => e.id === 'rig-pa-l-subs').components.transform
    const paTop = design.pa.stack.reduce((sum, k) => sum + k.n_high * k.h_m, 0)
    const dance = inputs.hall.geometry.zones.dance.used.x_m
    const uDj = (djX - (st.trussAxis ?? st.axis)) / Math.cos(st.trussSlope)
    const ties = t.rigging.tieoffs.map((tie) => {
        const opt = o.ties.find((x) => x.id === tie.id)
        const run = Math.abs(tie.to_m[0] - tie.from_m[0])
        return {
            id: tie.id, anchor_m: tie.to_m, length_m: tie.length_m, under_cab_m: tie.under_cab_m,
            angle_off_plane_deg: Math.round((Math.atan2(Math.abs(tie.to_m[2] - tie.from_m[2]), run) * 180) / Math.PI),
            nearest: nearestFixed(tie.from_m, tie.to_m, inputs.hall),
            window_on_its_column: opt?.options.find((x) => x.grid_z_m === tie.to_m[2])?.windows ?? null
        }
    })
    const fails = [...o.hard]
    for (const tie of ties) if (tie.nearest.gap_m < 0.1) fails.push(`tie-off ${tie.id} ${tie.nearest.gap_m} m from ${tie.nearest.id}`)
    if (tieoffCabClashes(rig, inputs.hall).length) fails.push('a tie-off crosses the cab')
    return {
        shift_m: sh, axis_x_m: r2(-sh),
        low_end: { x_m: low.x_m, bottom_chord_m: low.bottom_chord_m, over_raised_hands_m: t.clearance.low_end.over_raised_hands_m, outside_dance_floor_m: r2(dance[0] - low.x_m) },
        high_end: { x_m: high.x_m, bottom_chord_m: high.bottom_chord_m, right_of_dj_m: r2(high.x_m - djX) },
        over_pa_l: { x_overlap_m: r2(Math.max(0, Math.min(pa.position[0] + pa.scale[0] / 2, Math.max(...t.ends.map((e) => e.x_m))) - Math.max(pa.position[0] - pa.scale[0] / 2, Math.min(...t.ends.map((e) => e.x_m))))), z_apart_m: r2(pa.position[2] - pa.scale[2] / 2 - z), above_top_m: r2(low.bottom_chord_m - paTop) },
        behind_dj: { bottom_chord_m: r2(st.trussH - st.trussSection / 2 + uDj * Math.sin(st.trussSlope)) },
        gap_m: o.gap_m, line_nearest_fixed: o.line_nearest_fixed, ties, fails
    }
})

/** The park the table picks: no fails, the straightest tie-offs, then the nearest the DJ. */
export const pickPark = (options) => [...options]
    .filter((o) => !o.fails.length)
    .sort((a, b) => Math.max(...a.tieoffs.map((t) => t.along_z_m)) - Math.max(...b.tieoffs.map((t) => t.along_z_m)) || Math.abs(a.dj_offset_m) - Math.abs(b.dj_offset_m))[0] || null

/** The riser's plan footprint against the hall's fixed massing: the smallest gap in plan (0 = overlapping), and with what. */
export const riserClearance = (stage, hall) => {
    const half = stage.width / 2
    const [x0, x1, z0, z1] = [stage.axis - half, stage.axis + half, Math.min(stage.back, stage.front), Math.max(stage.back, stage.front)]
    return (hall.geometry.massing || []).map((m) => {
        const dx = Math.max(m.x_m[0] - x1, 0, x0 - m.x_m[1])
        const dz = Math.max(m.z_m[0] - z1, 0, z0 - m.z_m[1])
        return { id: m.id, gap_m: r3(Math.hypot(dx, dz)) }
    }).sort((p, q) => p.gap_m - q.gap_m)[0]
}

// --- the ops on an existing copy ---------------------------------------------------------------------------------

const BARRIER_ID = 'rig-crowd-barrier'
const add = (p, d) => p.map((v, i) => r3(v + d[i]))
const near = (a, b, tol = 0.01) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
const anim = { mode: 'static', speed: 1, amplitude: 1 }
const box = ({ id, name, pos, size, colour }) => ({
    id, type: 'box', name, parentId: null, createdBy: null,
    components: {
        transform: { position: pos.map(r3), rotation: [0, 0, 0], scale: size.map(r3) },
        appearance: { color: colour, opacity: 1, textureAssetId: null, roughness: 0.85, metalness: 0.05, emissive: '#000000', emissiveIntensity: 1 },
        primitive: { shape: 'box', size: [1, 1, 1] },
        animation: { ...anim }
    }
})

/** The two main PA stacks, as labelled placeholder boxes of the design's product (base-anchored, front on the line). */
export const paEntities = (design) => {
    const [sub, top] = design.pa.stack
    const subH = sub.n_high * sub.h_m
    const into = design.stage_line.faces === 'far' ? -1 : 1
    return design.pa.sides.flatMap((side) => [
        box({
            id: `rig-pa-${side.id.toLowerCase()}-subs`,
            name: `PA ${side.id} — PLACEHOLDER: ${sub.n_high} × ${sub.code} (${sub.w_m} × ${sub.h_m} × ${sub.d_m} m each, ${sub.kg} kg; ${sub.source.split(' ')[0]}), front on the stage line; sound design owed`,
            pos: [side.centre_x_m, 0, design.pa.front_z_m - into * sub.d_m / 2], size: [sub.w_m, subH, sub.d_m], colour: '#26282c'
        }),
        box({
            id: `rig-pa-${side.id.toLowerCase()}-tops`,
            name: `PA ${side.id} — PLACEHOLDER: ${top.n_high} × ${top.code} ground-stacked (${top.w_m} × ${top.h_m} × ${top.d_m} m each, ${top.kg} kg; ${top.source.split(' ')[0]}); sound design owed`,
            pos: [side.centre_x_m, subH, design.pa.front_z_m - into * top.d_m / 2], size: [top.w_m, top.n_high * top.h_m, top.d_m], colour: '#33363b'
        })
    ])
}

/** Entities whose transform someone else changed since `last` (the document this script last wrote): { id, from, to }. Pure. */
export const ownerMoves = (lastDoc, nowDoc) => {
    const last = new Map((lastDoc?.entities || []).map((e) => [e.id, e]))
    return (nowDoc?.entities || []).flatMap((e) => {
        const was = last.get(e.id)
        if (!was) return [{ id: e.id, from: null, to: e.components?.transform?.position ?? null, what: 'added' }]
        const a = JSON.stringify(was.components?.transform ?? null)
        const b = JSON.stringify(e.components?.transform ?? null)
        return a === b ? [] : [{ id: e.id, from: was.components?.transform ?? null, to: e.components?.transform ?? null, what: 'moved' }]
    }).concat((lastDoc?.entities || []).filter((e) => !(nowDoc?.entities || []).some((x) => x.id === e.id)).map((e) => ({ id: e.id, from: e.components?.transform ?? null, to: null, what: 'removed' })))
}

/** A venue plan's geometry, for "is it the same plan" — the server shortens long labels, so words are not compared. */
export const planKey = (plan) => JSON.stringify(plan ? {
    zones: (plan.zones || []).map((z) => [z.id, z.rects]),
    solids: (plan.solids || []).map((x) => [x.id, x.rect, x.top]),
    overhead: (plan.overhead || []).map((x) => [x.id, x.line || x.rect, x.bottom]),
    columns: plan.columns, outline: plan.outline
} : null)

/** The clients the rig scripts write as (opId/clientId on every op they send). */
export const OWN_CLIENTS = ['stage-line', 'swap-hall', 'aim-views', 'rehang', 'load-plot', 'load-version', 'copy-version', 'server']

/**
 * What someone else touched in a project, from its op log (GET /api/projects/:id/ops?since=0): the ids of the entities
 * whose transform, name or existence an op from a client that is NOT one of the rig scripts changed, and whether they
 * touched the presentation (views). Cumulative and stateless — the op log is the record, not a file this script kept
 * (2026-10-07: a --last document that already held the owner's nudges made them look like the script's own, and one
 * run put his booth back; that run was undone). `complete` is false when the log does not start at version 1. Pure.
 */
export const theirsFromOps = (ops, own = OWN_CLIENTS) => {
    const mine = (c) => own.some((p) => String(c || '').startsWith(p))
    const ids = new Map()
    let views = false
    for (const o of ops || []) {
        if (mine(o.clientId)) continue
        const pl = o.payload || {}
        if (o.type === 'setPresentationState') views = true
        const id = o.type === 'createEntity' ? pl.entity?.id : pl.entityId
        if (!id) continue
        if (o.type === 'updateComponent' && pl.component !== 'transform') continue
        ids.set(id, { id, what: o.type, version: o.version, client: String(o.clientId).slice(0, 8) })
    }
    const first = Math.min(...(ops || []).map((o) => o.version))
    return { ids: [...ids.values()], views, complete: !ops?.length || first <= 1 }
}

const STAIR = /^rig-dj-stair-\d+$/
const DECK = /^rig-deck-\d+$/
const sameT = (a, b) => ['position', 'rotation', 'scale'].every((k) => (a?.[k] || []).every((v, i) => Math.abs(v - (b?.[k]?.[i] ?? NaN)) < 0.001))

/**
 * The ops that bring a copy of the version to the stage-line design — from its old stage, or from an earlier pass on
 * the line (target state: a second run with the same design is empty). Pure. `keep`: ids someone else moved since this
 * script last wrote (ownerMoves) — never written, reported. Returns { ops, moved, kept, dCut, summary }.
 */
export const stageLineOps = ({ doc, rig, hall, oldRig, oldHall, design, keep = new Set() }) => {
    const entities = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
    const byId = new Map(entities.map((e) => [e.id, e]))
    const was = stageFrame(oldRig, oldHall)
    const now = stageFrame(rig, hall)
    const decks = entities.filter((e) => DECK.test(e.id))
    if (!decks.length) throw new Error('no DJ riser (rig-deck-*) in the document')
    const mean = (k) => decks.reduce((sum, e) => sum + e.components.transform.position[k], 0) / decks.length
    const [curAxis, curMid] = [mean(0), mean(2)]
    const onOld = Math.abs(curMid - (was.back + was.front) / 2) < 0.01
    const onLine = Math.abs(curMid - (now.back + now.front) / 2) < 0.01
    if (!onOld && !onLine) throw new Error(`the riser stands at z ${r3(curMid)}, neither the old stage (${(was.back + was.front) / 2}) nor the line — refusing`)
    const ops = []
    const moved = []
    const kept = []
    const write = (e, transform, name, { heightOnly = false } = {}) => {
        if (keep.has(e.id) && !heightOnly) { kept.push(e.id); return }
        if (sameT(e.components.transform, transform) && (!name || name === e.name)) return
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: transform } })
        if (name && name !== e.name) ops.push({ type: 'updateEntity', payload: { entityId: e.id, patch: { name } } })
        moved.push({ id: e.id, from: e.components.transform.position, to: transform.position })
    }
    // the booth: every piece keeps its place on the riser; the riser goes to the line at the design's x and height.
    // The booth is ONE unit: if someone else moved any deck or the table, none of it is written (its frame would be
    // read from their hand-placed pieces and drag the untouched ones after them)
    const boothIds = entities.filter((e) => DECK.test(e.id) || e.id === 'rig-dj-table').map((e) => e.id)
    const boothTheirs = boothIds.filter((id) => keep.has(id))
    if (boothTheirs.length) for (const id of boothIds) keep.add(id)
    const nowMid = (now.back + now.front) / 2
    const deckH = design.booth.deck_h_m
    const steps = design.booth.stairs !== false
    for (const e of entities) {
        const t = e.components?.transform
        if (!t?.position) continue
        const rel = [t.position[0] - curAxis, 0, t.position[2] - curMid]
        const at = (y) => [r3(now.axis + rel[0]), r3(y), r3(nowMid + rel[2])]
        // someone else's booth keeps its place; only the step's HEIGHT follows the design (the owner set it)
        const theirs = keep.has(e.id)
        if (DECK.test(e.id)) {
            if (theirs) { kept.push(e.id); write(e, { ...t, scale: [t.scale[0], deckH, t.scale[2]] }, `DJ riser — ${design.booth.deck.what}`, { heightOnly: true }) }
            else write(e, { ...t, position: at(0), scale: [t.scale[0], deckH, t.scale[2]] }, `DJ riser — ${design.booth.deck.what}`)
        } else if (e.id === 'rig-dj-table') {
            if (theirs) { kept.push(e.id); write(e, { ...t, position: [t.position[0], r3(deckH), t.position[2]] }, null, { heightOnly: true }) }
            else write(e, { ...t, position: at(deckH) })
        }
        else if (STAIR.test(e.id)) {
            if (steps) write(e, { ...t, position: at(t.position[1]) })
            else if (keep.has(e.id)) kept.push(e.id)
            else { ops.push({ type: 'deleteEntity', payload: { entityId: e.id } }); moved.push({ id: e.id, from: t.position, to: null }) }
        } else if (e.id === BARRIER_ID) {
            const [x0, x1] = design.barrier.x_m
            write(e, { position: [r3((x0 + x1) / 2), 0, design.barrier.z_m], rotation: [0, 0, 0], scale: [r3(x1 - x0), design.barrier.h_m, t.scale?.[2] ?? 0.08] },
                `Crowd barrier ${r2(x1 - x0)} m, ${design.barrier.pit_m} m pit (the stage line, 2026-10-07: runs 1 m past each PA stack)`)
        }
    }
    // the PA: placed, or created
    const pa = paEntities(design)
    for (const p of pa) {
        const e = byId.get(p.id)
        if (e) write(e, p.components.transform, p.name)
        else ops.push({ type: 'createEntity', payload: { entity: p } })
    }
    // the cut: only from the old place (a copy already on the line keeps its cut as it hangs)
    let dCut = null
    if (onOld) {
        const derived = new Map(slopedLineRigging(rig, now, hall).map((e) => [e.id, e]))
        // the cut moves RIGIDLY by what its re-derived rigging says: Δz from the bridge's move, and a Δy if the copy was
        // hung at another trim than the git version derives (2026-10-07: the PONYO 10-04 copy hangs 0.2 m high — built on
        // the old 8.15 m girder guess, before #772's 7.95 m). The tie-offs are excluded: they change shape, not just place.
        const offsets = entities.filter((e) => isCut(e) && derived.has(e.id) && !/tieoff/.test(e.id))
            .map((e) => derived.get(e.id).components.transform.position.map((v, i) => v - e.components.transform.position[i]))
        if (!offsets.length) throw new Error('no rigging of the cut (rig-hoist-*) in the document')
        dCut = [0, 1, 2].map((k) => offsets.reduce((sum, o) => sum + o[k], 0) / offsets.length)
        const spread = Math.max(...offsets.flatMap((o) => o.map((v, k) => Math.abs(v - dCut[k]))))
        if (spread > 0.005) throw new Error(`the cut's rigging would not move rigidly (spread ${r3(spread)} m) — its shape differs from the derived one; refusing`)
        const expected = [(now.trussAxis ?? now.axis) - (was.trussAxis ?? was.axis), 0, now.trussZ - was.trussZ]
        if (Math.abs(dCut[0] - expected[0]) > 0.005 || Math.abs(dCut[2] - expected[2]) > 0.005) throw new Error(`the cut would move (${dCut.map(r3)}), not along the bridge's move (${expected.map(r3)}) — refusing`)
        for (const e of entities) {
            const t = e.components?.transform
            if (!t?.position || !isCut(e)) continue
            const d = derived.get(e.id)
            if (d) write(e, clone(d.components.transform), d.name)
            else write(e, { ...t, position: add(t.position, dCut) })
        }
    }
    const plan = venuePlanFromHall(hall, { name: 'MOXIR · Charentsavan factory hall', source: `${design.crane.hall_record} (hall.py v${hall.version}, ${String(hall.createdAt || '').slice(0, 16)})` })
    if (planKey(byId.get('place-hall')?.components?.venuePlan) !== planKey(plan)) ops.push({ type: 'updateComponent', payload: { entityId: 'place-hall', component: 'venuePlan', patch: plan } })
    return {
        ops, moved, kept, dCut: dCut && dCut.map(r3),
        summary: `${onOld ? 'from the old stage' : 'on the line already'} · ${moved.length} placed/removed · ${pa.filter((p) => !byId.has(p.id)).length} PA created · ${kept.length} kept as someone else left them${dCut ? ` · cut Δ (${dCut.map(r2).join(', ')})` : ''}`
    }
}

/**
 * The ops that RE-CUT a copy already on the line: its cut (hung as `rigFrom` derives it at `hallFrom`) re-hung as
 * `rigTo` derives it at `hallTo` — a new bridge z and, with `mirror`, the line mirrored about the nave axis (the owner's
 * "flipped" backdrop, 2026-10-07). The rigging is replaced by the derived one; the line's pieces and its lamps move
 * rigidly (mirrored first: mirror-cut.mjs mirrorEntity, names' sides swapped), by the offset the derived rigging shows —
 * refused unless the rigging moves rigidly. The venue plan follows `hallTo`. Pure. Returns { ops, moved, kept, d }.
 */
export const recutOps = ({ doc, rigFrom, hallFrom, rigTo, hallTo, mirror = false, keep = new Set(), design }) => {
    const entities = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
    const from = new Map(slopedLineRigging(rigFrom, stageFrame(rigFrom, hallFrom), hallFrom).map((e) => [e.id, e]))
    const to = new Map(slopedLineRigging(rigTo, stageFrame(rigTo, hallTo), hallTo).map((e) => [e.id, e]))
    const flip = (p) => (mirror ? [-p[0], p[1], p[2]] : p)
    // the document must hang the cut as rigFrom says (else the rigid move below would carry an error along)
    const here = entities.filter((e) => isCut(e) && from.has(e.id) && !/tieoff/.test(e.id))
    if (!here.length) throw new Error('no rigging of the cut (rig-hoist-*) in the document')
    const off = Math.max(...here.flatMap((e) => e.components.transform.position.map((v, k) => Math.abs(v - from.get(e.id).components.transform.position[k]))))
    if (off > 0.005) throw new Error(`the document's cut is not where ${rigFrom.truss.rigging.source} derives it (off by ${r3(off)} m) — refusing`)
    // the rigid offset: derived-to minus (mirrored) derived-from, over the rigging that keeps its shape
    // mirrored, pick i of n becomes pick n+1−i (rig-lib numbers the picks from −x)
    const n = rigFrom.truss.rigging.picks_u_m.length
    const twin = (id) => (mirror ? id.replace(/^rig-hoist-(\d+)/, (_, i) => `rig-hoist-${n + 1 - Number(i)}`) : id)
    // (the safety steels are left out: rig-lib sets each 0.12 m to +x of its pick, mirrored or not — they are re-derived anyway)
    const offsets = [...from.values()].filter((e) => to.has(twin(e.id)) && !/tieoff|-steel/.test(e.id) && e.id !== 'rig-truss-header')
        .map((e) => to.get(twin(e.id)).components.transform.position.map((v, k) => v - flip(e.components.transform.position)[k]))
    const d = [0, 1, 2].map((k) => offsets.reduce((sum, o) => sum + o[k], 0) / offsets.length)
    const spread = Math.max(...offsets.flatMap((o) => o.map((v, k) => Math.abs(v - d[k]))))
    if (spread > 0.005) throw new Error(`the re-cut would not move rigidly (spread ${r3(spread)} m) — refusing`)
    const ops = []
    const moved = []
    const kept = []
    for (const e of entities) {
        const t = e.components?.transform
        if (!t?.position || !isCut(e)) continue
        if (keep.has(e.id)) { kept.push(e.id); continue }
        const derived = to.get(e.id)
        const next = derived ? { transform: clone(derived.components.transform), name: derived.name } : (() => {
            const m = mirror ? mirrorEntity(e) : clone(e)
            const mt = m.components.transform
            return { transform: { ...mt, position: mt.position.map((v, k) => r3(v + d[k])) }, name: m.name }
        })()
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: next.transform } })
        if (next.name && next.name !== e.name) ops.push({ type: 'updateEntity', payload: { entityId: e.id, patch: { name: next.name } } })
        moved.push({ id: e.id, from: t.position, to: next.transform.position })
    }
    const plan = venuePlanFromHall(hallTo, { name: 'MOXIR · Charentsavan factory hall', source: `${design.crane.hall_record} (hall.py v${hallTo.version}, ${String(hallTo.createdAt || '').slice(0, 16)})` })
    const venue = entities.find((e) => e.id === 'place-hall')
    if (planKey(venue?.components?.venuePlan) !== planKey(plan)) ops.push({ type: 'updateComponent', payload: { entityId: 'place-hall', component: 'venuePlan', patch: plan } })
    return { ops, moved, kept, d: d.map(r3) }
}

// --- CLI ---------------------------------------------------------------------------------------------------------

const args = (() => {
    const out = {}
    const a = process.argv.slice(2)
    for (let i = 0; i < a.length; i += 1) {
        if (!a[i].startsWith('--')) continue
        const k = a[i].slice(2)
        out[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true
    }
    return out
})

const main = async () => {
    const opt = args()
    const inputs = loadInputs(opt.design ? String(opt.design) : STAGE_LINE_FILE)
    const rig = stageLineRig(inputs)
    if (opt.shifts) {
        console.log(JSON.stringify(shiftOptions({ inputs, shifts: String(opt.shifts).split(',').map(Number) }), null, 1))
        return
    }
    if (opt.evaluate && inputs.design.truss.behind_m !== undefined) {
        // a BACKDROP design: its own cut ('design'); a FLIPPED one is compared with the stage-line cut (not flipped) in the same plane
        const line = loadInputs()
        const flipped = (rig.truss.slope_deg ?? 0) < 0
        const unflipped = flipped ? stageLineRig({ ...inputs, design: { ...inputs.design, truss: { ...inputs.design.truss, cut: line.design.truss.cut } } }) : null
        const zs = inputs.design.crane.candidates_m
        const options = behindOptions({ rigs: { design: rig, ...(unflipped ? { unflipped } : {}) }, hall: inputs.hall, design: inputs.design, zs, gapMin: inputs.design.truss.clear_gap_m })
        const st = stageFrame(rig, inputs.hall)
        const djZ = st.back + st.into * (st.depth / 2 - 0.2)
        const dz = inputs.hall.geometry.zones.dance.used.z_m
        const crowd = [0.2, 0.4, 0.6, 0.8, 1.2].map((h) => ({ ...crowdSightline({ deckH: h, djZ, barrierZ: inputs.design.barrier.z_m }), dj: djEyeLine({ deckH: h, djZ, barrierZ: inputs.design.barrier.z_m, backZ: dz[1] }) }))
        const trussOf = (r) => ({ ends: r.truss.ends, trim_m: r.truss.trim_m, picks: r.truss.rigging.picks, tieoffs: r.truss.rigging.tieoffs, clearance: r.truss.clearance })
        const z = inputs.design.crane.z_m
        let unTruss = null
        if (unflipped) {
            const un = options.find((o) => o.rig === 'unflipped' && o.z_m === z)
            unTruss = trussOf(unflipped)
            unTruss.tieoffs = un.ties.map((t) => ({ id: t.id, from_m: t.from_m, to_m: t.pick ? [t.side * inputs.hall.geometry.column_inner_face_x_m, t.pick.y_m, t.pick.grid_z_m] : null, under_cab_m: null }))
        }
        console.log(JSON.stringify({
            crowd,
            options: options.filter((o) => o.rig === 'design').map((o) => ({ ...o, fails: o.hard })),
            behind: options, picked: z, truss: trussOf(rig), ...(unTruss ? { unflipped_truss: unTruss } : {})
        }, null, 1))
        return
    }
    if (opt.evaluate) {
        const options = parkOptions({ rig, hall: inputs.hall, design: inputs.design })
        const st = stageFrame(rig, inputs.hall)
        const djZ = st.back + st.into * (st.depth / 2 - 0.2)
        const dz = inputs.hall.geometry.zones.dance.used.z_m
        const crowd = [0.2, 0.4, 0.6, 0.8, 1.2].map((h) => ({ ...crowdSightline({ deckH: h, djZ, barrierZ: inputs.design.barrier.z_m }), dj: djEyeLine({ deckH: h, djZ, barrierZ: inputs.design.barrier.z_m, backZ: dz[1] }) }))
        console.log(JSON.stringify({ crowd, options, picked: pickPark(options)?.z_m ?? null, truss: { ends: rig.truss.ends, trim_m: rig.truss.trim_m, picks: rig.truss.rigging.picks, tieoffs: rig.truss.rigging.tieoffs, clearance: rig.truss.clearance } }, null, 1))
        return
    }
    const api = String(opt.api || '').replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) throw new Error('stage-line.mjs writes to a scratch stack on localhost / 127.0.0.1 only (--api)')
    const project = String(opt.project || '')
    if (!project) throw new Error('needs --project <the copy>')
    const client = makeClient(api, opt['token-file'] ? readToken(String(opt['token-file'])) : null)
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) throw new Error(`reading ${project}: ${got.status}`)
    if (opt.out) fs.mkdirSync(String(opt.out), { recursive: true })
    // CONFLICT GUARD: someone may be editing the copy by hand. `--last` is the document this script last wrote;
    // anything moved since is theirs — kept, never written over, and listed.
    const last = opt.last ? JSON.parse(fs.readFileSync(String(opt.last), 'utf8')) : null
    const theirs = last ? ownerMoves(last.document || last, got.body.document) : []
    // `--kept <file>`: the ids kept on earlier runs stay theirs after this script writes again (its next --last holds
    // their moves as they are, so the diff alone would forget them). The file is a JSON list; this run adds to it.
    const keptFile = opt.kept ? String(opt.kept) : null
    const keptBefore = keptFile && fs.existsSync(keptFile) ? JSON.parse(fs.readFileSync(keptFile, 'utf8')) : []
    for (const id of keptBefore) if (!theirs.some((m) => m.id === id)) theirs.push({ id, what: 'kept before', from: null, to: null })
    // the op log: every entity another client ever touched in this copy is theirs (the guard that needs no state)
    const log = await client.get(`/api/projects/${project}/ops?since=0`)
    if (!log.ok) throw new Error(`reading the op log: ${log.status} — refusing to write without the guard`)
    const fromLog = theirsFromOps(log.body.ops)
    if (!fromLog.complete) throw new Error('the op log does not reach back to version 1 (the server keeps a window) — pass --last and --kept, or check by hand; refusing')
    for (const t of fromLog.ids) if (!theirs.some((m) => m.id === t.id)) theirs.push({ id: t.id, what: `${t.what} by ${t.client} (v${t.version})`, from: null, to: null })
    if (!last) console.log('no --last: the op log (and --kept) is the guard')
    // `--take a,b`: ids the owner has since decided by the design (2026-10-07: "±5.4 over his hand placement") — the guard lets go
    const take = new Set(String(opt.take || '').split(',').filter(Boolean))
    for (let i = theirs.length - 1; i >= 0; i -= 1) if (take.has(theirs[i].id)) { console.log(`  TAKEN by the owner's decision: ${theirs[i].id}`); theirs.splice(i, 1) }
    for (const m of theirs) console.log(`  KEPT (${m.what}): ${m.id}${m.from || m.to ? ` ${JSON.stringify(m.from?.position ?? m.from)} → ${JSON.stringify(m.to?.position ?? m.to)}` : ''}`)
    // `--recut-from <design>`: the copy hangs the cut as that design derives it; re-hang it as this one does (`--mirror`)
    // `--from-hall <record>`: the copy hangs THIS design's cut as it did at that hall, over the DJ (the 1 m rule) —
    // stage24's z 24 — before the cut moved behind him
    const fromHall = opt['from-hall'] ? String(opt['from-hall']) : null
    const recutFrom = opt['recut-from'] ? loadInputs(String(opt['recut-from']))
        : fromHall ? (() => {
            const d = clone(inputs.design)
            d.crane.hall_record = fromHall
            delete d.truss.behind_m
            // `--from-axis <x>`: where the copy's cut sat along the bridge then (stage24: on the nave axis, 0)
            if (opt['from-axis'] !== undefined) d.truss.axis_x_m = Number(opt['from-axis'])
            return { ...inputs, design: d, hall: read(fromHall) }
        })() : null
    const { ops, moved, kept, summary } = recutFrom
        ? (() => {
            const r = recutOps({ doc: got.body.document, rigFrom: stageLineRig(recutFrom), hallFrom: recutFrom.hall, rigTo: rig, hallTo: inputs.hall, mirror: Boolean(opt.mirror), keep: new Set(theirs.map((m) => m.id)), design: inputs.design })
            return { ...r, summary: `re-cut ${opt.mirror ? 'MIRRORED ' : ''}from ${opt['recut-from'] || fromHall}: ${r.moved.length} cut entities, offset (${r.d.join(', ')})` }
        })()
        : stageLineOps({ doc: got.body.document, rig, ...inputs, keep: new Set(theirs.map((m) => m.id)) })
    console.log(`${project} @ v${got.body.version}: ${summary}; ${ops.length} ops`)
    if (opt.out) fs.writeFileSync(path.join(String(opt.out), `stage-line-${project}-theirs.json`), JSON.stringify({ theirs, kept }, null, 1))
    if (keptFile) fs.writeFileSync(keptFile, JSON.stringify([...new Set([...keptBefore.filter((id) => !take.has(id)), ...theirs.filter((m) => m.what !== 'removed').map((m) => m.id)])], null, 1))
    if (opt.out) {
        fs.writeFileSync(path.join(String(opt.out), `stage-line-${project}-before.json`), JSON.stringify(got.body))
        fs.writeFileSync(path.join(String(opt.out), `stage-line-${project}-ops.json`), JSON.stringify(ops, null, 1))
        fs.writeFileSync(path.join(String(opt.out), `stage-line-${project}-moved.json`), JSON.stringify(moved, null, 1))
    }
    if (!opt.apply || !ops.length) { console.log(opt.apply ? 'nothing to write' : 'dry run: nothing written'); return }
    let version = got.body.version
    for (let i = 0; i < ops.length; i += 100) {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: version, ops: ops.slice(i, i + 100).map((op, j) => ({ ...op, opId: `stage-line-${Date.now()}-${i + j}`, clientId: 'stage-line' })) })
        if (!out.ok) throw new Error(`ops ${i}…: ${out.status} ${out.text.slice(0, 300)}`)
        version = out.body.newVersion
    }
    // read back: every moved entity where it was sent, the placeholders there, the plan's crane line at the new z
    const back = await client.get(`/api/projects/${project}/document`)
    const have = new Map(back.body.document.entities.map((e) => [e.id, e]))
    const wrong = moved.filter((m) => (m.to === null ? have.has(m.id) : !near(have.get(m.id)?.components?.transform?.position || [], m.to)))
    // a re-cut moves only the cut (no PA); a design whose PA are someone else's placeholders has no `pa.stack` (MOXIR v1.1)
    const missing = recutFrom || !inputs.design.pa?.stack ? [] : paEntities(inputs.design).filter((p) => !have.has(p.id)).map((p) => p.id)
    const crane = (have.get('place-hall')?.components?.venuePlan?.overhead || []).find((o) => o.id === 'crane-1')
    if (wrong.length || missing.length) throw new Error(`read back: ${wrong.length} misplaced (${wrong.slice(0, 3).map((m) => m.id).join(', ')}), missing ${missing.join(', ')}`)
    if (opt.out) fs.writeFileSync(path.join(String(opt.out), `stage-line-${project}-after.json`), JSON.stringify(back.body))
    console.log(`written, version ${version}; read back: ${moved.length} placed/removed, ${have.size} entities, plan crane-1 at z ${crane?.line?.[0]?.[1]}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1) })
}
