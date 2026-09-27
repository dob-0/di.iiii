// @vitest-environment node
//
// The "this machine only" guards behind a proxy on this machine (vite's dev
// proxy, a front door like Caddy). Real sockets on loopback: every request
// below arrives from 127.0.0.1, exactly as a local proxy's hop does, and the
// X-Forwarded-For it carries is what the proxy would have written.
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { TRUST_PROXY } = require('./proxyTrust')
const { requireDevLocal } = require('./devLocalGuard')
const { requireLocalRuntime } = require('./localRuntimeGuard')

const saved = { ...process.env }
let server, base

beforeAll(async () => {
  const app = express()
  app.set('trust proxy', TRUST_PROXY)
  app.get('/dev', requireDevLocal, (_req, res) => res.json({ ok: true }))
  app.get('/device', requireLocalRuntime, (_req, res) => res.json({ ok: true }))
  app.get('/ip', (req, res) => res.json({ ip: req.ip }))
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => new Promise((resolve) => server.close(resolve)))
afterEach(() => { process.env = { ...saved } })

const get = (path, xff) => fetch(`${base}${path}`, xff ? { headers: { 'x-forwarded-for': xff } } : {})
const ipOf = async (xff) => (await (await get('/ip', xff)).json()).ip

describe('who the client is, behind a proxy on this machine', () => {
  it('a browser on the machine, direct or through the local proxy, is loopback', async () => {
    expect(await ipOf()).toBe('127.0.0.1')
    expect(await ipOf('127.0.0.1')).toBe('127.0.0.1')
  })

  it('a phone through the proxy is the phone', async () => {
    expect(await ipOf('192.168.88.140')).toBe('192.168.88.140')
    // Caddy → dev-router → vite each append their peer: phone, then loopback hops.
    expect(await ipOf('192.168.88.140, 127.0.0.1')).toBe('192.168.88.140')
  })

  it('a phone that forges loopback is still the phone (the proxy appends its real peer)', async () => {
    expect(await ipOf('127.0.0.1, 192.168.88.140')).toBe('192.168.88.140')
    expect(await ipOf('127.0.0.1, 192.168.88.140, 127.0.0.1')).toBe('192.168.88.140')
  })
})

describe('the guards read it', () => {
  it('dev-only routes (agent runs, work status) refuse a phone that came through vite', async () => {
    delete process.env.NODE_ENV
    expect((await get('/dev')).status).toBe(200)
    expect((await get('/dev', '127.0.0.1')).status).toBe(200)
    expect((await get('/dev', '192.168.88.140')).status).toBe(404)
    expect((await get('/dev', '127.0.0.1, 192.168.88.140')).status).toBe(404)
  })

  it('device routes behind a front door fence by DI_ALLOW_LAN_DEVICES again', async () => {
    process.env.NODE_ENV = 'production'
    process.env.DI_LOCAL = '1'
    delete process.env.DI_ALLOW_LAN_DEVICES
    expect((await get('/device')).status).toBe(200)
    expect((await get('/device', '192.168.88.140')).status).toBe(403)
    process.env.DI_ALLOW_LAN_DEVICES = '1'
    expect((await get('/device', '192.168.88.140')).status).toBe(200)
  })
})
