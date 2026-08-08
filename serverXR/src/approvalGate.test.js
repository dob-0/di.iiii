// @vitest-environment node

// Regression guard for the fail-loud net's wiring. The net was once mounted
// as `router.use('/api', net)`: Express strips the mount prefix, so inside
// the middleware req.path was `/users/42` while every GATED_ROUTES pattern
// expects `^/api/...` — nothing ever matched and the net was inert. A second
// latent bug hid behind the first: the net never evaluated `bodyTest`, so a
// path-only fix would have made every ordinary space PATCH trip the net.
// This file mounts a router exactly the way production does (bare
// `router.use(net)` inside a router mounted at /serverXR — index.js) and
// pins both behaviors.

import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const express = require('express')
const { createGatedRequestNet, GATED_ROUTES } = require('./approvalGate.js')

let server
let base
const seen = []

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  const router = express.Router()
  // Same shape as production: bare mount, after the blanket role gates.
  router.use(createGatedRequestNet(GATED_ROUTES))
  const record = (cleared) => (req, res) => {
    seen.push({ path: req.path, gateRequired: req.gateRequired || null })
    if (cleared) req.gateCleared = true
    res.json({ ok: true })
  }
  router.patch('/api/users/:id', record(true))
  router.patch('/api/spaces/:id', record(false))
  app.use('/serverXR', router)
  server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/serverXR`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

const patch = (path, body) =>
  fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

describe('createGatedRequestNet mounted as in production', () => {
  it('sets gateRequired on a gated route despite the /serverXR mount', async () => {
    seen.length = 0
    const res = await patch('/api/users/42', { role: 'admin' })
    expect(res.status).toBe(200)
    expect(seen).toEqual([{ path: '/api/users/42', gateRequired: 'users.patch' }])
  })

  it('refuses a 2xx on a gated route that never cleared the gate', async () => {
    seen.length = 0
    const res = await patch('/api/spaces/br-id-ge', { isPublic: true })
    expect(res.status).toBe(500)
    expect(seen).toEqual([{ path: '/api/spaces/br-id-ge', gateRequired: 'spaces.patch' }])
    const body = await res.json()
    expect(body.error).toMatch(/approval gate/)
  })

  it('lets a non-sensitive spaces PATCH through without gating', async () => {
    seen.length = 0
    const res = await patch('/api/spaces/br-id-ge', { label: 'renamed' })
    expect(res.status).toBe(200)
    expect(seen).toEqual([{ path: '/api/spaces/br-id-ge', gateRequired: null }])
  })
})
