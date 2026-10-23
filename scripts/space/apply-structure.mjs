#!/usr/bin/env node
// Apply a space's structure file (shelves, order, titles, who sees what) through the API.
// Nothing is deleted. A backup of every project's title, shelf and visibility is written first,
// and `--undo BACKUP` puts them back (relinked pages: the server's space history keeps each page before the replace). Dry run unless --apply.
//   node scripts/space/apply-structure.mjs STRUCTURE.json --api URL [--apply] [--backup FILE]
//   node scripts/space/apply-structure.mjs --undo BACKUP.json --api URL [--apply]
import fs from 'node:fs'
import { relinkHtml, relinkPortals, userAgent } from './pages-lib.mjs'

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
const relinks = Object.entries(s.relink || {})
if (relinks.length) {
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
    if (!notes.length) continue
    const next = { ...doc, ...(Array.isArray(doc.entities) ? { entities } : {}), presentationState: { ...doc.presentationState, ...(html ? { codeHtml: html } : {}) } }
    await step(`relink ${p.id}: ${notes.join(', ')}`, () => call('PUT', `/api/projects/${p.id}/document`, next))
  }
}
if (s.order) await step('order', () => call('PUT', `/api/spaces/${s.space}/projects/order`, { ids: [...s.order, ...unplaced] }))
if (s.shelves) {
  const cols = (await read(s.space)).collections
  const order = s.shelves.map((x) => cols.find((c) => c.label === x.label)?.id).filter(Boolean)
  if (order.length) await step('shelf order', () => call('PUT', `/api/spaces/${s.space}/collections/order`, { ids: order }))
}
console.log(apply ? 'done' : 'dry run; add --apply')
