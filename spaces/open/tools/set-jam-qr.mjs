// Point the room's QR code at the jam SURFACE, not the editor.
//
// The code hanging in the room encoded https://di-studio.xyz/open_jam — the full
// Studio editor. On the phone that actually scans it that address gives six
// controls and no way through to the rest, which is the exact failure
// `/open_jam/scene` (JamSurface) was written to fix: a place you stand in, where
// what you add lands where you are looking. The code was made before that
// surface existed and nobody went back for it.
//
// usage: node set-jam-qr.mjs <apiBase> <token> [--url=https://…/open_jam/scene] [--apply]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const [base, token] = args
const apply = args.includes('--apply')
const url = (args.find((a) => a.startsWith('--url=')) || '--url=https://di-studio.xyz/open_jam/scene').slice(6)
const H = { Authorization: `Bearer ${token}` }
const J = { ...H, 'Content-Type': 'application/json' }

const get = (p) => fetch(base + p, { headers: J }).then((r) => r.json())
const { project } = await get('/api/projects/open-jam')
const { document: doc } = await get('/api/projects/open-jam/document')
const ents = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
const qr = ents.find((e) => e.name === 'open_jam_qr')
if (!qr) { console.error('no open_jam_qr in the room'); process.exit(1) }

const dir = mkdtempSync(join(tmpdir(), 'jam-qr-'))
const png = join(dir, 'open_jam_qr.png')
// Quiet zone 4 modules, big and black — it is scanned off a screen at an angle,
// in a room, by a phone somebody else is holding.
execFileSync('python3', ['-c', `import segno; segno.make(${JSON.stringify(url)}, error='h').save(${JSON.stringify(png)}, scale=12, border=4)`])
console.log(`${url} → ${png}`)
if (!apply) { console.log('dry run'); process.exit(0) }

const fd = new FormData()
fd.append('asset', new Blob([readFileSync(png)], { type: 'image/png' }), 'open_jam_qr.png')
const up = await fetch(`${base}/api/projects/open-jam/assets`, { method: 'POST', headers: H, body: fd })
const body = await up.json()
const asset = body.asset
if (!up.ok || !asset?.id) { console.error('upload failed', up.status, JSON.stringify(body).slice(0, 160)); process.exit(1) }

const ops = [
  { type: 'upsertAsset', payload: { asset } },
  { type: 'updateComponent', payload: { entityId: qr.id, component: 'media', patch: { assetId: asset.id } } },
]
const old = qr.components?.media?.assetId
if (old && old !== asset.id) ops.push({ type: 'deleteAsset', payload: { assetId: old } })
const r = await fetch(`${base}/api/projects/open-jam/ops`, { method: 'POST', headers: J, body: JSON.stringify({ baseVersion: project.documentVersion, ops }) })
console.log('POST ops ->', r.status, (await r.text()).slice(0, 120))
