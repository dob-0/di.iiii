// @vitest-environment node

import http from 'node:http'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { Server } = require('socket.io')
const { io: ioClient } = require('socket.io-client')
const WebSocket = require('ws')
const { initializeMesh, getMeshPath } = require('./meshHub.js')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nextMsg = (ws, predicate) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for message')), 3000)
    const onMsg = (raw) => {
      let m
      try {
        m = JSON.parse(raw.toString())
      } catch (e) {
        return
      }
      if (!predicate || predicate(m)) {
        clearTimeout(t)
        ws.off('message', onMsg)
        resolve(m)
      }
    }
    ws.on('message', onMsg)
  })

describe('getMeshPath', () => {
  it('returns /mesh at the root and appends under a base path', () => {
    expect(getMeshPath('')).toBe('/mesh')
    expect(getMeshPath('/')).toBe('/mesh')
    expect(getMeshPath('/serverXR')).toBe('/serverXR/mesh')
    expect(getMeshPath('nested/app/')).toBe('/nested/app/mesh')
  })
})

describe('mesh hub coexists with Socket.IO and speaks the co-presence protocol', () => {
  const BASE = '/serverXR'
  let httpServer
  let sio
  let port
  let wsBase

  beforeAll(async () => {
    httpServer = http.createServer((req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    sio = new Server(httpServer, { path: `${BASE}/socket.io` })
    sio.on('connection', (s) => s.emit('hello', 'hi'))
    initializeMesh(httpServer, { basePath: BASE })
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
    port = httpServer.address().port
    wsBase = `ws://127.0.0.1:${port}${BASE}/mesh`
  })

  afterAll(async () => {
    sio.close()
    await new Promise((r) => httpServer.close(r))
  })

  it('keeps Socket.IO on its native websocket transport at its own path', async () => {
    const transport = await new Promise((resolve, reject) => {
      const c = ioClient(`http://127.0.0.1:${port}`, {
        path: `${BASE}/socket.io`,
        transports: ['websocket'],
        reconnection: false
      })
      const t = setTimeout(() => {
        c.close()
        reject(new Error('socket.io did not connect'))
      }, 3000)
      c.on('hello', () => {
        clearTimeout(t)
        const name = c.io.engine.transport.name
        c.close()
        resolve(name)
      })
      c.on('connect_error', (e) => {
        clearTimeout(t)
        reject(e)
      })
    })
    expect(transport).toBe('websocket')
  })

  it('fans out motion with per-target latency + ghost-hand prediction', async () => {
    const a = new WebSocket(`${wsBase}?room=bridge&node=a`)
    const b = new WebSocket(`${wsBase}?room=bridge&node=b`)
    await Promise.all([
      new Promise((r) => a.on('open', r)),
      new Promise((r) => b.on('open', r))
    ])

    const evtP = nextMsg(b, (m) => m.type === 'mesh:event' && m.channel === 'motion')
    await wait(50)
    a.send(
      JSON.stringify({
        type: 'publish',
        channel: 'motion',
        pingTs: Date.now(),
        payload: { x: 1, y: 2, z: 3, name: 'Ani', p: 0.5 }
      })
    )
    const evt = await evtP
    expect(evt.from).toBe('a')
    expect(evt.payload.x).toBe(1)
    expect(evt.payload.name).toBe('Ani')
    expect(Number.isFinite(evt.meta.perTargetLatency)).toBe(true)
    expect(typeof evt.meta.predicted.x).toBe('number')

    a.close()
    b.close()
    await wait(50)
  })

  it('answers control ping with a pong carrying roundTrip', async () => {
    const a = new WebSocket(`${wsBase}?room=r2&node=a`)
    await new Promise((r) => a.on('open', r))
    const pongP = nextMsg(a, (m) => m.type === 'control:pong')
    a.send(JSON.stringify({ type: 'control', cmd: 'ping', sentAt: Date.now() - 40 }))
    const pong = await pongP
    expect(Number.isFinite(pong.roundTrip)).toBe(true)
    expect(pong.roundTrip).toBeGreaterThanOrEqual(0)
    a.close()
    await wait(50)
  })

  it('notifies peers with peer:leave when a node disconnects', async () => {
    const a = new WebSocket(`${wsBase}?room=r3&node=a`)
    const b = new WebSocket(`${wsBase}?room=r3&node=b`)
    await Promise.all([
      new Promise((r) => a.on('open', r)),
      new Promise((r) => b.on('open', r))
    ])
    const leaveP = nextMsg(a, (m) => m.type === 'peer:leave' && m.nodeId === 'b')
    b.close()
    const leave = await leaveP
    expect(leave.nodeId).toBe('b')
    a.close()
    await wait(50)
  })

  it('does not hijack upgrades on unrelated paths', async () => {
    const stray = new WebSocket(`ws://127.0.0.1:${port}${BASE}/not-the-mesh`)
    const outcome = await new Promise((resolve) => {
      const t = setTimeout(() => resolve('hung'), 1500)
      stray.on('open', () => {
        clearTimeout(t)
        resolve('opened')
      })
      stray.on('error', () => {
        clearTimeout(t)
        resolve('closed')
      })
      stray.on('unexpected-response', () => {
        clearTimeout(t)
        resolve('http')
      })
    })
    expect(outcome).not.toBe('opened')
  })
})
