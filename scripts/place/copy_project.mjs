#!/usr/bin/env node
/**
 * copy_project.mjs - copy one project's WHOLE document (entities, assets, looks, cues, render state) into a NEW project of the
 * same space, on a scratch stack (2026-10-15; for a rig version that starts from the one before it, never edits it).
 *   node scripts/place/copy_project.mjs --api http://127.0.0.1:4337/serverXR --space <space> --from <project> --to <new id> \
 *     --title "<title>" [--token-file <env>] [--backup <dir>] [--apply]
 * Dry run unless --apply. Refuses a host that is not localhost / 127.0.0.1 and a target that exists. Assets are downloaded and
 * uploaded again (same bytes: the id must come back equal). The source is only read. Undo: delete the new project.
 */
import fs from 'node:fs'
import { parseArgs, die, say } from './common.mjs'
import { makeClient, readToken } from './api.mjs'

const args = parseArgs(process.argv.slice(2))
const api = String(args.api || die('needs --api'))
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) die('scratch stacks on localhost only')
const space = String(args.space || die('needs --space')), from = String(args.from || die('needs --from')), to = String(args.to || die('needs --to'))
const client = makeClient(api, args['token-file'] ? readToken(String(args['token-file'])) : null)
const src = await client.get(`/api/projects/${from}/document`)
if (!src.ok) die(`reading ${from}: ${src.status}`)
const doc = src.body.document
if ((await client.get(`/api/projects/${to}`)).ok) die(`${to} exists - not touched`)
say(`${from} @ v${src.body.version}: ${doc.entities.length} entities, ${(doc.assets || []).length} assets -> ${to}` + (args.apply ? '' : ' (dry run; --apply to write)'))
if (!args.apply) process.exit(0)
if (args.backup) { fs.mkdirSync(String(args.backup), { recursive: true }); fs.writeFileSync(`${args.backup}/${from}-copied-from.json`, JSON.stringify(src.body)) }
const made = await client.post(`/api/spaces/${space}/projects`, { title: String(args.title || to), slug: to })
if (!made.ok) die(`creating ${to}: ${made.status} ${made.text.slice(0, 200)}`)
const id = made.body?.project?.id || to
const assets = []
for (const a of doc.assets || []) {
    const got = await client.bytes(`/api/projects/${from}/assets/${a.id}`)
    if (!got.ok) die(`downloading ${a.name}: ${got.status}`)
    const form = new FormData(); form.append('asset', new Blob([got.buffer], { type: a.mimeType }), a.name)
    const up = await client.post(`/api/projects/${id}/assets`, form)
    if (!up.ok) die(`copying ${a.name}: ${up.status} ${up.text.slice(0, 200)}`)
    if (up.body.asset.id !== a.id) die(`${a.name} came back as ${up.body.asset.id}, not ${a.id}`)
    assets.push(up.body.asset); say(`  copied ${a.name} (${a.size} bytes)`)
}
const put = await client.put(`/api/projects/${id}/document`, { ...doc, projectMeta: { ...doc.projectMeta, id, title: String(args.title || to) }, assets })
if (!put.ok) die(`writing ${id}: ${put.status} ${put.text.slice(0, 200)}`)
const back = await client.get(`/api/projects/${id}/document`)
say(`${id}: written, v${back.body.version}, ${back.body.document.entities.length} entities (source ${doc.entities.length})`)
