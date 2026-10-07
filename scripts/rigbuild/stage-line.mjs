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
 *       [--token-file <dummy env>] [--out <dir>] [--apply]                # dry run unless --apply
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
import { isCut } from './mirror-cut.mjs'
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
export const loadInputs = () => {
    const spec = read(VERSIONS_FILE)
    const base = read(path.join(RIGS_DIR, spec.base))
    const design = read(STAGE_LINE_FILE)
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

/** The park the table picks: no fails, the straightest tie-offs, then the nearest the DJ. */
export const pickPark = (options) => [...options]
    .filter((o) => !o.fails.length)
    .sort((a, b) => Math.max(...a.tieoffs.map((t) => t.along_z_m)) - Math.max(...b.tieoffs.map((t) => t.along_z_m)) || Math.abs(a.dj_offset_m) - Math.abs(b.dj_offset_m))[0] || null

// --- the ops on an existing copy ---------------------------------------------------------------------------------

const BOOTH = /^rig-(deck-\d+|dj-table|dj-stair-\d+)$/
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

/**
 * The ops that move a copy of the version from its old stage to the line. Pure. Refuses a document that is not in
 * the old place (so a second run is a no-op, never a double move). Returns { ops, moved, summary }.
 */
export const stageLineOps = ({ doc, rig, hall, oldRig, oldHall, design }) => {
    const entities = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
    const byId = new Map(entities.map((e) => [e.id, e]))
    const was = stageFrame(oldRig, oldHall)
    const now = stageFrame(rig, hall)
    const dBooth = [now.axis - was.axis, 0, now.front - was.front]
    const deck = [...byId.values()].find((e) => /^rig-deck-\d+$/.test(e.id))
    if (!deck) throw new Error('no DJ riser (rig-deck-*) in the document')
    const deckPos = deck.components.transform.position
    const wasDeck = deckPos[2] - (was.back + was.front) / 2
    const nowDeck = deckPos[2] - (now.back + now.front) / 2
    const plan = venuePlanFromHall(hall, { name: 'MOXIR · Charentsavan factory hall', source: `${design.crane.hall_record} (hall.py v${hall.version}, ${String(hall.createdAt || '').slice(0, 16)})` })
    const planOp = { type: 'updateComponent', payload: { entityId: 'place-hall', component: 'venuePlan', patch: plan } }
    if (Math.abs(nowDeck) < 0.01 && Math.abs(wasDeck) > 0.01) {
        // already moved: only the venue plan follows a rebuilt hall record
        const same = JSON.stringify(byId.get('place-hall')?.components?.venuePlan) === JSON.stringify(plan)
        return { ops: same ? [] : [planOp], moved: [], dCut: null, summary: `already on the stage line${same ? ': nothing to do' : ': the venue plan re-derived from the hall record'}` }
    }
    if (Math.abs(wasDeck) > 0.01) throw new Error(`the riser stands at z ${deckPos[2]}, neither the old stage (${(was.back + was.front) / 2}) nor the line — refusing`)
    const derived = new Map(slopedLineRigging(rig, now, hall).map((e) => [e.id, e]))
    // the cut moves RIGIDLY by what its re-derived rigging says: Δz from the bridge's move, and a Δy if the copy was
    // hung at another trim than the git version derives (2026-10-07: the PONYO 10-04 copy hangs 0.2 m high — built on
    // the old 8.15 m girder guess, before #772's 7.95 m). The tie-offs are excluded: they change shape, not just place.
    const offsets = entities.filter((e) => isCut(e) && derived.has(e.id) && !/tieoff/.test(e.id))
        .map((e) => derived.get(e.id).components.transform.position.map((v, i) => v - e.components.transform.position[i]))
    if (!offsets.length) throw new Error('no rigging of the cut (rig-hoist-*) in the document')
    const dCut = [0, 1, 2].map((k) => offsets.reduce((sum, o) => sum + o[k], 0) / offsets.length)
    const spread = Math.max(...offsets.flatMap((o) => o.map((v, k) => Math.abs(v - dCut[k]))))
    if (spread > 0.005) throw new Error(`the cut's rigging would not move rigidly (spread ${r3(spread)} m) — its shape differs from the derived one; refusing`)
    const expected = [(now.trussAxis ?? now.axis) - (was.trussAxis ?? was.axis), 0, now.trussZ - was.trussZ]
    if (Math.abs(dCut[0] - expected[0]) > 0.005 || Math.abs(dCut[2] - expected[2]) > 0.005) throw new Error(`the cut would move (${dCut.map(r3)}), not along the bridge's move (${expected.map(r3)}) — refusing`)
    const ops = []
    const moved = []
    const move = (e, transform, name) => {
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: transform } })
        if (name && name !== e.name) ops.push({ type: 'updateEntity', payload: { entityId: e.id, patch: { name } } })
        moved.push({ id: e.id, from: e.components.transform.position, to: transform.position })
    }
    for (const e of entities) {
        const t = e.components?.transform
        if (!t?.position) continue
        if (BOOTH.test(e.id)) move(e, { ...t, position: add(t.position, dBooth) })
        else if (e.id === BARRIER_ID) {
            const [x0, x1] = design.barrier.x_m
            move(e, { position: [r3((x0 + x1) / 2), 0, design.barrier.z_m], rotation: [0, 0, 0], scale: [r3(x1 - x0), design.barrier.h_m, t.scale?.[2] ?? 0.08] },
                `Crowd barrier ${r2(x1 - x0)} m, ${design.barrier.pit_m} m pit (the stage line, 2026-10-07: runs 1 m past each PA stack)`)
        } else if (isCut(e)) {
            const d = derived.get(e.id)
            if (d) move(e, clone(d.components.transform), d.name)
            else move(e, { ...t, position: add(t.position, dCut) })
        }
    }
    const pa = paEntities(design)
    for (const p of pa) {
        if (byId.has(p.id)) throw new Error(`${p.id} already exists`)
        ops.push({ type: 'createEntity', payload: { entity: p } })
    }
    ops.push(planOp)
    const cut = moved.filter((m) => isCut(byId.get(m.id)))
    return {
        ops, moved, dCut: dCut.map(r3),
        summary: `booth Δ (${dBooth.map(r2).join(', ')}) · cut Δ (${dCut.map(r2).join(', ')}) (${cut.length} entities, ${cut.filter((m) => derived.has(m.id)).length} rigging re-derived) · barrier · ${pa.length} PA placeholders · venue plan from ${path.basename(design.crane.hall_record)}`
    }
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
    const inputs = loadInputs()
    const rig = stageLineRig(inputs)
    if (opt.evaluate) {
        const options = parkOptions({ rig, hall: inputs.hall, design: inputs.design })
        console.log(JSON.stringify({ options, picked: pickPark(options)?.z_m ?? null, truss: { ends: rig.truss.ends, trim_m: rig.truss.trim_m, picks: rig.truss.rigging.picks, tieoffs: rig.truss.rigging.tieoffs, clearance: rig.truss.clearance } }, null, 1))
        return
    }
    const api = String(opt.api || '').replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) throw new Error('stage-line.mjs writes to a scratch stack on localhost / 127.0.0.1 only (--api)')
    const project = String(opt.project || '')
    if (!project) throw new Error('needs --project <the copy>')
    const client = makeClient(api, opt['token-file'] ? readToken(String(opt['token-file'])) : null)
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) throw new Error(`reading ${project}: ${got.status}`)
    const { ops, moved, summary } = stageLineOps({ doc: got.body.document, rig, ...inputs })
    console.log(`${project} @ v${got.body.version}: ${summary}; ${ops.length} ops`)
    if (opt.out) {
        fs.mkdirSync(String(opt.out), { recursive: true })
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
    const wrong = moved.filter((m) => !near(have.get(m.id)?.components?.transform?.position || [], m.to))
    const missing = paEntities(inputs.design).filter((p) => !have.has(p.id)).map((p) => p.id)
    const crane = (have.get('place-hall')?.components?.venuePlan?.overhead || []).find((o) => o.id === 'crane-1')
    if (wrong.length || missing.length) throw new Error(`read back: ${wrong.length} misplaced (${wrong.slice(0, 3).map((m) => m.id).join(', ')}), missing ${missing.join(', ')}`)
    console.log(`written, version ${version}; read back: ${moved.length} moved, ${have.size} entities, plan crane-1 at z ${crane?.line?.[0]?.[1]}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1) })
}
