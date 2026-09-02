// Compose the Open Jam room from what is inside it.
// Usage: node compose-open-jam.mjs <apiBase> <token> <wall|floor> [--apply]
const [base, token, layout = 'wall', flag] = process.argv.slice(2)
const apply = flag === '--apply'
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const get = async (p) => { const r = await fetch(base + p, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json() }
const PI = Math.PI

const { project } = await get('/api/projects/open-jam')
const { document: doc } = await get('/api/projects/open-jam/document')
const ents = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
const textOf = (e) => e.components?.text?.value ?? e.components?.text?.content ?? ''
const JUNK_TEXT = (s) => { const t = (s || '').trim(); return !t || t === 'New Text' || /^-+$/.test(t) }
const PRIMS = new Set(['cone', 'cylinder', 'sphere', 'ring', 'torus', 'box', 'plane'])

// --- sort what we have
const photos = [], texts = {}, remove = []
let qr = null, ambient = null, sun = null
const seen = new Set()
for (const e of ents) {
  if (e.type === 'image') {
    if (e.name === 'open_jam_qr') { qr = e; continue }
    const key = `${e.name}|${e.components?.media?.assetId}`
    if (seen.has(key)) { remove.push(e); continue }
    seen.add(key); photos.push(e); continue
  }
  if (e.type === 'text') {
    const t = textOf(e).trim()
    if (JUNK_TEXT(t)) { remove.push(e); continue }
    if (t.startsWith('lets make')) texts.headline = e
    else if (t.startsWith('scan')) texts.scan = e
    else if (t.startsWith('1.')) texts.howto = e
    else if (t.startsWith('like we')) texts.like = e
    else texts[`other${Object.keys(texts).length}`] = e
    continue
  }
  if (PRIMS.has(e.type)) { remove.push(e); continue }
  if (e.type === 'portal') { const p = e.components?.portal || e.components?.reference || {}; if (!p.spaceId && !p.projectId) remove.push(e); continue }
  if (e.type === 'ambientLight') { if (ambient) remove.push(e); else ambient = e; continue }
  if (e.type === 'directionalLight') { if (sun) remove.push(e); else sun = e; continue }
  if (/Light$/.test(e.type)) { remove.push(e); continue }
}
photos.sort((a, b) => String(a.name).localeCompare(String(b.name)))

const ops = []
const del = (e) => ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
const tf = (e, position, rotation, scale) => ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: { position, rotation, scale: Array.isArray(scale) ? scale : [scale, scale, scale] } } })
const txt = (e, patch) => ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'text', patch } })
for (const e of remove) del(e)

const STAND = [PI / 2, 0, 0]          // flat plane stood up, facing +z
const FACE_PX = [PI / 2, 0, -PI / 2]  // stood up, then turned to face +x
const FACE_NX = [PI / 2, 0, PI / 2]   // stood up, then turned to face -x
let camera

if (layout === 'wall') {
  // three panels around the visitor: a back wall and two wings, photos at eye height
  const n = photos.length, perPanel = Math.ceil(n / 3)
  const S = 1.1, GAP = 3.4, Y = 1.7
  photos.forEach((e, i) => {
    const panel = Math.floor(i / perPanel), j = i % perPanel
    const count = Math.min(perPanel, n - panel * perPanel)
    const off = (j - (count - 1) / 2) * GAP
    if (panel === 0) tf(e, [off, Y, -9], STAND, S)                 // back wall
    else if (panel === 1) tf(e, [-7.5, Y, -1.5 + off], FACE_PX, S)      // left wing
    else tf(e, [7.5, Y, -1.5 + off], FACE_NX, S)                        // right wing
  })
  if (qr) tf(qr, [-3.2, 1.1, 1.5], STAND, 0.7)
  if (texts.headline) { tf(texts.headline, [0, 3.7, -9], STAND, 0.32); txt(texts.headline, { billboard: false }) }
  if (texts.like) { tf(texts.like, [0, 3.15, -9], STAND, 0.18); txt(texts.like, { billboard: false }) }
  if (texts.scan) { tf(texts.scan, [-3.2, 2.15, 1.5], STAND, 0.16); txt(texts.scan, { billboard: false }) }
  if (texts.howto) { tf(texts.howto, [3.6, 1.6, 1.5], STAND, 0.11); txt(texts.howto, { billboard: false }) }
  camera = { projection: 'perspective', position: [0, 1.8, 10], target: [0, 1.6, -3], fov: 60, zoom: 1, near: 0.1, far: 300, locked: false }
} else {
  // a mosaic on the floor, seen from above: photos as they were left, gathered together
  const cols = 5, S = 0.8, GAP = 3.1
  photos.forEach((e, i) => {
    const c = i % cols, r = Math.floor(i / cols)
    tf(e, [(c - (cols - 1) / 2) * GAP, 0.02 + r * 0.001, (r - 1) * GAP], [0, 0, 0], S)
  })
  if (qr) tf(qr, [-9, 0.02, 0], [0, 0, 0], 0.6)
  if (texts.headline) { tf(texts.headline, [0, 2.4, -5.5], [0, 0, 0], 1.6); txt(texts.headline, { billboard: true }) }
  if (texts.like) { tf(texts.like, [0, 1.8, -5.5], [0, 0, 0], 0.9); txt(texts.like, { billboard: true }) }
  if (texts.scan) { tf(texts.scan, [-8, 1.4, 0], [0, 0, 0], 0.9); txt(texts.scan, { billboard: true }) }
  if (texts.howto) { tf(texts.howto, [8, 1.4, 0], [0, 0, 0], 0.7); txt(texts.howto, { billboard: true }) }
  camera = { projection: 'perspective', position: [0, 11, 11], target: [0, 0, -1], fov: 55, zoom: 1, near: 0.1, far: 300, locked: false }
}
if (ambient) tf(ambient, [0, 4, 0], [0, 0, 0], 1)
if (sun) tf(sun, [3, 9, 16], [0, 0, 0], 1)
ops.push({ type: 'setPresentationState', payload: { patch: { entryView: 'fixed-camera', fixedCamera: camera } } })
ops.push({ type: 'setWorldState', payload: { patch: { spawn: layout === 'wall' ? [0, 0, 6] : [0, 0, 8] } } })

console.log(`Open Jam @ ${base} v${project.documentVersion} — layout ${layout}: ${photos.length} photos, qr ${!!qr}, texts ${Object.keys(texts).join(',')}, remove ${remove.length}, ops ${ops.length}`)
if (!apply) { console.log('dry run'); process.exit(0) }
const r = await fetch(`${base}/api/projects/open-jam/ops`, { method: 'POST', headers: H, body: JSON.stringify({ baseVersion: project.documentVersion, ops }) })
const body = await r.json().catch(() => ({}))
console.log('POST ops ->', r.status, body.newVersion ?? JSON.stringify(body).slice(0, 160))
