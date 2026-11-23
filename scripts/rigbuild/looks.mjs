#!/usr/bin/env node
/**
 * looks.mjs — the rig file's designed looks, as view C's `components.rigLooks`.
 * docs/architecture/RIG_BUILD.md §11.4.
 *
 *   node scripts/rigbuild/looks.mjs --rig <rigs/moxir-2026-10-17.json> \
 *     [--api http://localhost:4383/serverXR --project moxir-hall --token-file serverXR/.env.local]
 *
 * A rig file's look names a rule per GROUP (rig.groups: a fixture class on a mount).
 * The cards know lamps by POSITION and TYPE, so each group is renamed to the position
 * its mount rule becomes (src/rigbuild/positions.js) and its class's rental code:
 * "beam380-columns" (class beam380, mount column-bases) → "column-bases/up-b380f".
 * A mount with no position, or two groups landing on one key, is refused, never guessed.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

// The logic lives in the app (src/rigbuild/rigLooksFrom.js), so the cards and scenes pages'
// "load looks from a rig file" button runs the same code as this script. Re-exported: the
// script's own names stay importable from here.
import { groupKeys, rigLooksFrom, rigLooksOp } from '../../src/rigbuild/rigLooksFrom.js'
import { MOUNT_POSITION } from '../../src/rigbuild/mountPosition.js'
export { MOUNT_POSITION, groupKeys, rigLooksFrom, rigLooksOp }

const readTokenFile = (file) => {
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

const main = async () => {
    const file = path.resolve(String(args.rig || die('needs --rig <rig file>')))
    const looks = rigLooksFrom(readJson(file), file)
    for (const l of looks.looks) say(`  ${l.id.padEnd(16)} ${Object.keys(l.aims).length} groups aimed · ${l.title}`)
    if (!args.api) return
    const api = String(args.api).replace(/\/+$/, '')
    const projectId = String(args.project || die('needs --project <id> with --api'))
    const token = readTokenFile(path.resolve(String(args['token-file'] || die('needs --token-file'))))
    if (!token) die('no ADMIN_API_TOKEN in the token file')
    const client = makeClient(api, token)
    const got = await client.get(`/api/projects/${projectId}/document`)
    if (!got.ok) die(`reading ${projectId}: ${got.status}`)
    const op = rigLooksOp(got.body.document?.entities, looks)
    const out = await client.post(`/api/projects/${projectId}/ops`, { baseVersion: got.body.version, ops: [{ ...op, opId: `looks-${Date.now()}`, clientId: 'looks' }] })
    if (!out.ok) die(`ops: ${out.status} ${out.text.slice(0, 300)}`)
    say(`${projectId}: ${looks.looks.length} looks written; the project is at version ${out.body.newVersion}`)
}

const args = parseArgs()
if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}
