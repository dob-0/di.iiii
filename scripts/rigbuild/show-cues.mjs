#!/usr/bin/env node
/**
 * show-cues.mjs — a show file's cue list and loop into a project's DOCUMENT only, never the desk.
 *
 *   node scripts/rigbuild/show-cues.mjs --api <base>/serverXR --show <file.show.json> --token-file <env> [--project <id>]
 *
 * For a version that is not the one on the space's desk (the desk runs one patch per space,
 * RIG_BUILD §19.1): its room still plays the loop — by the show clock on a hosted tier (§16),
 * and on the install it follows whichever look the desk fires, by the look's id. show-loop.mjs
 * would also load the version's looks onto the desk and restart its runner, over the chosen
 * version's; this writes the document's cues and nothing else.
 */
import path from 'node:path'

import { parseArgs, die, say, readJson } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { cueOps, showCues } from './show-loop.mjs'
import fs from 'node:fs'

const main = async () => {
    const args = parseArgs()
    const api = args.api ? String(args.api).replace(/\/+$/, '') : die('needs --api <base>/serverXR — no default on purpose')
    const show = readJson(path.resolve(String(args.show || die('needs --show <file>'))))
    const project = String(args.project || show.project)
    const line = fs.readFileSync(path.resolve(String(args['token-file'] || die('needs --token-file'))), 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    const client = makeClient(api, line ? line.slice('ADMIN_API_TOKEN='.length).trim() : die('no ADMIN_API_TOKEN'))
    const doc = await client.get(`/api/projects/${project}/document`)
    if (!doc.ok) die(`reading ${project}: ${doc.status}`)
    const cues = showCues(show)
    const ops = cueOps(doc.body.document, cues, show.loop !== false)
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: doc.body.version, ops: ops.map((op, i) => ({ ...op, opId: `show-cues-${Date.now()}-${i}`, clientId: 'show-cues' })) })
    if (!out.ok) die(`writing the cues: ${out.status} ${out.text.slice(0, 300)}`)
    say(`${project}: ${cues.length} cues + loop in the document (version ${out.body.newVersion}) — ${cues.map((c) => `${c.name} (fade ${c.fade} s)`).join(' → ')}; the desk untouched`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
