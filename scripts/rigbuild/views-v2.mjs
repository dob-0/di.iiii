#!/usr/bin/env node
/**
 * views-v2.mjs — the view buttons and the entry camera for a MOXIR v2 scene, derived from its rig file (the DJ axis,
 * the DJ table, the barrier, the door), never typed by hand.
 *
 * Why (2026-10-12, owner: "i want what i see in real time :D view cameras"): the v2 copies still carried v1's presets
 * (Floor at z 18 looking at z -20, where no stage is any more). Every view here looks at the v2 stage: the DJ at z ~5,
 * the floor z 8..28, the door at z 53.8. Lenses 50-60 deg (a 35 mm eye, not a 70-75 deg wide shot).
 *
 *   node scripts/rigbuild/views-v2.mjs --rig scripts/place/rigs/moxir-v2-6-2026-10-12.json          # print
 *   node scripts/rigbuild/views-v2.mjs --rig <rig> --api http://127.0.0.1:4337/serverXR --project moxir-v2-6 \
 *       --token-file <dummy env> --apply                                                               # one setPresentationState op
 * Scratch hosts only (localhost / 127.0.0.1).
 */
import fs from 'node:fs'
import { makeClient, readToken } from '../place/api.mjs'

const EYE = 1.7, DJ_EYE = 1.65
const r2 = (v) => Math.round(v * 100) / 100
const args = () => { const o = {}; const a = process.argv.slice(2); for (let i = 0; i < a.length; i += 1) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; return o }

/** The views for a v2 rig. Pure. */
export const viewsFor = (rig) => {
    const x0 = rig.symmetry?.axis_x_m ?? -5.2
    const dj = rig.solids?.find((s) => s.id === 'rig-dj-table') || { p: [x0, 0.4, 5.0], s: [1.8, 0.9, 0.8] }
    const djZ = dj.p[2], djHead = dj.p[1] + 1.75
    const barrier = rig.solids?.find((s) => s.id === 'rig-crowd-barrier')?.p?.[2] ?? 8.2
    const doorZ = rig.hall?.door?.z_m ?? 53.8
    const floorMid = barrier + 10                                       // the floor's middle, 10 m behind the barrier
    const cubes = (rig.fixtures || []).filter((f) => f.type === 'ext-lc-ultra-mk2')
    const laserZ = cubes.length ? cubes[0].p[2] : -42.45
    const v = (id, label, position, target, fov) => ({ id, label, position: position.map(r2), target: target.map(r2), fov })
    const floor = v('floor', 'Floor 1.7 m', [x0, EYE, floorMid], [x0, djHead, djZ], 50)
    return {
        fixedCamera: { projection: 'perspective', ...floor, zoom: 1, near: 0.05, far: 400, locked: false, id: undefined, label: undefined },
        viewPresets: [          // the viewer takes ONLY these ids (smartViewGeometry: the six built-in ids replace the computed view, any other slug is an extra named camera; labels <= 16 chars)
            floor,
            v('dj', 'DJ', [x0, dj.p[1] + DJ_EYE, djZ - 0.3], [x0, EYE, floorMid + 6], 60),
            v('top', 'Top plan', [x0, 85, djZ - 8], [x0, 0, djZ - 9], 60),
            v('side', 'Side', [x0 + 30, 6, floorMid], [x0, 4, djZ - 6], 55),
            v('rig', 'Under the lasers', [x0, 2.5, laserZ + 10], [x0, 9.0, doorZ], 60),
            v('entrance', 'Entrance', [x0, EYE, doorZ - 3], [x0, djHead + 1, djZ], 50),
            v('outside', 'Outside', [x0 + 25, 6, doorZ + 30], [x0, 5, doorZ], 55),
        ],
    }
}

const main = async () => {
    const opt = args()
    const rig = JSON.parse(fs.readFileSync(String(opt.rig || 'scripts/place/rigs/moxir-v2-6-2026-10-12.json'), 'utf8'))
    const views = viewsFor(rig); delete views.fixedCamera.id; delete views.fixedCamera.label
    if (!opt.api) { console.log(JSON.stringify(views, null, 1)); return }
    const api = String(opt.api).replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) throw new Error('views-v2.mjs writes to a scratch stack only (--api localhost / 127.0.0.1)')
    const project = String(opt.project || ''); if (!project) throw new Error('needs --project')
    const client = makeClient(api, opt['token-file'] ? readToken(String(opt['token-file'])) : null)
    const got = await client.get(`/api/projects/${project}/document`); if (!got.ok) throw new Error(`reading ${project}: ${got.status}`)
    const ps = got.body.document.presentationState || {}
    console.log('from:', JSON.stringify((ps.viewPresets || []).map((p) => `${p.id} ${JSON.stringify(p.position)}→${JSON.stringify(p.target)} ${p.fov}`)))
    console.log('to:  ', JSON.stringify(views.viewPresets.map((p) => `${p.id} ${JSON.stringify(p.position)}→${JSON.stringify(p.target)} ${p.fov}`)))
    if (!opt.apply) { console.log('dry run: nothing written'); return }
    const patch = { mode: 'fixed-camera', entryView: 'fixed-camera', fixedCamera: views.fixedCamera, viewPresets: views.viewPresets }
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: [{ type: 'setPresentationState', payload: { patch }, opId: `views-v2-${Date.now()}`, clientId: 'views-v2' }] })
    if (!out.ok) throw new Error(`op: ${out.status} ${out.text.slice(0, 300)}`)
    const back = (await client.get(`/api/projects/${project}/document`)).body; const b = back.document.presentationState
    const bad = views.viewPresets.some((p) => JSON.stringify(b.viewPresets.find((q) => q.id === p.id)?.target) !== JSON.stringify(p.target))
    if (bad) throw new Error('read back: the views are not what was sent')
    console.log(`written, version ${back.version}; read back ${b.viewPresets.length} views, entry ${JSON.stringify(b.fixedCamera.position)} → ${JSON.stringify(b.fixedCamera.target)} fov ${b.fixedCamera.fov}`)
}
main().catch((e) => { console.error(e.message); process.exit(1) })
