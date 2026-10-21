// @vitest-environment node
import dgram from 'node:dgram'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerOscRoutes } = require('./oscRoutes.js')
const osc = require('../osc/oscProtocol.js')

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
})
const envBefore = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL }
const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
  for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})
const boot = async () => {
  const app = express()
  const lane = registerOscRoutes(app, { log: null })
  const { server, base } = await listen(app)
  cleanups.push(() => new Promise((r) => { lane.close(); server.close(r) }))
  return { base, lane }
}
// The page's own origin, as requireOwnPage wants it.
const post = (base, path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) })
const freePort = () => new Promise((resolve) => {
  const s = dgram.createSocket('udp4')
  s.bind(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

describe('/osc on a local runtime', () => {
  it('is dormant until asked', async () => {
    delete process.env.NODE_ENV
    const { base, lane } = await boot()
    expect(lane.hasBridge()).toBe(false)
    const state = await (await fetch(`${base}/osc/api/state`)).json()
    expect(state).toMatchObject({ ok: true, listeners: [] })
    expect(lane.hasBridge()).toBe(true)
  })

  it('in → out round trip through the routes: what /out sends, /in hears', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const port = await freePort()
    const first = await (await post(base, '/osc/api/in', { port })).json()
    expect(first).toMatchObject({ ok: true, listening: true, port, messages: [] })
    const sent = await post(base, '/osc/api/out', { host: '127.0.0.1', port, address: '/layer1/opacity', args: [0.4] })
    expect(sent.status).toBe(200)
    let read
    for (let i = 0; i < 50; i++) {
      read = await (await post(base, '/osc/api/in', { port, pattern: '/layer?/*', since: 0 })).json()
      if (read.messages.length) break
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(read.messages[0]).toMatchObject({ address: '/layer1/opacity', args: [{ type: 'f' }] })
    expect(read.messages[0].args[0].value).toBeCloseTo(0.4, 6)
  })

  it('answers a refused target with 400 and the reason', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const res = await post(base, '/osc/api/out', { host: '1.1.1.1', port: 9000, address: '/x', args: [1] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/private network/)
  })

  it('refuses a POST from another website (requireOwnPage)', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const res = await fetch(`${base}/osc/api/out`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' }, body: JSON.stringify({ host: '127.0.0.1', port: 9000, address: '/x' }) })
    expect(res.status).toBe(403)
  })

  it('is 404 on a hosted tier — the node then says there is no local bridge', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DI_LOCAL
    const { base } = await boot()
    expect((await fetch(`${base}/osc/api/state`)).status).toBe(404)
    expect((await post(base, '/osc/api/in', { port: 9100 })).status).toBe(404)
  })

  it('a real packet from a plain sender reaches the reader', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const port = await freePort()
    await post(base, '/osc/api/in', { port })
    await new Promise((resolve) => {
      const s = dgram.createSocket('udp4')
      s.send(osc.encodeMessage('/go', ['cue 3']), port, '127.0.0.1', () => { s.close(); resolve() })
    })
    let read
    for (let i = 0; i < 50; i++) {
      read = await (await post(base, '/osc/api/in', { port })).json()
      if (read.messages.length) break
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(read.messages[0]).toMatchObject({ address: '/go', args: [{ type: 's', value: 'cue 3' }] })
  })
})
