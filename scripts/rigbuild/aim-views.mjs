#!/usr/bin/env node
/**
 * aim-views.mjs — the room's entry camera and view buttons, aimed at the stage the stage-line design describes.
 *
 * Why (2026-10-07): the copy moved to the owner's stage line (z 24.5), but its `presentationState` still aimed at the
 * old stage: the entry camera stood at z 20.2 — BEHIND the new stage — looking at the press, and the Floor / DJ buttons
 * looked at z 4–6. The views are derived from scripts/place/rigs/moxir-stage-line-2026-10-07.json `views` and the
 * stage's frame (rig-lib stageFrame), never typed:
 *
 *   entry  (presentationState.fixedCamera) — from the audience (views.entry.from_z_m, eye), aimed between the DJ's head
 *          and the crane girder over the line, so the bridge and the cut frame the DJ (the 09-28 opening's framing)
 *   floor  (viewPresets "floor")           — from the same place, at the DJ's head
 *   dj     (viewPresets "dj")              — from the DJ's eye on the riser, out to the dance floor's middle at a
 *                                            standing eye
 *
 *   node scripts/rigbuild/aim-views.mjs                                   # print the views, no server
 *   node scripts/rigbuild/aim-views.mjs --api http://127.0.0.1:4323/serverXR --project <copy> \
 *       [--token-file <dummy env>] [--last <document this script or stage-line.mjs last wrote>] [--apply]
 *
 * One `setPresentationState` op (shared/projectSchema.cjs: the patch is merged; an array is replaced) against the
 * version it read, then read back. Scratch hosts only (localhost / 127.0.0.1). CONFLICT GUARD: with --last, a view
 * someone else changed since is kept and reported, never written over.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { makeClient, readToken } from '../place/api.mjs'
import { stageFrame } from '../place/rig-lib.mjs'
import { DJ_HEAD_M, EYE_M, loadInputs, stageLineRig, theirsFromOps } from './stage-line.mjs'

/** A standing person's eyes over their feet (the DJ's, on the riser). ESTIMATE, the same as the crowd's EYE_M. */
export const DJ_EYE_M = 1.65
const r2 = (v) => Math.round(v * 100) / 100

/** The entry camera and the view buttons for the stage-line design. Pure. */
export const viewsFor = ({ design, stage, hall }) => {
    const v = design.views
    const crane = stage.crane
    const djZ = stage.back + stage.into * (stage.depth / 2 - 0.2)
    const head = stage.deck + DJ_HEAD_M
    const dance = hall.geometry.zones.dance.used
    const danceMid = (dance.z_m[0] + dance.z_m[1]) / 2
    const x = stage.axis
    return {
        fixedCamera: { position: [x, v.entry.eye_m, v.entry.from_z_m], target: [x, r2((head + crane.girder_bottom_m) / 2), crane.z_m], fov: v.entry.fov },
        presets: [
            { id: 'floor', label: 'Floor', position: [x, v.floor.eye_m, v.floor.from_z_m], target: [x, r2(head), r2(djZ)], fov: v.floor.fov },
            { id: 'dj', label: 'DJ', position: [x, r2(stage.deck + DJ_EYE_M), r2(djZ)], target: [x, EYE_M, r2(danceMid)], fov: v.dj.fov }
        ]
    }
}

/** The patch for the document's presentationState: other presets kept, ours replaced by id; fixedCamera merged. Pure. */
export const presentationPatch = (current, views) => {
    const ours = new Map(views.presets.map((p) => [p.id, p]))
    const list = (current?.viewPresets || []).map((p) => (ours.has(p.id) ? { ...p, ...ours.get(p.id) } : p))
    for (const p of views.presets) if (!list.some((q) => q.id === p.id)) list.push(p)
    return { viewPresets: list, fixedCamera: views.fixedCamera }
}

const args = () => {
    const out = {}
    const a = process.argv.slice(2)
    for (let i = 0; i < a.length; i += 1) if (a[i].startsWith('--')) out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true
    return out
}

const main = async () => {
    const opt = args()
    const inputs = loadInputs()
    const rig = stageLineRig(inputs)
    const views = viewsFor({ design: inputs.design, stage: stageFrame(rig, inputs.hall), hall: inputs.hall })
    if (!opt.api) { console.log(JSON.stringify(views, null, 1)); return }
    const api = String(opt.api).replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) throw new Error('aim-views.mjs writes to a scratch stack on localhost / 127.0.0.1 only (--api)')
    const project = String(opt.project || '')
    if (!project) throw new Error('needs --project')
    const client = makeClient(api, opt['token-file'] ? readToken(String(opt['token-file'])) : null)
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) throw new Error(`reading ${project}: ${got.status}`)
    const ps = got.body.document.presentationState || {}
    let patch = presentationPatch(ps, views)
    const log = await client.get(`/api/projects/${project}/ops?since=0`)
    const fromLog = log.ok ? theirsFromOps(log.body.ops) : { complete: false }
    if (!fromLog.complete) throw new Error('no complete op log to check against — refusing')
    if (fromLog.views) { console.log('KEPT: the views were set by someone else (op log) — not written'); patch = {} }
    if (opt.last) {
        const last = JSON.parse(fs.readFileSync(String(opt.last), 'utf8'))
        const was = (last.document || last).presentationState || {}
        if (JSON.stringify(was.fixedCamera) !== JSON.stringify(ps.fixedCamera)) { console.log('KEPT: fixedCamera was changed by someone else'); delete patch.fixedCamera }
        if (JSON.stringify(was.viewPresets) !== JSON.stringify(ps.viewPresets)) { console.log('KEPT: viewPresets were changed by someone else'); delete patch.viewPresets }
    }
    console.log(JSON.stringify({ from: { fixedCamera: ps.fixedCamera, viewPresets: ps.viewPresets }, patch }, null, 1))
    if (!Object.keys(patch).length || !opt.apply) { console.log(opt.apply ? 'nothing to write' : 'dry run: nothing written'); return }
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: [{ type: 'setPresentationState', payload: { patch }, opId: `aim-views-${Date.now()}`, clientId: 'aim-views' }] })
    if (!out.ok) throw new Error(`op: ${out.status} ${out.text.slice(0, 300)}`)
    const back = (await client.get(`/api/projects/${project}/document`)).body
    const b = back.document.presentationState
    const bad = (patch.fixedCamera && JSON.stringify(b.fixedCamera.position) !== JSON.stringify(patch.fixedCamera.position)) ||
        (patch.viewPresets && patch.viewPresets.some((p) => JSON.stringify(b.viewPresets.find((q) => q.id === p.id)?.target) !== JSON.stringify(p.target)))
    if (bad) throw new Error('read back: the views are not what was sent')
    if (opt.out) fs.writeFileSync(path.join(String(opt.out), `aim-views-${project}-after.json`), JSON.stringify(back))
    console.log(`written, version ${back.version}; read back: entry ${JSON.stringify(b.fixedCamera.position)} → ${JSON.stringify(b.fixedCamera.target)}, ${b.viewPresets.map((p) => `${p.id} ${JSON.stringify(p.position)} → ${JSON.stringify(p.target)}`).join(', ')}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1) })
}
