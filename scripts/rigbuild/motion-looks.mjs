#!/usr/bin/env node
/**
 * motion-looks.mjs - put the 10 MOVING scenes (scripts/place/moxir_motion.py) on a SCRATCH project that already holds the v1.1
 * rig: its rigLooks = the work-light layer's looks + the ten motion looks (each carries `motion`), its cue list = the ten
 * scenes first (so they are the room's default favourites, in the order of the night: showRemote.js favouritesOf takes the
 * first FAVOURITES_MAX non-laser looks) then the work-light layer's cues, the room's ambient. Entities are not touched.
 *   node scripts/rigbuild/motion-looks.mjs --api http://127.0.0.1:4335/serverXR --token-file <env with ADMIN_API_TOKEN=dummy> --project moxir-v1-1-motion
 * Scratch only: localhost, and the project must be moxir-v1-1-motion (never moxir-v1-1 / moxir-v1-0). Undo: copy-version --undo or re-run worklight-looks.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say, REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { lookFrame } from '../../src/rigbuild/looks.js'
import { v1Looks, v1RenderOps, deskStep } from './epic-build.mjs'
import { LAYER_FILE as WORKLIGHT_FILE, RIG_V11 } from './worklight-looks.mjs'

export const LAYER_FILE = 'scripts/place/rigs/moxir-looks-v1-1-motion-2026-10-09.json'
export const SCRATCH_PROJECT = 'moxir-v1-1-motion'

/** The two layers as one: looks (work light first, then the ten) with `motion` re-attached, cues (the ten first). Pure. */
export const merged = (worklight, motion, withMotion) => {
    const looks = [...worklight.looks, ...motion.looks]
    const cues = [...motion.cues, ...worklight.cues]
    return { looks, cues, motionOf: new Map(motion.looks.map((l) => [l.id.replace(/_/g, '-'), l.motion])) , withMotion }
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const api = String(args.api || '').replace(/\/+$/, '')
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) die('scratch stack on localhost only (--api)')
    const project = String(args.project || die('needs --project'))
    if (project !== SCRATCH_PROJECT) die(`only the scratch project ${SCRATCH_PROJECT} (never moxir-v1-1 / moxir-v1-0)`)
    const client = makeClient(api, readToken(String(args['token-file'])))
    const rig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, String(args.rig || RIG_V11)), 'utf8'))
    const wl = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, WORKLIGHT_FILE), 'utf8'))
    const mo = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, LAYER_FILE), 'utf8'))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    const doc = got.body.document
    const ctx = lookFrame(doc.entities)
    if (!ctx) die('no stage frame')
    const both = merged(wl, mo)
    const looks = v1Looks({ ...rig, looks: both.looks }, doc.entities.filter((e) => e.type === 'spotLight'), ctx, LAYER_FILE)
    for (const l of looks.looks) if (both.motionOf.has(l.id)) l.motion = both.motionOf.get(l.id)
    const ops = [{ type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigLooks', patch: looks } }]
    for (const c of doc.mappingState?.cues || []) ops.push({ type: 'deleteMappingCue', payload: { cueId: c.id } })
    for (const c of both.cues) ops.push({ type: 'createMappingCue', payload: { cue: c } })
    ops.push(...v1RenderOps({ ambient: Number(args.ambient ?? mo.ambient), sigma: Number(args.sigma ?? mo.haze_sigma_per_m) }))
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, j) => ({ ...op, opId: `mo-${Date.now()}-${j}`, clientId: 'motion-looks' })) })
    if (!out.ok) die(`ops: ${out.status} ${out.text.slice(0, 400)}`)
    say(`${project}: ${looks.looks.length} looks (${looks.looks.filter((l) => l.motion).length} moving), ${both.cues.length} cues → version ${out.body.newVersion}`)
    if (args.desk) {
        const d = (await client.get(`/api/projects/${project}/document`)).body.document
        await deskStep({ api, project, document: d, cues: d.mappingState.cues, loop: d.mappingState.loop === true })
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => die(e.stack || String(e)))
