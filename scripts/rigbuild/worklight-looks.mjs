#!/usr/bin/env node
/**
 * worklight-looks.mjs — put the work-light looks layer (scripts/place/moxir_worklight.py) on a SCRATCH project that already
 * holds the v1.1 rig: its rigLooks, its cue list (loop kept) and the room's ambient. Entities are not touched. Folding it into
 * the v1.1 build later: epic-build.mjs --rig <a rig whose `looks` = the layer's looks> and v1Cues from the layer's `cues`.
 *   node scripts/rigbuild/worklight-looks.mjs --api http://localhost:4329/serverXR --token-file <dummy.env> --project moxir-v1-1-looks
 * The desk is shared by the stack: not written here (add --desk to load the looks and the cue runner on it).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say, REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { lookFrame } from '../../src/rigbuild/looks.js'
import { v1Looks, v1RenderOps, deskStep } from './epic-build.mjs'

export const LAYER_FILE = 'scripts/place/rigs/moxir-looks-v1-1-worklight-2026-10-09.json'
export const RIG_V11 = 'scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json'

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const api = String(args.api || '').replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) die('scratch stack on localhost only (--api)')
    const project = String(args.project || die('needs --project'))
    if (project === 'moxir-v1-1' || project === 'moxir-v1-0') die('not on the build projects: use moxir-v1-1-looks')
    const client = makeClient(api, readToken(String(args['token-file'])))
    const rig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, String(args.rig || RIG_V11)), 'utf8'))
    const layer = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, LAYER_FILE), 'utf8'))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    const doc = got.body.document
    const ctx = lookFrame(doc.entities)
    if (!ctx) die('no stage frame')
    const looks = v1Looks({ ...rig, looks: layer.looks }, doc.entities.filter((e) => e.type === 'spotLight'), ctx, LAYER_FILE)
    const ops = [{ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigLooks', patch: looks } }]
    for (const c of doc.mappingState?.cues || []) ops.push({ type: 'deleteMappingCue', payload: { cueId: c.id } })
    for (const c of layer.cues) ops.push({ type: 'createMappingCue', payload: { cue: c } })
    ops.push(...v1RenderOps({ ambient: Number(args.ambient ?? layer.ambient) }))
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `wl-${Date.now()}-${j}`, clientId: 'worklight' })) })
    if (!out.ok) die(`ops: ${out.status} ${out.text.slice(0, 400)}`)
    say(`${project}: ${looks.looks.length} looks, ${layer.cues.length} cues, ambient ${args.ambient ?? layer.ambient} → version ${out.body.newVersion}`)
    if (args.desk) {
        const d = (await client.get(`/api/projects/${project}/document`)).body.document
        await deskStep({ api, project, document: d, cues: d.mappingState.cues, loop: d.mappingState.loop === true })
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => die(e.stack || String(e)))
