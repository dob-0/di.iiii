// Shrink the Open Jam photos for the web and swap the room over to the small copies.
// Phone originals were 1–2.7 MB each (19 MB for the wall); a visitor on staging saw
// one photo and waited. 1280px / q80 JPEG keeps them under ~250 KB at wall scale 1.1.
// Usage: node shrink-photos.mjs <apiBase> <token> [--apply]
//   dry: downloads + shrinks into a temp dir and prints the byte savings
//   --apply: uploads the small copies (content-addressed, new ids) and remaps every
//            image entity through the op log. Idempotent: an already-small photo is skipped.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [base, token, flag] = process.argv.slice(2)
const apply = flag === '--apply'
const MAX_PX = 1280, QUALITY = 80, SMALL_ENOUGH = 300 * 1024
const H = { Authorization: `Bearer ${token}` }
const J = { ...H, 'Content-Type': 'application/json' }
const get = async (p, h = H) => { const r = await fetch(base + p, { headers: h }); if (!r.ok) throw new Error(`${r.status} ${p}`); return r }

const { project } = await (await get('/api/projects/open-jam', J)).json()
const { document: doc } = await (await get('/api/projects/open-jam/document', J)).json()
const ents = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
const dir = mkdtempSync(join(tmpdir(), 'open-jam-shrink-'))
// the visitor page resolves images through the document's own asset table
// (buildAssetMap reads doc.assets), so an uploaded file is invisible until an
// upsertAsset op lists it; the old record goes with deleteAsset.
const table = new Map((Array.isArray(doc.assets) ? doc.assets : Object.values(doc.assets || {})).map((a) => [a.id, a]))
const ops = []
const register = (asset) => { table.set(asset.id, asset); ops.push({ type: 'upsertAsset', payload: { asset } }) }
let before = 0, after = 0
for (const e of ents) {
  if (e.type !== 'image') continue
  const id = e.components?.media?.assetId
  if (!id) continue
  if (!table.has(id)) {
    const meta = await (await get(`/api/projects/open-jam/assets/${id}/meta`, J)).json()
    if (meta.asset) { console.log(`${e.name}: ${id.slice(0, 10)} was not in the asset table, registering`); register(meta.asset) }
  }
  const src = await get(`/api/projects/open-jam/assets/${id}`)
  const bytes = Buffer.from(await src.arrayBuffer())
  if (bytes.length <= SMALL_ENOUGH) { console.log(`${e.name}: ${bytes.length} B, kept`); continue }
  const inPath = join(dir, id), outPath = join(dir, `${id}.jpg`)
  writeFileSync(inPath, bytes)
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', inPath]).toString().trim().split(' ').map(Number)
  if (Math.max(w, h) <= MAX_PX) { console.log(`${e.name}: ${w}x${h}, already small, kept`); continue }
  execFileSync('magick', [inPath, '-auto-orient', '-resize', `${MAX_PX}x${MAX_PX}>`, '-strip', '-quality', String(QUALITY), outPath])
  const small = statSync(outPath).size
  before += bytes.length; after += small
  console.log(`${e.name}: ${bytes.length} → ${small} B`)
  if (!apply) continue
  const fd = new FormData()
  fd.append('asset', new Blob([readFileSync(outPath)], { type: 'image/jpeg' }), `${String(e.name).replace(/\.[a-z0-9]+$/i, '')}.jpg`)
  const up = await fetch(`${base}/api/projects/open-jam/assets`, { method: 'POST', headers: H, body: fd })
  const body = await up.json().catch(() => ({}))
  const newId = body.asset?.id || body.assetId || body.id
  if (!up.ok || !newId) { console.log('  upload failed', up.status, JSON.stringify(body).slice(0, 120)); continue }
  if (newId === id) { console.log('  same bytes, same id, nothing to swap'); continue }
  if (body.asset) register(body.asset)
  ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'media', patch: { assetId: newId } } })
  if (table.has(id)) { table.delete(id); ops.push({ type: 'deleteAsset', payload: { assetId: id } }) }
}
// drop image records nothing points at any more (the big originals after a swap)
const used = new Set(ents.map((e) => e.components?.media?.assetId).filter(Boolean))
const swappedTo = new Set(ops.filter((o) => o.type === 'updateComponent').map((o) => o.payload.patch.assetId))
for (const [id, a] of table) {
  if (used.has(id) || swappedTo.has(id) || !String(a.mimeType || '').startsWith('image/')) continue
  console.log(`unreferenced image record ${String(a.name)} (${a.size} B), dropping`)
  ops.push({ type: 'deleteAsset', payload: { assetId: id } })
}
console.log(`${base} v${project.documentVersion}: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB, ${ops.length} remaps`, apply ? '' : '(dry run)')
if (!apply || !ops.length) process.exit(0)
const r = await fetch(`${base}/api/projects/open-jam/ops`, { method: 'POST', headers: J, body: JSON.stringify({ baseVersion: project.documentVersion, ops }) })
console.log('POST ops ->', r.status, (await r.text()).slice(0, 120))
