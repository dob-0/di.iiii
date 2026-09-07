// @vitest-environment node
//
// GET /api/config carries `listen` — whether a phone in the room could reach
// this server at all, and where. It is read by `di status` / `di where` and is
// the reason the lighting desk's Phone box can tell the truth; the field is
// read-only and the addresses appear only when the bind is not loopback.

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerConfigRoutes } = require('./configRoutes.js')

const envBefore = { HOST: process.env.HOST, NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL }
const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
  for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})

const boot = async (options = {}) => {
  const app = express()
  const router = express.Router()
  registerConfigRoutes(router, {
    requireAdminAlways: (_req, _res, next) => next(),
    configStore: { read: async () => ({ defaultSpaceId: 'main', globalSpaceId: null }) },
    ...options
  })
  app.use(router)
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  cleanups.push(() => new Promise((r) => server.close(r)))
  const base = `http://127.0.0.1:${server.address().port}`
  return (await (await fetch(`${base}/api/config`)).json()).config
}

describe('GET /api/config listen', () => {
  it('repeats what index.js says about the bind, per request', async () => {
    let calls = 0
    const listen = () => { calls += 1; return { lan: true, addresses: ['192.168.1.5'] } }
    const config = await boot({ listen })
    expect(config.listen).toEqual({ lan: true, addresses: ['192.168.1.5'] })
    expect(calls).toBe(1)
    // The existing fields are untouched by the new one.
    expect(config.defaultSpaceId).toBe('main')
    expect(config).toHaveProperty('local')
    expect(config).toHaveProperty('requireAuth')
  })

  it('reads HOST itself when nobody passes a bind — loopback means no phone, no addresses', async () => {
    process.env.HOST = '127.0.0.1'
    process.env.DI_LOCAL = '1'
    const config = await boot()
    expect(config.listen).toEqual({ lan: false, addresses: [] })
  })

  it('never lists addresses for a hosted-style boot, even though it binds every interface', async () => {
    delete process.env.HOST
    delete process.env.DI_LOCAL
    process.env.NODE_ENV = 'production'
    const config = await boot()
    expect(config.listen.lan).toBe(true)
    expect(config.listen.addresses).toEqual([])
  })
})
