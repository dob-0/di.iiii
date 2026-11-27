// @vitest-environment node
//
// A look pad press is ONE call: POST api/looks/fire {id, autoplayOff:true} fires the look and turns play-in-order off
// (it used to be a second request, api/cues/autoplay, queued ahead of the fire on the pad's send queue).
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createDesk } = require('./desk.js')

let desk, server, base, dir
const call = async (method, route, body) => {
  const r = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, body: JSON.parse(await r.text()) }
}
const POST = (r, b) => call('POST', r, b || {})
const look = (id) => ({ id, name: id, kind: 'all', fixtures: [], steps: [{ values: { a: { dimmer: 1 } } }] })
const autoplay = async () => (await call('GET', '/api/cues')).body.cues.autoplay

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'press-fire-'))
  desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} })
  server = http.createServer((req, res) => desk.handle(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = 'http://127.0.0.1:' + server.address().port
  await POST('/api/looks', { looks: [look('a'), look('b')] })
})
afterAll(async () => {
  desk.close()
  server.closeAllConnections?.()
  await new Promise((r) => server.close(r))
  fs.rmSync(dir, { recursive: true, force: true })
})

const loadPlaying = () => POST('/api/cues/load', { project: 'p', list: [{ name: 'one', lookId: 'a', hold: 5, fade: 0 }, { name: 'two', lookId: 'b', hold: 5, fade: 0 }], autoplay: true })

describe('pad press: fire + autoplay off in one call', () => {
  it('without the flag a fire leaves play-in-order as it was', async () => {
    await loadPlaying()
    expect(await autoplay()).toBe(true)
    expect((await POST('/api/looks/fire', { id: 'b' })).status).toBe(200)
    expect(await autoplay()).toBe(true)
  })
  it('with autoplayOff the look fires and play-in-order is off, in the same reply', async () => {
    await loadPlaying()
    const r = await POST('/api/looks/fire', { id: 'b', autoplayOff: true })
    expect(r.status).toBe(200)
    expect(r.body.layer.lookId).toBe('b')
    expect(await autoplay()).toBe(false)
  })
  it('with autoplayOff while it is already off it fires and changes nothing else', async () => {
    const r = await POST('/api/looks/fire', { id: 'a', autoplayOff: true })
    expect(r.status).toBe(200)
    expect(await autoplay()).toBe(false)
  })
  it('an unknown look does not turn it off', async () => {
    await loadPlaying()
    const r = await POST('/api/looks/fire', { id: 'nope', autoplayOff: true })
    expect(r.status).toBe(404)
    expect(await autoplay()).toBe(true)
  })
  it('only the literal true counts', async () => {
    await loadPlaying()
    await POST('/api/looks/fire', { id: 'a', autoplayOff: 'yes' })
    expect(await autoplay()).toBe(true)
  })
})
