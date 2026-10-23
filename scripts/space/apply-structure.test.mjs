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
      if (req.url === '/api/projects/p/document') { if (req.method === 'PUT') doc.d = JSON.parse(body.toString()); return send({ document: doc.d }) }
      if (req.url === '/api/projects/p/assets' && req.method === 'POST') {
        const m = /name="assetId"\r\n\r\n([0-9a-f]{64})/.exec(body.toString('latin1'))
        assets[m[1]] = true; return send({ ok: true, asset: { id: m[1] } })
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
