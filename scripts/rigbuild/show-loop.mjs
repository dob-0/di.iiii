#!/usr/bin/env node
/**
 * show-loop.mjs — program a project's SHOW on its cue list and start it LOOPING on the desk.
 * docs/architecture/RIG_BUILD.md §15.6 (the cue runner: docs/architecture/LIGHTING_DESK.md).
 *
 *   node scripts/rigbuild/show-loop.mjs --api https://local.thedi.studio/serverXR --project moxir-hall-minimal \
 *       --token-file ~/.di/di.env [--show <show.json>] [--no-start] [--dry-run]
 *   node scripts/rigbuild/show-loop.mjs … --stop        # stop the desk's runner (the look stays up)
 *   node scripts/rigbuild/show-loop.mjs --api … --project moxir-hall-minimal-halo --token-file … \
 *       --rig scripts/place/rigs/moxir-2026-10-17-minimal-halo.json --document-only
 *       # the rig file's own show (`show`), written into the document ONLY: the cue list, the loop
 *       # and, when the show says `source: 'clock'`, mappingState.showSource 'clock' — no call to
 *       # the desk at all (a comparison version the desk does not carry, RIG_BUILD.md §15.8).
 *       # Start its clock with show-clock.mjs --epoch now.
 *   node scripts/rigbuild/show-loop.mjs … --show <file> --doc-only   # step 1 only: the document's cue list
 *                                                    # and loop, the desk never asked — a project whose show
 *                                                    # plays by the document's clock (RIG_BUILD §16)
 *
 * What it does, in order — the same things the cards page does by hand:
 *   1. the document: the project's cue list (mappingState.cues) replaced by the show's cues
 *      — one per designed look, each naming its desk look `rig-<look>`, with its fade and
 *      hold — and `mappingState.loop` on. As ops (undo-able, in the op log).
 *   2. the desk: this project's designed looks put on the desk (POST /light/api/looks/add,
 *      over the desk's patched fixtures for this project) — WITH their DMX values for every
 *      fixture whose channel list is known, real or ASSUMED (deskLookValues.js, RIG_BUILD.md
 *      §18.4); a fixture whose list is owed gets none;
 *   3. the desk's cue runner: the list loaded (POST /light/api/cues/load) and cue 1 fired
 *      (POST /light/api/cues/go) — the desk's own clock then runs the show and loops it, with
 *      no page open.
 * It never switches the desk's OUTPUT on: what goes to real lights is the owner's call. It
 * says whether output is on or off at the end.
 *
 * The desk must be running THIS space's show (GET /light/api/show): the script refuses
 * otherwise, rather than put looks into another space's desk.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { deskLookId, rigLooksOf } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'

const args = parseArgs()

// MOXIR 17.10, the MINIMAL version (owner, 2026-09-28: "minimal, make the underground show
// loop"). An underground set: out of the dark into one beam, a slow sweep, the red room, the
// white cathedral, the strobe hit — and back to black. Cuts where a set cuts (into the hit,
// out of it); slow fades where it breathes. Tuned by looking (RIG_BUILD.md §15.6).
export const MOXIR_MINIMAL_SHOW = {
    project: 'moxir-hall-minimal',
    loop: true,
    cues: [
        { look: 'one-beam', name: 'Blackout + one beam', fade: 0, hold: 12 },
        { look: 'slow-sweep', name: 'Slow sweep', fade: 4, hold: 16 },
        { look: 'red-room', name: 'Red room', fade: 5, hold: 16 },
        { look: 'white-cathedral', name: 'White cathedral', fade: 2, hold: 12 },
        { look: 'strobe-hit', name: 'Strobe hit', fade: 0, hold: 4 }
    ]
}

/** The show as document cues and as the desk runner's list. Pure. */
export const showCues = (show) => show.cues.map((c, i) => ({
    id: `show-${String(i + 1).padStart(2, '0')}-${c.look}`.slice(0, 60),
    name: c.name,
    fade: c.fade,
    hold: c.hold,
    lightLook: deskLookId(c.look)
}))
export const runnerList = (cues) => cues.map((c) => ({ id: c.id, name: c.name, lookId: c.lightLook, hold: c.hold, fade: c.fade }))

/** Ops that replace a document's cue list with `cues` and set the loop. Pure. */
export const cueOps = (document, cues, loop, { source } = {}) => [
    ...(document.mappingState?.cues || []).map((c) => ({ type: 'deleteMappingCue', payload: { cueId: c.id } })),
    ...cues.map((cue) => ({ type: 'createMappingCue', payload: { cue } })),
    { type: 'setMappingState', payload: { patch: { loop: Boolean(loop), ...(source === 'clock' ? { showSource: 'clock' } : {}) } } }
]

/** A rig file's own show (`rig.show`, versions.mjs) in this script's show shape. Pure. */
export const showOfRig = (rig, project) => {
    if (!rig?.show?.cues?.length) throw new Error('the rig file carries no show (rig.show.cues)')
    return { project, loop: rig.show.loop !== false, source: rig.show.source, cues: rig.show.cues.map((c) => ({ look: c.look, name: c.name, fade: c.fade, hold: c.hold })) }
}

const readTokenFile = (file) => {
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

const main = async () => {
    const api = args.api ? String(args.api).replace(/\/+$/, '') : die('needs --api <base>/serverXR — no default on purpose')
    const light = api.replace(/\/serverXR$/, '') + '/light'
    const token = readTokenFile(path.resolve(String(args['token-file'] || die('needs --token-file')))) || die('no ADMIN_API_TOKEN in the token file')
    const client = makeClient(api, token)
    const desk = makeClient(light, null)
    const show = args.rig
        ? showOfRig(readJson(path.resolve(String(args.rig))), String(args.project || die('--rig needs --project')))
        : args.show ? readJson(path.resolve(String(args.show))) : MOXIR_MINIMAL_SHOW
    const project = String(args.project || show.project)
    const documentOnly = Boolean(args['document-only'])
    const dry = Boolean(args['dry-run'])

    if (args.stop) {
        const out = await desk.post('/api/cues/stop', {})
        if (!out.ok) die(`stop: ${out.status} ${out.text.slice(0, 200)}`)
        say(`the desk's runner stopped at ${out.body.cues.index + 1}/${out.body.cues.n} ${out.body.cues.name || ''}`)
        return
    }

    const doc = await client.get(`/api/projects/${project}/document`)
    if (!doc.ok) die(`reading ${project}: ${doc.status}`)
    const document = doc.body.document
    const looks = rigLooksOf(document.entities)
    if (!looks) die(`${project} has no designed looks (components.rigLooks) — run looks.mjs / load-version.mjs first`)
    const missing = show.cues.filter((c) => !looks.looks.some((l) => l.id === c.look)).map((c) => c.look)
    if (missing.length) die(`${project} has no look ${missing.join(', ')}`)

    if (args['doc-only']) {
        const cues = showCues(show)
        const wrote = await client.post(`/api/projects/${project}/ops`, { baseVersion: doc.body.version, ops: cueOps(document, cues, show.loop !== false).map((op, i) => ({ ...op, opId: `show-loop-${Date.now()}-${i}`, clientId: 'show-loop' })) })
        if (!wrote.ok) die(`writing the cue list: ${wrote.status} ${wrote.text.slice(0, 300)}`)
        say(`${project}: ${cues.length} cues, loop ${show.loop !== false ? 'on' : 'off'}, one loop ${cues.reduce((s, c) => s + c.hold, 0)} s — document only (version ${wrote.body.newVersion}); the desk was not asked`)
        return
    }
    if (!documentOnly) {
        const where = await desk.get('/api/show')
        const space = document.projectMeta?.spaceId
        if (!where.ok) die(`no desk at ${light} (${where.status})`)
        if (space && where.body.space !== space) die(`the desk is running ${where.body.space || "this machine's own"} show, not ${space}'s — open ${space}'s show on the desk first`)
    }

    const cues = showCues(show)
    const ops = cueOps(document, cues, show.loop !== false, { source: show.source })
    say(`${project}: ${cues.length} cues, loop ${show.loop !== false ? 'on' : 'off'} — ${cues.map((c) => `${c.name} (fade ${c.fade} s, hold ${c.hold} s)`).join(' → ')}`)
    const loopSeconds = cues.reduce((s, c) => s + c.hold, 0)
    say(`one loop = ${loopSeconds} s`)
    if (dry) { say('dry run: nothing written'); return }

    const wrote = await client.post(`/api/projects/${project}/ops`, { baseVersion: doc.body.version, ops: ops.map((op, i) => ({ ...op, opId: `show-loop-${Date.now()}-${i}`, clientId: 'show-loop' })) })
    if (!wrote.ok) die(`writing the cue list: ${wrote.status} ${wrote.text.slice(0, 300)}`)
    say(`document: cue list + loop${show.source === 'clock' ? ' + showSource clock' : ''} written (version ${wrote.body.newVersion})`)
    if (documentOnly) { say('--document-only: the desk was not asked anything'); return }

    const rig = await desk.get(`/api/rig?project=${encodeURIComponent(project)}`)
    if (!rig.ok) die(`the desk's rig for ${project}: ${rig.status}`)
    const fixtures = rig.body.fixtures || []
    const library = libraryWithShow(loadLibrary(), document.entities)
    const deskSet = deskLooksWithValues(looks, fixtures, { entities: document.entities, library })
    for (const look of deskSet) {
        const put = await desk.post('/api/looks/add', { look })
        if (!put.ok) die(`the desk did not take ${look.id}: ${put.status} ${put.text.slice(0, 200)}`)
    }
    const valued = new Set(deskSet.flatMap((l) => Object.keys(l.steps[0]?.values || {})))
    say(`desk: ${looks.looks.length} looks over ${fixtures.length} patched fixtures — DMX values for ${valued.size} (channel lists, ASSUMED where the type says so), none for ${fixtures.length - valued.size} (nothing a look sets on them — hazers — or a list owed)`)

    const loaded = await desk.post('/api/cues/load', { project, list: runnerList(cues), loop: show.loop !== false })
    if (!loaded.ok) die(`loading the runner: ${loaded.status} ${loaded.text.slice(0, 200)}`)
    if (!args['no-start']) {
        const go = await desk.post('/api/cues/go', { index: 0 })
        if (!go.ok) die(`GO: ${go.status} ${go.text.slice(0, 200)}`)
        say(`desk: running — ${go.body.cues.index + 1}/${go.body.cues.n} ${go.body.cues.name}, loop ${go.body.cues.loop ? 'on' : 'off'}${go.body.cues.missing?.length ? `, MISSING looks: ${go.body.cues.missing.join(', ')}` : ''}`)
    }
    const summary = await desk.get('/api/summary')
    say(`desk OUTPUT is ${summary.body?.output?.enabled ? 'ON — DMX is going out' : 'OFF — no Art-Net/sACN/DMX is sent'} (this script never changes it)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
