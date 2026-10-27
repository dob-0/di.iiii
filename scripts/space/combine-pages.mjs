#!/usr/bin/env node
// Combine several code pages into ONE project: a tab per page, only the open tab's page loaded
// (one 3D view on the GPU at a time). The other projects are not touched. Each page's own assets are copied into
// the target project (same asset id) and the page now names them relatively, so the combined page keeps working
// if the originals are made private and does not depend on a host that is gone.
// A tab is a project's page (`id`) or a page kept in the repo (`file`): a page written for the combined project
// (e.g. two of its pages made into one view) lives in git, reviewed like code, not only in a database.
// Dry run unless --apply; --apply writes a backup of the target's document first, and the server keeps its own
// space history before the replace. --undo BACKUP puts the target's document back and empties a page --keep-as made, if nobody changed it since (copied assets stay, harmless).
//   node scripts/space/combine-pages.mjs --api URL --spec SPEC.json [--apply] [--backup FILE]
//   node scripts/space/combine-pages.mjs --api URL --into ID --tab "Label=ID" --tab "Label=file:PAGE.html" [--title "…"]
//        [--start N] [--link "Label=/space/project"] [--relink "/old=/new"] [--assets-from API] [--keep-as ID] [--apply] [--backup FILE]
//   node scripts/space/combine-pages.mjs --api URL --undo BACKUP.json [--apply]
// SPEC.json: { into, title, start, keepAs, keepTitle, tabs: [{ label, id, key } | { label, file, assetsOf, key }] (key: the ?tab= name), links: [{ label, href }],
//   relink: { "/old": "/new" } } (the Dilijan one: spaces/dilijan/combine-aren.json). Flags override the spec.
//   `file` is read relative to the spec; `assetsOf` names the project whose assets the file's URLs name (default: into).
// --assets-from: read a page's assets from ANOTHER api when this one does not have them yet (e.g. a scratch stack
//   that holds the originals, while --api is the server being changed). DI_TOKEN is the bearer for --api and goes
//   to the --assets-from host only when it IS --api; another host gets DI_ASSETS_TOKEN, or no token at all.
// --keep-as ID: before the replace, the target's own page becomes project ID in the same space, born private, its assets
//   copied and its links repointed: when the target's page is not one of the tabs, it is kept as a project, not only in a
//   backup. An ID that already holds a page is refused, never overwritten.
import fs from 'node:fs'
import os from 'node:os'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { buildCombinedPage, isCombined, relinkHtml, repointAssets, userAgent, saveDocument } from './pages-lib.mjs'

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
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
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
  if (apply) await saveDocument(call, b.into, b.document)
  if (b.kept) { // a page kept by that run goes empty again (the target holds it again), unless someone changed it since
    const doc = await getDoc(b.kept.id).catch(() => null)
    const html = doc?.presentationState?.codeHtml || ''
    if (html && sha256(html) === b.kept.sha256) {
      say(`empty the page kept as ${b.kept.id} (${b.into} holds it again; the project stays)`)
      if (apply) await saveDocument(call, b.kept.id, { ...doc, presentationState: { ...doc.presentationState, codeHtml: '' } })
    } else if (html) console.log(`left ${b.kept.id} as it is: its page changed since the combine`)
  }
  console.log(apply ? 'done' : 'dry run; add --apply')
  process.exit(0)
}

const specPath = flag('--spec')
const spec = specPath ? JSON.parse(fs.readFileSync(specPath, 'utf8')) : {}
const specDir = specPath ? path.dirname(path.resolve(specPath)) : process.cwd()
const into = flag('--into') || spec.into
const tabOf = (label, src) => (src.startsWith('file:') ? { label, file: path.resolve(src.slice(5)) } : { label, id: src })
const tabs = all('--tab').length ? all('--tab').map(pair).map(([label, src]) => tabOf(label, src))
  : (spec.tabs || []).map((t) => (t.file ? { label: t.label, key: t.key, file: path.resolve(specDir, t.file), assetsOf: t.assetsOf } : { label: t.label, key: t.key, id: t.id }))
const keepAs = flag('--keep-as') || spec.keepAs
const links = all('--link').length ? all('--link').map(pair) : (spec.links || []).map((l) => [l.label, l.href])
const relinks = all('--relink').length ? Object.fromEntries(all('--relink').map(pair)) : (spec.relink || {})
const title = flag('--title') || spec.title
const start = flag('--start') !== undefined ? Number(flag('--start')) : (spec.start || 0)
if (!into || tabs.length < 2) { console.error('--into ID and at least two tabs (--tab "Label=ID", or a --spec) are required'); process.exit(2) }

const target = await getDoc(into)
const ps = target.presentationState || {}
if (!ps.codeHtml) { console.error(`${into} is not a code page`); process.exit(1) }
if (isCombined(ps.codeHtml)) { console.error(`${into} is already a combined page; --undo its backup first`); process.exit(1) }

// A page's assets become `to`'s (copied there on --apply) and its links are repointed.
async function prepare(source, from, to, name) {
  const moved = repointAssets(source, from, to)
  let html = moved.html
  for (const hash of moved.hashes) {
    const id = await ensureAsset(from, to, hash)
    if (id !== hash) html = html.split(`/api/projects/${to}/assets/${hash}`).join(`/api/projects/${to}/assets/${id}`)
  }
  for (const [old, next] of Object.entries(relinks)) {
    const r = relinkHtml(html, old, next)
    if (r.count) say(`relink ${name}: ${r.count} × ${old} -> ${next}`)
    html = r.html
  }
  return html
}

const pages = []
for (const tab of tabs) {
  let source, from
  if (tab.file) {
    if (!fs.existsSync(tab.file)) { console.error(`${tab.file}: no such page`); process.exit(1) }
    source = fs.readFileSync(tab.file, 'utf8'); from = tab.assetsOf || into
  } else {
    const doc = tab.id === into ? target : await getDoc(tab.id)
    source = doc.presentationState?.codeHtml; from = tab.id
  }
  const name = tab.id || path.basename(tab.file)
  if (!source) { console.error(`${name} has no code page`); process.exit(1) }
  pages.push({ label: tab.label, id: name, key: tab.key, html: await prepare(source, from, into, name) })
}

// The target's own page, kept as its own project before it is replaced (see --keep-as above).
async function keepOwnPage() {
  const space = target.projectMeta?.spaceId
  if (!space) { console.error(`${into} names no space; cannot keep its page as ${keepAs}`); process.exit(1) }
  let existing = null
  try { existing = await getDoc(keepAs) } catch (e) { if (!/: 404 /.test(e.message)) throw e }
  if (existing?.presentationState?.codeHtml) { console.error(`${keepAs} already holds a page; --keep-as never overwrites one (pick another id)`); process.exit(1) }
  say(`keep ${into}'s own page as project ${keepAs} in ${space} (private)`)
  if (apply && !existing) await call('POST', `/api/spaces/${space}/projects`, { slug: keepAs, title: spec.keepTitle || target.projectMeta?.title || keepAs, visibility: 'private' })
  const html = await prepare(ps.codeHtml, into, keepAs, `${into} (kept as ${keepAs})`)
  if (!apply) return
  let doc = existing
  for (let i = 0; i < 8 && !doc; i++) { try { doc = await getDoc(keepAs) } catch { await new Promise((r) => setTimeout(r, 800)) } }
  if (!doc) throw new Error(`${keepAs} was made but its document does not answer`)
  const { mode, entryView, codeSourceType, fixedCamera, deviceAccess } = ps
  // Recorded before the write, so a run that stops after it still leaves a backup whose --undo empties the kept page.
  kept = { id: keepAs, sha256: sha256(html) }
  writeBackup()
  await saveDocument(call, keepAs, { ...doc, presentationState: { ...doc.presentationState, mode, entryView, codeSourceType, fixedCamera, deviceAccess, codeUrl: '', codeHtml: html } })
  const back = (await getDoc(keepAs)).presentationState?.codeHtml
  if (back !== html) throw new Error(`${keepAs}: the kept page did not read back; --undo ${backupPath} empties it`)
}
let kept = null
const backupPath = apply ? flag('--backup') || path.join(os.tmpdir(), `${into}-before-combine-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`) : null
const writeBackup = () => fs.writeFileSync(backupPath, JSON.stringify({ into, api, at: new Date().toISOString(), document: target, ...(kept ? { kept } : {}) }, null, 2))
if (keepAs) await keepOwnPage()

const combined = buildCombinedPage({ title, pages, links, start })
say(`replace ${into}'s page with ${pages.length} tabs (${pages.map((p) => p.label).join(' | ')})${links.length ? ` + ${links.length} link(s)` : ''}, ${Math.round(combined.length / 1024)} kB`)
if (apply) {
  writeBackup()
  console.log(`backup: ${backupPath}`)
  await saveDocument(call, into, { ...target, presentationState: { ...ps, codeHtml: combined } })
}
console.log(apply ? 'done' : 'dry run; add --apply')
