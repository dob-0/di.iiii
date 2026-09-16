// @vitest-environment node

import http from 'node:http'
import { createRequire } from 'node:module'
import { describe, it, expect, afterEach } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { createSinks, registerBuiltinCues } = require('./sinks')
const { registerRigEvents } = require('./events')

let server = null

afterEach(() => {
  if (server) {
    server.close()
    server = null
  }
})

function startServer(sinks, guard) {
  const app = express()
  registerRigEvents(app, sinks, guard ? { guard } : {})
  server = http.createServer(app)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

// Reads SSE frames off the wire until `wantAtLeast` have arrived (by event name) or the
// stream ends/times out, then closes the connection. Real HTTP, real body parsing — no
// EventSource in Node here, this is deliberately closer to the wire than a client lib.
function readSse(srv, { wantAtLeast = 1, timeoutMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const port = srv.address().port
    const req = http.get({ host: '127.0.0.1', port, path: '/api/rig/events' }, (res) => {
      const events = []
      let buf = ''
      const finish = () => {
        clearTimeout(timer)
        req.destroy()
        resolve({ status: res.statusCode, headers: res.headers, events })
      }
      const timer = setTimeout(finish, timeoutMs)
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8')
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const eventMatch = raw.match(/^event: (.+)$/m)
          const dataMatch = raw.match(/^data: (.+)$/m)
          if (eventMatch) {
            events.push({ event: eventMatch[1], data: dataMatch ? JSON.parse(dataMatch[1]) : null })
          }
        }
        if (events.length >= wantAtLeast) finish()
      })
      res.on('end', finish)
    })
    req.on('error', reject)
  })
}

describe('GET /api/rig/events', () => {
  it('answers with SSE headers and the current blackout state immediately', async () => {
    const sinks = createSinks()
    // sinks.isBlackout() (the only getter the D interface exposes) is a bare boolean, so
    // the connect-time snapshot can report `on` but not who last asked — 'from' is only
    // known for a live 'blackout' event, not a point-in-time read. See the build report.
    sinks.setBlackout(true, { id: 'm1', name: 'aylmo' })
    const srv = await startServer(sinks, (req, res, next) => next())
    const { status, headers, events } = await readSse(srv, { wantAtLeast: 1 })
    expect(status).toBe(200)
    expect(headers['content-type']).toMatch(/^text\/event-stream/)
    expect(headers['x-accel-buffering']).toBe('no')
    expect(events[0]).toEqual({ event: 'blackout', data: { on: true, from: null } })
  })

  it('applies the injected guard, refusing before the stream opens', async () => {
    const sinks = createSinks()
    const guard = (req, res) => res.status(403).json({ error: 'nope' })
    const srv = await startServer(sinks, guard)
    const { status, events } = await readSse(srv, { wantAtLeast: 1, timeoutMs: 500 })
    expect(status).toBe(403)
    expect(events).toEqual([])
  })

  it('defaults the guard when none is injected (requireLocalRuntime allows loopback)', async () => {
    const sinks = createSinks()
    const srv = await startServer(sinks) // no guard passed
    const { status } = await readSse(srv, { wantAtLeast: 1 })
    expect(status).toBe(200)
  })

  it('streams a blackout change after connect', async () => {
    const sinks = createSinks()
    const srv = await startServer(sinks, (req, res, next) => next())
    const promise = readSse(srv, { wantAtLeast: 2 })
    // Give the request a moment to connect before flipping state.
    await new Promise((resolve) => setTimeout(resolve, 50))
    sinks.setBlackout(true, { id: 'm2', name: 'asuz' })
    const { events } = await promise
    expect(events[0]).toEqual({ event: 'blackout', data: { on: false, from: null } })
    expect(events[1]).toEqual({ event: 'blackout', data: { on: true, from: { id: 'm2', name: 'asuz' } } })
  })

  it('streams reload and show-page from cue events', async () => {
    const sinks = createSinks()
    registerBuiltinCues(sinks)
    const srv = await startServer(sinks, (req, res, next) => next())
    const promise = readSse(srv, { wantAtLeast: 3 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await sinks.runCue({ id: 'c1', name: 'reload', args: {} })
    await sinks.runCue({ id: 'c2', name: 'show-page', args: { url: '/atlas' } })
    const { events } = await promise
    expect(events[1]).toEqual({ event: 'reload', data: {} })
    expect(events[2]).toEqual({ event: 'show-page', data: { url: '/atlas' } })
  })
})
