#!/usr/bin/env node
// Apply a space's structure file (shelves, order, titles, who sees what) through the API.
// Nothing is deleted except the entities a structure names under `remove` (project -> [entity id]). A backup of every project's title, shelf and visibility is written first,
// and `--undo BACKUP` puts them back (relinked pages: the server's space history keeps each page before the replace). Dry run unless --apply.
//   node scripts/space/apply-structure.mjs STRUCTURE.json --api URL [--apply] [--backup FILE]
//   node scripts/space/apply-structure.mjs --undo BACKUP.json --api URL [--apply]
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { editHtml, extendDoorSet, relinkHtml, relinkPortals, upsertDoors, upsertEntities, userAgent } from './pages-lib.mjs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const apply = args.includes('--apply')
const api = (flag('--api') || '').replace(/\/$/, '')
if (!api) { console.error('--api URL is required (e.g. http://<tree>.diiii.localhost/serverXR)'); process.exit(2) }
const headers = { 'content-type': 'application/json', 'user-agent': userAgent('di-apply-structure') }
if (process.env.DI_TOKEN) headers.authorization = `Bearer ${process.env.DI_TOKEN}`

async function call(method, path, body) {
  const res = await fetch(api + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { throw new Error(`${method} ${path}: ${res.status}, not JSON: ${text.slice(0, 120)}`) }
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.error || text.slice(0, 120)}`)
  return data
}
const step = async (what, fn) => { console.log(`${apply ? 'do ' : 'would'} ${what}`); if (apply) await fn() }

async function read(space) {
  const { projects } = await call('GET', `/api/spaces/${space}/projects`)
  const { collections } = await call('GET', `/api/spaces/${space}/collections`)
  return { projects, collections }
}

// A media file named by an entity (`components.media.file`, a path next to the structure file) is uploaded to its project
// once (content-addressed: the sha256 is the asset id, so a re-run finds it and sends nothing), registered in the
// document's `assets`, and the entity then names it by `assetId`. N1259: the cinema screen of the Dilijan hall.
const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' }
// a structure's components add to an entity's own, one level deep: `reference: { invite: true }` keeps the door's target
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v)
const mergeComponents = (cur = {}, add = {}) => Object.fromEntries([...new Set([...Object.keys(cur), ...Object.keys(add)])]
  .map((k) => [k, isPlain(cur[k]) && isPlain(add[k]) ? { ...cur[k], ...add[k] } : (k in add ? add[k] : cur[k])]))
async function resolveMedia(projectId, doc, entity) {
  const file = entity.components?.media?.file
  if (!file) return entity
  const abs = path.resolve(path.dirname(path.resolve(structureFile)), file)
  const bytes = fs.readFileSync(abs)
  const id = crypto.createHash('sha256').update(bytes).digest('hex')
  // an image's id is not its file's sha256: the server strips its metadata, so the stored bytes (and id) differ;
  // the file's hash is in the asset's name (mushroom.ff062b0cd189.jpg), so a re-run still finds it and sends nothing
  const ext = path.extname(abs)
  const name = `${path.basename(abs, ext)}.${id.slice(0, 12)}${ext}`
  const known = (doc.assets || []).find((a) => a.id === id || a.name === name)
  let asset = known
  if (!asset) {
    asset = { id, name, mimeType: entity.components.media.mimeType || MIME_BY_EXT[path.extname(abs).toLowerCase()] || 'video/mp4', size: bytes.length, createdAt: Date.now(), url: `/serverXR/api/projects/${projectId}/assets/${id}`, source: 'server' }
    await step(`upload ${path.basename(abs)} (${(bytes.length / 1048576).toFixed(1)} MB) to ${projectId}`, async () => {
      const form = new FormData()
      form.append('assetId', id)
      form.append('asset', new Blob([bytes], { type: asset.mimeType }), asset.name)
      const res = await fetch(`${api}/api/projects/${projectId}/assets`, { method: 'POST', body: form, headers: Object.fromEntries(Object.entries(headers).filter(([k]) => k !== 'content-type')) })
      if (!res.ok) throw new Error(`upload: ${res.status} ${(await res.text()).slice(0, 120)}`)
      const out = await res.json().catch(() => ({}))
      const stored = out.asset || out
      if (stored.id && stored.id !== id) Object.assign(asset, { id: stored.id, url: `/serverXR/api/projects/${projectId}/assets/${stored.id}` })
      if (stored.url) asset.url = stored.url
    })
    doc.assets = [...(doc.assets || []).filter((a) => a.id !== asset.id), asset]
  }
  const { file: _f, mimeType: _m, ...media } = entity.components.media
  return { ...entity, components: { ...entity.components, media: { ...media, assetId: asset.id } } }
}

const undo = flag('--undo')
if (undo) {
  const b = JSON.parse(fs.readFileSync(undo, 'utf8'))
  const now = await read(b.space)
  for (const p of b.projects) {
    const cur = now.projects.find((x) => x.id === p.id)
    if (!cur) { console.log(`skip ${p.id}: not in the space now`); continue }
    if (cur.title !== p.title) await step(`title ${p.id} -> ${p.title}`, () => call('PATCH', `/api/projects/${p.id}`, { title: p.title }))
    if (cur.visibility !== p.visibility) await step(`${p.visibility} ${p.id}`, () => call('PATCH', `/api/projects/${p.id}`, { visibility: p.visibility }))
    if ((cur.collectionId || null) !== (p.collectionId || null)) await step(`shelf ${p.id} -> ${p.collectionId || 'none'}`, () => call('PATCH', `/api/projects/${p.id}/shelf`, { collectionId: p.collectionId || null }))
  }
  await step('order as before', () => call('PUT', `/api/spaces/${b.space}/projects/order`, { ids: b.projects.map((p) => p.id) }))
  console.log('Shelves made by the structure stay (empty); delete them in the Studio if wanted.')
  process.exit(0)
}

const structureFile = args.find((a) => a.endsWith('.json') && a !== flag('--backup') && a !== flag('--undo')) || ''
const file = args.find((a) => a.endsWith('.json') && a !== flag('--backup'))
if (!file) { console.error('give a structure .json'); process.exit(2) }
const s = JSON.parse(fs.readFileSync(file, 'utf8'))
const before = await read(s.space)
const ids = new Set(before.projects.map((p) => p.id))
const named = [...(s.order || []), ...Object.keys(s.titles || {}), ...(s.private || []), ...(s.shelves || []).flatMap((x) => x.projects)]
const missing = [...new Set(named)].filter((id) => !ids.has(id))
if (missing.length) { console.error(`not in ${s.space}: ${missing.join(', ')}`); process.exit(1) }
const unplaced = [...ids].filter((id) => !(s.order || []).includes(id))
if (s.order && unplaced.length) console.log(`note: not in the order, kept at the end: ${unplaced.join(', ')}`)

const backup = flag('--backup') || `${s.space}-structure-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`
if (apply) {
  fs.writeFileSync(backup, JSON.stringify({ space: s.space, api, at: new Date().toISOString(), projects: before.projects.map(({ id, title, visibility, collectionId, state }) => ({ id, title, visibility, collectionId: collectionId || null, state })), collections: before.collections }, null, 2))
  console.log(`backup: ${backup}`)
}

// Door first: a private project cannot be the front door, the server refuses it.
for (const shelf of s.shelves || []) {
  let col = before.collections.find((c) => c.label === shelf.label)
  if (!col) await step(`shelf "${shelf.label}"`, async () => { col = (await call('POST', `/api/spaces/${s.space}/collections`, { label: shelf.label })).collection })
  for (const id of shelf.projects) {
    const cur = before.projects.find((p) => p.id === id)
    if (col && cur.collectionId === col.id) continue
    await step(`file ${id} on "${shelf.label}"`, () => call('PATCH', `/api/projects/${id}/shelf`, { collectionId: col.id }))
  }
}
for (const [id, title] of Object.entries(s.titles || {})) {
  if (before.projects.find((p) => p.id === id).title === title) continue
  await step(`title ${id} -> ${title}`, () => call('PATCH', `/api/projects/${id}`, { title }))
}
for (const id of s.private || []) {
  if (before.projects.find((p) => p.id === id).visibility === 'private') continue
  await step(`private ${id}`, () => call('PATCH', `/api/projects/${id}`, { visibility: 'private' }))
}
// Links inside code pages that point at a project this structure hides, repointed (e.g. a back button).
// Every project is read once and written once; the link is repointed in href AND window.open, also inside a combined page.
// Then each page's exact text edits (`edits`) and each scene's doors (`doors`), in the same one read and one write (N1250).
const relinks = Object.entries(s.relink || {})
if (relinks.length || (s.edits || []).length || Object.keys(s.doors || {}).length || Object.keys(s.doorSets || {}).length || Object.keys(s.entities || {}).length || Object.keys(s.remove || {}).length) {
  for (const p of before.projects) {
    const res = await call('GET', `/api/projects/${p.id}/document`); const doc = res.document || res
    let html = doc.presentationState?.codeHtml
    let entities = doc.entities
    const notes = []
    for (const [from, to] of relinks) {
      if (html) { const r = relinkHtml(html, from, to); if (r.count) { notes.push(`${r.count} × ${from} -> ${to}`); html = r.html } }
      // a scene's doors too (N1248): the hall kept a door to a hidden project after every page was repointed
      if (Array.isArray(entities)) { const r = relinkPortals(entities, from, to, s.space); if (r.count) { notes.push(`${r.count} door(s) ${from} -> ${to}`); entities = r.entities } }
    }
    if (html && (s.edits || []).length) { const r = editHtml(html, s.edits, p.id); if (r.count) { notes.push(...r.notes); html = r.html } }
    if (s.doors?.[p.id]) { const r = upsertDoors(Array.isArray(entities) ? entities : [], s.doors[p.id]); if (r.count) { notes.push(...r.notes); entities = r.entities } }
    // each new door's parts, carried on from the scene's own last two sets (doorSets: project -> [{ match, prev, src, next, ... }])
    for (const set of s.doorSets?.[p.id] || []) { const r = upsertEntities(entities, extendDoorSet(entities, set)); if (r.count) { notes.push(`${r.count} part(s) of ${set.doorNext}`); entities = r.entities } }
    // media entities of this project (s.entities: project -> [entity]); the file is uploaded first, then the entity is upserted;
    // an entity that exists keeps the components the structure does not name (a door keeps its reference when it gains a preview)
    if (s.entities?.[p.id]) { const list = []; for (const e of s.entities[p.id]) { const r = await resolveMedia(p.id, doc, e); const cur = (Array.isArray(entities) ? entities : []).find((x) => x?.id === r.id); list.push(cur ? { ...r, components: mergeComponents(cur.components, r.components) } : r) }; const r = upsertEntities(entities, list, 'entity'); if (r.count) { notes.push(...r.notes); entities = r.entities } }
    // entities taken out of this project (s.remove: project -> [entity id]); the server's space history keeps the page before
    if (s.remove?.[p.id] && Array.isArray(entities)) { const gone = new Set(s.remove[p.id]); const kept = entities.filter((e) => !gone.has(e?.id)); if (kept.length < entities.length) { notes.push(`${entities.length - kept.length} entit(ies) removed`); entities = kept } }
    if (!notes.length) continue
    const next = { ...doc, ...(doc.assets ? { assets: doc.assets } : {}), ...(Array.isArray(entities) ? { entities } : {}), presentationState: { ...doc.presentationState, ...(html ? { codeHtml: html } : {}) } }
    await step(`page ${p.id}: ${notes.join(', ')}`, () => call('PUT', `/api/projects/${p.id}/document`, next))
  }
}
if (s.order) await step('order', () => call('PUT', `/api/spaces/${s.space}/projects/order`, { ids: [...s.order, ...unplaced] }))
if (s.shelves) {
  const cols = (await read(s.space)).collections
  const order = s.shelves.map((x) => cols.find((c) => c.label === x.label)?.id).filter(Boolean)
  if (order.length) await step('shelf order', () => call('PUT', `/api/spaces/${s.space}/collections/order`, { ids: order }))
}
console.log(apply ? 'done' : 'dry run; add --apply')
