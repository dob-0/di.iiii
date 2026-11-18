// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerMonitorRoutes } = require('./monitorRoutes.js')
const { createReportStore } = require('../monitorHub.js')

let server
afterEach(() => new Promise((resolve) => { if (server) server.close(() => resolve()); else resolve(); server?.closeAllConnections?.() }))

const owner = { authenticated: true, role: 'admin', type: 'session', subject: 'owner-1' }
const start = async (hub, deployEnv = 'staging', authState = owner, extra = {}) => {
  const app = express()
  app.use((req, _res, next) => { req.authState = authState; next() })
  const router = express.Router()
  registerMonitorRoutes(router, { hub, requireAuth: () => true, deployEnv: () => deployEnv, ownerIds: () => ['owner-1'], ...extra })
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

  it('is 404 for a visitor, another admin and prod', async () => {
    const hub = { reports: createReportStore(), asks: {}, getSnapshot: async () => ({}) }
    expect((await fetch(await start(hub, 'staging', { authenticated: false }))).status).toBe(404)
    await new Promise((r) => server.close(r))
    expect((await fetch(await start(hub, 'staging', { ...owner, subject: 'admin-2' }))).status).toBe(404)
    await new Promise((r) => server.close(r))
    expect((await fetch(await start(hub, 'production'))).status).toBe(404)
    await new Promise((r) => server.close(r))
    expect((await fetch(await start(hub, 'standby'))).status).toBe(404)
  })

  it('builds the snapshot once per tick for all open streams, and a 5th stream of one subject is 429', async () => {
    let calls = 0
    const hub = { reports: createReportStore(), asks: {}, getSnapshot: async () => { calls += 1; return { value: 1 } } }
    const url = await start(hub)
    const open = []
    for (let i = 0; i < 4; i += 1) {
      const controller = new AbortController()
      const res = await fetch(url, { signal: controller.signal })
      expect(res.status).toBe(200)
      open.push(controller)
    }
    const fifth = await fetch(url)
    expect(fifth.status).toBe(429)
    await new Promise((r) => setTimeout(r, 300))
    expect(calls).toBe(1)
    for (const c of open) c.abort()
  }, 15000)

  it('ends a stream at its session expiry so the client reconnects through the gate', async () => {
    const hub = { reports: createReportStore(), asks: {}, getSnapshot: async () => ({ value: 1 }) }
    const url = await start(hub, 'staging', { ...owner, session: { subject: 'owner-1', expiresAt: Date.now() + 400 } })
    const res = await fetch(url)
    const started = Date.now()
    // the body ends by itself
    for await (const chunk of res.body) void chunk
    expect(Date.now() - started).toBeLessThan(3000)
  }, 15000)

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

describe('refusals look like an unknown route', () => {
  it('GET, stream, ask and report answer exactly what a made-up path answers (status and body)', async () => {
    const hub = { reports: createReportStore(), asks: { add: () => ({ id: 'x' }) }, getSnapshot: async () => ({}) }
    const others = [{ authenticated: false }, { ...owner, subject: 'admin-2' }, { ...owner, session: { subject: 'owner-1', via: 'token' } }]
    for (const state of others) {
      const base = (await start(hub, 'staging', state)).replace('/api/monitor/stream', '')
      const probe = async (method, path) => {
        const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined })
        return { status: res.status, body: await res.text() }
      }
      for (const [method, path] of [['GET', '/api/monitor'], ['GET', '/api/monitor/stream'], ['POST', '/api/monitor/ask'], ['POST', '/api/monitor/report']]) {
        const madeUp = '/api/monitor-nothing-here'
        const unknown = await probe(method, madeUp)
        expect(unknown.status).toBe(404)
        const refused = await probe(method, path)
        // Express's default page names the path it was asked for; nothing else may differ
        expect({ ...refused, body: refused.body.replace(path, madeUp) }, `${method} ${path}`).toEqual(unknown)
      }
      await new Promise((r) => server.close(r))
    }
  })
})

// the stream handler driven by hand: no sockets, fake timers
function fakeStream({ destroyed = false } = {}) {
  const routes = {}
  const router = { get: (path, ...h) => { routes[path] = h }, post: () => {} }
  const getSnapshot = vi.fn(async () => ({ value: 1 }))
  const api = registerMonitorRoutes(router, { hub: { reports: createReportStore(), asks: {}, getSnapshot }, requireAuth: () => true, deployEnv: () => 'staging', ownerIds: () => ['owner-1'] })
  const written = []
  const listeners = {}
  const res = { status: () => res, set: () => res, flushHeaders: () => {}, write: (t) => { written.push(t) }, end: vi.fn(() => { res.writableEnded = true }), writableEnded: false, writableLength: 0 }
  const req = { authState: owner, destroyed, on: (ev, fn) => { listeners[ev] = fn } }
  const open = () => routes['/api/monitor/stream'][1](req, res)
  return { api, written, res, listeners, open, getSnapshot }
}

describe('stream lifecycle', () => {
  it('closeAll() ends every open stream and stops the poller', async () => {
    vi.useFakeTimers()
    try {
      const s = fakeStream()
      s.open()
      await vi.advanceTimersByTimeAsync(10)
      expect(s.res.end).not.toHaveBeenCalled()
      s.api.closeAll()
      expect(s.res.end).toHaveBeenCalledTimes(1)
      const calls = s.getSnapshot.mock.calls.length
      await vi.advanceTimersByTimeAsync(10000)
      expect(s.getSnapshot.mock.calls.length).toBe(calls)
    } finally { vi.useRealTimers() }
  })

  it('a client already gone when the handler runs is never kept (no poller, no 15-minute hold)', async () => {
    vi.useFakeTimers()
    try {
      const s = fakeStream({ destroyed: true })
      s.open()
      await vi.advanceTimersByTimeAsync(10000)
      expect(s.getSnapshot).not.toHaveBeenCalled()
      expect(s.res.end).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it('sends a NAMED heartbeat event carrying {at}', async () => {
    vi.useFakeTimers()
    try {
      const s = fakeStream()
      s.open()
      await vi.advanceTimersByTimeAsync(15000)
      const beat = s.written.find((t) => t.startsWith('event: heartbeat\n'))
      expect(beat).toBeTruthy()
      const data = JSON.parse(beat.match(/data: (.*)\n/)[1])
      expect(Number.isNaN(Date.parse(data.at))).toBe(false)
      s.api.closeAll()
    } finally { vi.useRealTimers() }
  })

  it('every heartbeat carries each panel\'s age in ms (server clock), so the page can say "heard N s ago" per panel', async () => {
    vi.useFakeTimers()
    try {
      const s = fakeStream()
      s.getSnapshot.mockResolvedValue({ generatedAt: 'x', panels: { machines: { ok: true, at: Date.now() - 4000 } }, tiers: { at: Date.now() - 1000 }, chats: { heardSecondsAgo: 7 } })
      s.open()
      await vi.advanceTimersByTimeAsync(2100)
      const beat = s.written.find((t) => t.startsWith('event: heartbeat\n'))
      const data = JSON.parse(beat.match(/data: (.*)\n/)[1])
      expect(data.ages.machines).toBeGreaterThanOrEqual(4000)
      expect(data.ages.tiers).toBeGreaterThanOrEqual(1000)
      expect(data.ages.chats).toBeGreaterThanOrEqual(7000)
      s.api.closeAll()
    } finally { vi.useRealTimers() }
  })
})
