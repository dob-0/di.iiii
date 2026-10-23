#!/usr/bin/env node
// Refresh ONE tab of a combined page (combine-pages.mjs) from its file in the repo, without undoing the combine: the tab's
// page goes through the same steps as in combine-pages (assets named relatively, the spec's relinks); the other tabs and
// the frame stay byte for byte. The tab's assets must already be the project's (they are, once combined).
// Dry run unless --apply; --apply writes a backup of the target's document first. Undo: PUT the backup's document back
// (--undo BACKUP --apply).
//   node scripts/space/refresh-combined-tab.mjs --api URL --spec SPEC.json --tab N [--apply] [--backup FILE]
//   node scripts/space/refresh-combined-tab.mjs --api URL --undo BACKUP.json [--apply]
import fs from 'node:fs'
import path from 'node:path'
import { isCombined, relinkHtml, repointAssets, userAgent } from './pages-lib.mjs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const apply = args.includes('--apply'), api = (flag('--api') || '').replace(/\/$/, '')
if (!api) { console.error('--api URL is required'); process.exit(2) }
const headers = { 'user-agent': userAgent('di-refresh-combined-tab'), 'content-type': 'application/json', ...(process.env.DI_TOKEN ? { authorization: `Bearer ${process.env.DI_TOKEN}` } : {}) }
const call = async (m, p, b) => { const r = await fetch(api + p, { method: m, headers, body: b && JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p}: ${r.status} ${t.slice(0, 160)}`); return JSON.parse(t) }
const RE = /const PAGES=(\[[\s\S]*?\]),ALLOW=/

if (flag('--undo')) {
  const b = JSON.parse(fs.readFileSync(flag('--undo'), 'utf8')); const id = b.document.projectMeta?.id || flag('--into')
  if (!id) { console.error('the backup names no project; add --into ID'); process.exit(2) }
  console.log(`${apply ? 'restore' : 'would restore'} ${id} from ${flag('--undo')}`)
  if (apply) await call('PUT', `/api/projects/${id}/document`, b.document)
  process.exit(0)
}
const specFile = flag('--spec'), n = Number(flag('--tab'))
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8')); const tab = spec.tabs?.[n]
if (!tab?.file) { console.error(`tab ${n} of ${specFile} is not a file tab`); process.exit(2) }
const into = spec.into, from = tab.assetsOf || into
const got = await call('GET', `/api/projects/${into}/document`); const doc = got.document; const html = doc.presentationState?.codeHtml
if (!isCombined(html)) { console.error(`${into} is not a combined page`); process.exit(1) }
const m = html.match(RE); const pages = JSON.parse(m[1])
let page = repointAssets(fs.readFileSync(path.resolve(path.dirname(specFile), tab.file), 'utf8'), from, into).html
for (const [old, next] of Object.entries(spec.relink || {})) page = relinkHtml(page, old, next).html
if (pages[n] === page) { console.log(`tab ${n} is already the file`); process.exit(0) }
pages[n] = page
const json = JSON.stringify(pages).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16))
const next = html.replace(RE, () => `const PAGES=${json},ALLOW=`)
console.log(`tab ${n} (${tab.file}): ${pages[n].length} chars; page ${html.length} -> ${next.length}`)
if (!apply) process.exit(0)
const backup = flag('--backup') || `${into}-before-refresh-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`
fs.writeFileSync(backup, JSON.stringify(got)); console.log('backup', backup)
doc.presentationState = { ...doc.presentationState, codeHtml: next }
await call('PUT', `/api/projects/${into}/document`, doc)
const back = (await call('GET', `/api/projects/${into}/document`)).document.presentationState.codeHtml
if (back !== next) { console.error(`READ-BACK FAILED; undo: --undo ${backup} --apply`); process.exit(2) }
console.log('ok, read back')
