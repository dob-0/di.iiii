#!/usr/bin/env node
// Combine several code-page projects into ONE project: a tab per page, only the open tab's page loaded
// (one 3D view on the GPU at a time). The other projects are not touched. Each page's own assets are copied into
// the target project (same asset id) and the page now names them relatively, so the combined page keeps working
// if the originals are made private and does not depend on a host that is gone.
// Dry run unless --apply; --apply writes a backup of the target's document first, and the server keeps its own
// space history before the replace. --undo BACKUP puts the target's document back (copied assets stay, harmless).
//   node scripts/space/combine-pages.mjs --api URL --spec SPEC.json [--apply] [--backup FILE]
//   node scripts/space/combine-pages.mjs --api URL --into ID --tab "Label=ID" --tab "Label=ID" [--title "…"]
//        [--start N] [--link "Label=/space/project"] [--relink "/old=/new"] [--assets-from API] [--apply] [--backup FILE]
//   node scripts/space/combine-pages.mjs --api URL --undo BACKUP.json [--apply]
// SPEC.json: { into, title, start, tabs: [{ label, id }], links: [{ label, href }], relink: { "/old": "/new" } }
//   (the Dilijan one: spaces/dilijan/combine-aren.json). Flags override the spec.
// --assets-from: read a page's assets from ANOTHER api when this one does not have them yet (e.g. a scratch stack
//   that holds the originals, while --api is the server being changed). DI_TOKEN is the bearer for --api and goes
//   to the --assets-from host only when it IS --api; another host gets DI_ASSETS_TOKEN, or no token at all.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildCombinedPage, isCombined, relinkHtml, repointAssets, userAgent } from './pages-lib.mjs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const all = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []))
const pair = (s) => { const i = s.lastIndexOf('='); return [s.slice(0, i), s.slice(i + 1)] }
const apply = args.includes('--apply')
const api = (flag('--api') || '').replace(/\/$/, '')
if (!api) { console.error('--api URL is required (e.g. http://<tree>.diiii.localhost/serverXR)'); process.exit(2) }
const assetsApi = (flag('--assets-from') || api).replace(/\/$/, '')
const bearer = (token) => (token ? { authorization: `Bearer ${token}` } : {})
const auth = bearer(process.env.DI_TOKEN)
// A token for one server must not reach another (2026-10-21 review: DI_TOKEN went to the --assets-from host too).
const assetsAuth = process.env.DI_ASSETS_TOKEN ? bearer(process.env.DI_ASSETS_TOKEN) : (assetsApi === api ? auth : {})
const ua = { 'user-agent': userAgent('di-combine-pages') }

async function call(method, route, body) {
  const res = await fetch(api + route, { method, headers: { ...ua, ...auth, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { throw new Error(`${method} ${route}: ${res.status}, not JSON: ${text.slice(0, 120)}`) }
  if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${data.error || text.slice(0, 120)}`)
  return data
}
const getDoc = async (id) => { const d = await call('GET', `/api/projects/${id}/document`); return d.document || d }
const say = (what) => console.log(`${apply ? 'do ' : 'would'} ${what}`)
const hasAsset = async (base, id, hash) => (await fetch(`${base}/api/projects/${id}/assets/${hash}/meta`, { headers: { ...ua, ...auth } })).ok

// Put one asset of `from` into `into` on --api, unless it is already there. Returns the id it has there.
async function ensureAsset(from, into, hash) {
  if (await hasAsset(api, into, hash)) return hash
  say(`copy asset ${hash.slice(0, 12)}… from ${from} into ${into}`)
  if (!apply) return hash
  const res = await fetch(`${assetsApi}/api/projects/${from}/assets/${hash}`, { headers: { ...ua, ...assetsAuth } })
  if (!res.ok) throw new Error(`asset ${hash.slice(0, 12)}… is not on ${assetsApi} for ${from} (${res.status}); restore it there first, or pass --assets-from with a server that has it`)
  const form = new FormData()
  form.append('assetId', hash)
  form.append('asset', new Blob([await res.arrayBuffer()], { type: res.headers.get('content-type') || 'application/octet-stream' }), `${hash}.bin`)
  const up = await fetch(`${api}/api/projects/${into}/assets`, { method: 'POST', headers: { ...ua, ...auth }, body: form })
  if (!up.ok) throw new Error(`copy asset into ${into}: ${up.status} ${(await up.text()).slice(0, 120)}`)
  // The server re-encodes a photo to strip its metadata, so a copy can come back under a NEW id (2026-10-21: the yard's
  // three JPEGs did, and the kept page asked for the old ids: 3 × 404). The page must name the id the server gives.
  const id = (await up.json().catch(() => ({})))?.asset?.id || hash
  if (id !== hash) say(`asset ${hash.slice(0, 12)}… is ${id.slice(0, 12)}… in ${into} (re-encoded by the server)`)
  return id
}

const undo = flag('--undo')
if (undo) {
  const b = JSON.parse(fs.readFileSync(undo, 'utf8'))
  say(`put back the document of ${b.into} (${b.at})`)
  if (apply) await call('PUT', `/api/projects/${b.into}/document`, b.document)
  console.log(apply ? 'done' : 'dry run; add --apply')
  process.exit(0)
}

const spec = flag('--spec') ? JSON.parse(fs.readFileSync(flag('--spec'), 'utf8')) : {}
const into = flag('--into') || spec.into
const tabs = all('--tab').length ? all('--tab').map(pair) : (spec.tabs || []).map((t) => [t.label, t.id])
const links = all('--link').length ? all('--link').map(pair) : (spec.links || []).map((l) => [l.label, l.href])
const relinks = all('--relink').length ? Object.fromEntries(all('--relink').map(pair)) : (spec.relink || {})
const title = flag('--title') || spec.title
const start = flag('--start') !== undefined ? Number(flag('--start')) : (spec.start || 0)
if (!into || tabs.length < 2) { console.error('--into ID and at least two tabs (--tab "Label=ID", or a --spec) are required'); process.exit(2) }

const target = await getDoc(into)
const ps = target.presentationState || {}
if (!ps.codeHtml) { console.error(`${into} is not a code page`); process.exit(1) }
if (isCombined(ps.codeHtml)) { console.error(`${into} is already a combined page; --undo its backup first`); process.exit(1) }

const pages = []
for (const [label, id] of tabs) {
  const doc = id === into ? target : await getDoc(id)
  const source = doc.presentationState?.codeHtml
  if (!source) { console.error(`${id} has no code page`); process.exit(1) }
  const moved = repointAssets(source, id, into)
  let html = moved.html
  for (const hash of moved.hashes) {
    const got = await ensureAsset(id, into, hash)
    if (got !== hash) html = html.split(`/api/projects/${into}/assets/${hash}`).join(`/api/projects/${into}/assets/${got}`)
  }
  for (const [from, to] of Object.entries(relinks)) {
    const r = relinkHtml(html, from, to)
    if (r.count) say(`relink ${id}: ${r.count} × ${from} -> ${to}`)
    html = r.html
  }
  pages.push({ label, id, html })
}

const combined = buildCombinedPage({ title, pages, links, start })
say(`replace ${into}'s page with ${pages.length} tabs (${pages.map((p) => p.label).join(' | ')})${links.length ? ` + ${links.length} link(s)` : ''}, ${Math.round(combined.length / 1024)} kB`)
if (apply) {
  const backup = flag('--backup') || path.join(os.tmpdir(), `${into}-before-combine-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`)
  fs.writeFileSync(backup, JSON.stringify({ into, api, at: new Date().toISOString(), document: target }, null, 2))
  console.log(`backup: ${backup}`)
  await call('PUT', `/api/projects/${into}/document`, { ...target, presentationState: { ...ps, codeHtml: combined } })
}
console.log(apply ? 'done' : 'dry run; add --apply')
