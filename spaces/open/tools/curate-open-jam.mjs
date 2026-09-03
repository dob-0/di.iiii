// Curate the Open Jam room: keep the real things (photos, the written texts, the QR),
// remove the default primitives and stray lights people left behind, put lost photos
// back on the floor, and give the room an opening shot that looks at the memories.
// Usage: node curate-open-jam.mjs <apiBase> <token> [--apply]
const [base, token, flag] = process.argv.slice(2)
const apply = flag === '--apply'
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const get = async (p) => { const r = await fetch(base + p, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json() }

const { project } = await get('/api/projects/open-jam')
const { document: doc } = await get('/api/projects/open-jam/document')
const ents = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})

const JUNK_TEXT = (s) => { const t = (s || '').trim(); return !t || t === 'New Text' || /^-+$/.test(t) }
const PRIMS = new Set(['cone', 'cylinder', 'sphere', 'ring', 'torus', 'box', 'plane'])
const textOf = (e) => e.components?.text?.content ?? e.components?.text?.value ?? ''

const keep = [], remove = [], move = []
let ambientKept = false, dirKept = false
const seenImage = new Set()
for (const e of ents) {
  const pos = e.components?.transform?.position || [0, 0, 0]
  const why = (r) => remove.push({ e, r })
  if (e.type === 'image') {
    const key = `${e.name}|${e.components?.media?.assetId}`
    if (seenImage.has(key)) { why('duplicate photo'); continue }
    seenImage.add(key)
    keep.push(e)
    if (pos[1] > 10 || pos[2] > 60) move.push({ e, to: [-14.5, 0.75, 36.5], r: 'lost in the sky' })
    else if (pos[1] < 0) move.push({ e, to: [pos[0], 0.75, pos[2]], r: 'below the floor' })
    continue
  }
  if (e.type === 'text') { if (JUNK_TEXT(textOf(e))) why(`placeholder text ${JSON.stringify(textOf(e)).slice(0, 20)}`); else keep.push(e); continue }
  if (PRIMS.has(e.type)) { why('default primitive'); continue }
  if (e.type === 'portal') { const p = e.components?.portal || e.components?.reference || {}; if (!p.spaceId && !p.projectId) why('portal to nowhere'); else keep.push(e); continue }
  if (e.type === 'ambientLight') { if (ambientKept) why('extra light'); else { ambientKept = true; keep.push(e) } continue }
  if (e.type === 'directionalLight') { if (dirKept) why('extra light'); else { dirKept = true; keep.push(e) } continue }
  if (/Light$/.test(e.type)) { why('extra light'); continue }
  keep.push(e)
}

const ops = []
for (const { e } of remove) ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
for (const { e, to } of move) ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: { position: to } } })
// opening shot: from the +z side, looking down the photo field toward -z
ops.push({ type: 'setPresentationState', payload: { patch: { entryView: 'fixed-camera', fixedCamera: { projection: 'perspective', position: [-7, 3.6, 64], target: [-7, 0.8, 35], fov: 50, zoom: 1, near: 0.1, far: 300, locked: false } } } })

console.log(`Open Jam @ ${base} — documentVersion ${project.documentVersion}, ${ents.length} entities`)
console.log(`KEEP ${keep.length}:`); for (const e of keep) console.log(`  ${e.type.padEnd(16)} ${String(e.name).slice(0, 34)}`)
console.log(`REMOVE ${remove.length}:`); for (const { e, r } of remove) console.log(`  ${e.type.padEnd(16)} ${String(e.name).slice(0, 24).padEnd(24)} ${r}`)
console.log(`MOVE ${move.length}:`); for (const { e, to, r } of move) console.log(`  ${String(e.name).slice(0, 30).padEnd(30)} -> ${to.map(n => n.toFixed(1)).join(',')}  (${r})`)
console.log(`ops: ${ops.length}`)
if (!apply) { console.log('dry run — pass --apply to write'); process.exit(0) }
const r = await fetch(`${base}/api/projects/open-jam/ops`, { method: 'POST', headers: H, body: JSON.stringify({ baseVersion: project.documentVersion, ops }) })
const body = await r.json().catch(() => ({}))
console.log('POST ops ->', r.status, JSON.stringify(body).slice(0, 200))
