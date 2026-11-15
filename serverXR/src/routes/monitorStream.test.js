// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerMonitorRoutes } = require('./monitorRoutes.js')
const { createReportStore } = require('../monitorHub.js')

let server
afterEach(() => new Promise((resolve) => { if (server) server.close(() => resolve()); else resolve(); server?.closeAllConnections?.() }))

const start = async (hub, deployEnv = 'staging', authState = { authenticated: true, role: 'admin' }) => {
  const app = express()
  app.use((req, _res, next) => { req.authState = authState; next() })
  const router = express.Router()
  registerMonitorRoutes(router, { hub, requireAuth: () => true, deployEnv: () => deployEnv })
  app.use(router)
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  return `http://127.0.0.1:${server.address().port}/api/monitor/stream`
}

async function readEvents(url, wanted, ms = 7000) {
  const controller = new AbortController()
  const res = await fetch(url, { signal: controller.signal })
  const events = []
  let text = ''
  const decoder = new TextDecoder()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    for await (const chunk of res.body) {
      text += decoder.decode(chunk, { stream: true })
      events.splice(0, events.length, ...[...text.matchAll(/event: snapshot\ndata: (.*)\n\n/g)].map((x) => JSON.parse(x[1])))
      if (events.length >= wanted) break
    }
  } catch { /* aborted */ } finally { clearTimeout(timer); controller.abort() }
  return { res, events }
}

describe('GET /api/monitor/stream', () => {
  it('sends a snapshot at once, another only when something changed, with event-stream headers', async () => {
    let n = 0
    const hub = { reports: createReportStore(), asks: {}, getSnapshot: async () => ({ generatedAt: Date.now(), value: n }) }
    const url = await start(hub)
    setTimeout(() => { n = 1 }, 500)
    const { res, events } = await readEvents(url, 2)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
    expect(events.map((e) => e.value)).toEqual([0, 1])
  }, 15000)

  it('does not repeat an unchanged snapshot (generatedAt alone is not a change)', async () => {
    const hub = { reports: createReportStore(), asks: {}, getSnapshot: async () => ({ generatedAt: Date.now(), value: 7 }) }
    const url = await start(hub)
    const { events } = await readEvents(url, 2, 5000)
    expect(events).toHaveLength(1)
  }, 15000)

  it('is 403 for a visitor and 404 on prod', async () => {
    const hub = { reports: createReportStore(), asks: {}, getSnapshot: async () => ({}) }
    expect((await fetch(await start(hub, 'staging', { authenticated: false }))).status).toBe(403)
    await new Promise((r) => server.close(r))
    expect((await fetch(await start(hub, 'production'))).status).toBe(404)
  })

  it('stops its timers when the client goes away', async () => {
    let calls = 0
    const hub = { reports: createReportStore(), asks: {}, getSnapshot: async () => { calls += 1; return { calls: 0 } } }
    const url = await start(hub)
    await readEvents(url, 1)
    const after = calls
    await new Promise((r) => setTimeout(r, 2600))
    expect(calls).toBe(after)
  }, 15000)
})
