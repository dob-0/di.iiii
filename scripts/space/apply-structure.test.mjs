// @vitest-environment node
// apply-structure.mjs `entities`: a media file named by an entity is uploaded once under its sha256 (the asset id),
// registered in the document's assets, and the entity then names it by assetId. A re-run sends nothing. N1259.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { applyEdits } from './fake-ops.test-helper.mjs'

const APPLY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'apply-structure.mjs')
const BYTES = Buffer.from('not really a film, but bytes')
const ID = crypto.createHash('sha256').update(BYTES).digest('hex')

function fakeApi(doc) {
  const log = []; const assets = {}
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks); log.push(`${req.method} ${req.url}`)
      const send = (data) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)) }
      if (req.url === '/api/spaces/s/projects') return send({ projects: [{ id: 'p', title: 'P', visibility: 'public' }] })
      if (req.url === '/api/spaces/s/collections') return send({ collections: [] })
      if (req.url === '/api/spaces/s') { if (req.method === 'PATCH') doc.label = JSON.parse(body.toString()).label; return send({ space: { id: 's', label: doc.label || 'Old' } }) }
      if (req.url === '/api/projects/p/document') return send({ document: doc.d, version: 1 })
      if (req.url === '/api/projects/p/ops' && req.method === 'POST') { doc.d = applyEdits(doc.d, JSON.parse(body.toString()).ops); return send({ ok: true }) }
      if (req.url === '/api/projects/p/assets' && req.method === 'POST') {
        const m = /name="assetId"\r\n\r\n([0-9a-f]{64})/.exec(body.toString('latin1'))
        const stored = doc.storeAs || m[1]
        assets[stored] = true; return send({ ok: true, asset: { id: stored } })
      }
      res.writeHead(404); res.end('{}')
    })
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, log, assets, url: `http://127.0.0.1:${server.address().port}` })))
}

let dir, api, doc
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-structure-'))
  fs.writeFileSync(path.join(dir, 'film.mp4'), BYTES)
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ space: 's', entities: { p: [{ id: 'e-screen', components: { media: { file: 'film.mp4', loop: true } } }] } }))
  doc = { d: { version: 1, entities: [{ id: 'keep' }], presentationState: {} } }
  api = await fakeApi(doc)
})
afterEach(() => { api.server.close(); fs.rmSync(dir, { recursive: true, force: true }) })
const run = () => new Promise((resolve) => execFile(process.execPath, [APPLY, path.join(dir, 's.json'), '--api', api.url, '--apply', '--backup', path.join(dir, 'b.json')], { timeout: 20000, env: { ...process.env, DI_TOKEN: '' } }, (e, stdout, stderr) => resolve({ code: e ? e.code : 0, stdout, stderr })))

describe('entities with a media file', () => {
  it('uploads by sha256 id, turns file into assetId, keeps other entities', async () => {
    const r = await run()
    expect(r.code, r.stderr).toBe(0)
    expect(Object.keys(api.assets)).toEqual([ID])
    const e = doc.d.entities.find((x) => x.id === 'e-screen')
    expect(e.components.media).toEqual({ loop: true, assetId: ID })
    expect(doc.d.assets.map((a) => a.id)).toEqual([ID])
    expect(doc.d.entities.some((x) => x.id === 'keep')).toBe(true)
  })
  it('a re-run uploads nothing and does not write the document again', async () => {
    await run()
    api.log.length = 0
    const r = await run()
    expect(r.code, r.stderr).toBe(0)
    expect(api.log.filter((l) => l.startsWith('POST') || l.startsWith('PUT'))).toEqual([])
  })
})

describe('remove', () => {
  it('takes out only the named entities, and a re-run writes nothing', async () => {
    doc.d.entities.push({ id: 'photo-1' }, { id: 'photo-2' })
    fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ space: 's', remove: { p: ['photo-1', 'photo-2', 'not-there'] } }))
    const r = await run()
    expect(r.code, r.stderr).toBe(0)
    expect(doc.d.entities.map((x) => x.id)).toEqual(['keep'])
    api.log.length = 0
    await run()
    expect(api.log.filter((l) => l.startsWith('PUT') || l.endsWith('/ops'))).toEqual([])
  })
})

describe('an existing entity gains a media file', () => {
  it('keeps the components the structure does not name', async () => {
    doc.d.entities.push({ id: 'door', type: 'portal', components: { reference: { projectId: 'w' }, appearance: { color: '#fff' } } })
    fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ space: 's', entities: { p: [{ id: 'door', components: { media: { file: 'film.mp4', mimeType: 'image/jpeg' }, reference: { invite: true } } }] } }))
    const r = await run()
    expect(r.code, r.stderr).toBe(0)
    const d = doc.d.entities.find((x) => x.id === 'door')
    expect(d.type).toBe('portal')
    expect(d.components.reference).toEqual({ projectId: 'w', invite: true })
    expect(d.components.appearance).toEqual({ color: '#fff' })
    expect(d.components.media.assetId).toBe(ID)
  })
})

describe('an image the server stores under another id (metadata stripped)', () => {
  it('names the stored id, keeps the file hash in the name, and a re-run sends nothing', async () => {
    doc.storeAs = 'b'.repeat(64)
    const r = await run()
    expect(r.code, r.stderr).toBe(0)
    const e = doc.d.entities.find((x) => x.id === 'e-screen')
    expect(e.components.media.assetId).toBe('b'.repeat(64))
    expect(doc.d.assets).toEqual([expect.objectContaining({ id: 'b'.repeat(64), name: `film.${ID.slice(0, 12)}.mp4` })])
    api.log.length = 0
    await run()
    expect(api.log.filter((l) => l.startsWith('POST') || l.startsWith('PUT'))).toEqual([])
  })
})

describe('the space name', () => {
  it('is set when it differs, and a re-run sends nothing', async () => {
    fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ space: 's', label: 'New name' }))
    const r = await run()
    expect(r.code, r.stderr).toBe(0)
    expect(doc.label).toBe('New name')
    api.log.length = 0
    await run()
    expect(api.log.filter((l) => l.startsWith('PATCH'))).toEqual([])
  })
})

