#!/usr/bin/env node
/**
 * copy_project.mjs - copy one project's WHOLE document (entities, assets, looks, cues, render state) into a NEW project of the
 * same space, on a scratch stack (2026-10-15; for a rig version that starts from the one before it, never edits it).
 *   node scripts/place/copy_project.mjs --api http://127.0.0.1:4337/serverXR --space <space> --from <project> --to <new id> \
 *     --title "<title>" [--token-file <env>] [--backup <dir>] [--apply]
 * Between two stacks (2026-10-15, a version carried to the dev tier): the same id on both sides unless --to.
 *   node scripts/place/copy_project.mjs --from-api <url> --to-api <url> --space <space> --from <project> \
 *     [--from-token-file <env>] [--to-token-file <env>] [--to-token-key <KEY>] [--update] [--remote] [--backup <dir>] [--apply]
 *   The target project is created when missing; an existing one is replaced only with --update (the server keeps its
 *   before-document-replace history; --backup also writes the target's old document). Only the assets the target lacks are sent.
 * Dry run unless --apply. Writes only to localhost / 127.0.0.1 unless --remote. Assets are downloaded and uploaded again (same
 * bytes: the id must come back equal). The source is only read. Undo: delete the new project (or put the --backup copy back).
 */
import fs from 'node:fs'
import { parseArgs, die, say } from './common.mjs'
import { makeClient, readToken } from './api.mjs'

const args = parseArgs(process.argv.slice(2))
const fromApi = String(args['from-api'] || args.api || die('needs --api or --from-api'))
const toApi = String(args['to-api'] || args.api || die('needs --api or --to-api'))
const across = fromApi !== toApi
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${toApi}/`) && !args.remote) die('writes to localhost stacks only; --remote to write to another tier')
const space = String(args.space || die('needs --space')), from = String(args.from || die('needs --from'))
const to = String(args.to || (across ? from : die('needs --to')))
const tokenFile = (key) => args[key] || args['token-file']
const source = makeClient(fromApi, tokenFile('from-token-file') ? readToken(String(tokenFile('from-token-file'))) : null)
const target = across
    ? makeClient(toApi, tokenFile('to-token-file') ? readToken(String(tokenFile('to-token-file')), args['to-token-key'] ? [String(args['to-token-key'])] : undefined) : null)
    : source
const src = await source.get(`/api/projects/${from}/document`)
if (!src.ok) die(`reading ${from}: ${src.status}`)
const doc = src.body.document
const title = String(args.title || (across ? doc.projectMeta?.title : null) || to)
const existing = await target.get(`/api/projects/${to}/document`)
if (existing.ok && !args.update) die(`${to} exists - not touched (--update replaces its document)`)
say(`${from} @ v${src.body.version}: ${doc.entities.length} entities, ${(doc.assets || []).length} assets -> ${to}${across ? ` on ${toApi}` : ''}`
    + (existing.ok ? ` (replaces v${existing.body.version})` : '') + (args.apply ? '' : ' (dry run; --apply to write)'))
if (!args.apply) process.exit(0)
if (args.backup) {
    fs.mkdirSync(String(args.backup), { recursive: true })
    fs.writeFileSync(`${args.backup}/${from}-copied-from.json`, JSON.stringify(src.body))
    if (existing.ok) fs.writeFileSync(`${args.backup}/${to}-replaced-v${existing.body.version}.json`, JSON.stringify(existing.body))
}
let id = to
if (!existing.ok) {
    const made = await target.post(`/api/spaces/${space}/projects`, { title, slug: to })
    if (!made.ok) die(`creating ${to}: ${made.status} ${made.text.slice(0, 200)}`)
    id = made.body?.project?.id || to
}
const assets = []
for (const a of doc.assets || []) {
    const held = (existing.body?.document?.assets || []).find((b) => b.id === a.id)
    if (held && (await target.head(`/api/projects/${id}/assets/${a.id}`))) { assets.push(held); continue }
    const got = await source.bytes(`/api/projects/${from}/assets/${a.id}`)
    if (!got.ok) die(`downloading ${a.name}: ${got.status}`)
    const form = new FormData(); form.append('asset', new Blob([got.buffer], { type: a.mimeType }), a.name)
    const up = await target.post(`/api/projects/${id}/assets`, form)
    if (!up.ok) die(`copying ${a.name}: ${up.status} ${up.text.slice(0, 200)}`)
    if (up.body.asset.id !== a.id) die(`${a.name} came back as ${up.body.asset.id}, not ${a.id}`)
    assets.push(up.body.asset); say(`  copied ${a.name} (${a.size} bytes)`)
}
const put = await target.put(`/api/projects/${id}/document`, { ...doc, projectMeta: { ...doc.projectMeta, id, title }, assets })
if (!put.ok) die(`writing ${id}: ${put.status} ${put.text.slice(0, 200)}`)
const back = await target.get(`/api/projects/${id}/document`)
say(`${id}: written, v${back.body.version}, ${back.body.document.entities.length} entities (source ${doc.entities.length})`)
