// @vitest-environment node

import http from 'node:http'
import { readFileSync } from 'node:fs'
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

  // `node=` is caller-supplied on a relay anyone can connect to: evicting the
  // incumbent let a visitor kick the keeper off and publish as it.
  it('rejects a second claim on a live nodeId instead of evicting the holder', async () => {
    const keeper = new WebSocket(`${wsBase}?room=r4&node=keeper`)
    await new Promise((r) => keeper.on('open', r))

    let keeperClose = null
    keeper.on('close', (code) => { keeperClose = code })

    const impostor = new WebSocket(`${wsBase}?room=r4&node=keeper`)
    const impostorClose = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('impostor was not closed')), 3000)
      impostor.on('close', (code) => {
        clearTimeout(t)
        resolve(code)
      })
    })
    expect(impostorClose).toBe(4409)
    expect(keeperClose).toBe(null)
    expect(keeper.readyState).toBe(WebSocket.OPEN)

    // The keeper still owns the id: its own traffic keeps flowing.
    const peer = new WebSocket(`${wsBase}?room=r4&node=peer`)
    await new Promise((r) => peer.on('open', r))
    const evtP = nextMsg(peer, (m) => m.type === 'mesh:event')
    keeper.send(JSON.stringify({ type: 'publish', channel: 'env', payload: { ok: true } }))
    expect((await evtP).from).toBe('keeper')

    keeper.close()
    peer.close()
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

// The hub is only ever reached through the client container's nginx. The VPS
// migration (2026-07-15) rebuilt that config and carried over the socket.io
// upgrade rule but not the mesh one, so nginx stripped the hop-by-hop Upgrade
// headers and the hub answered 404 in production while every test here — which
// talks to the Node server directly — stayed green.
describe('nginx proxies the mesh path as a websocket', () => {
  const conf = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8')
  const meshPath = getMeshPath('/serverXR')

  const meshBlock = conf.match(
    new RegExp(`location\\s+${meshPath}\\b[^{]*\\{([\\s\\S]*?)\\n\\s*\\}`)
  )?.[1]

  it('has a location block for the mesh path', () => {
    expect(meshBlock, `nginx.conf has no "location ${meshPath}" block`).toBeTruthy()
  })

  it('forwards the upgrade handshake', () => {
    expect(meshBlock).toMatch(/proxy_http_version\s+1\.1/)
    expect(meshBlock).toMatch(/proxy_set_header\s+Upgrade\s+\$http_upgrade/)
    expect(meshBlock).toMatch(/proxy_set_header\s+Connection\s+"upgrade"/)
  })

  it('preserves the /serverXR prefix — the hub matches the full path', () => {
    expect(meshBlock).toMatch(new RegExp(`proxy_pass\\s+http://server:4000${meshPath}\\s*;`))
  })
})

describe('the mesh gates reserved node ids without gating visitors', () => {
  const BASE = '/serverXR'
  const SECRET = 'test-mesh-secret'
  let httpServer
  let port
  let wsBase

  const closedWith = (ws) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('socket was never closed')), 3000)
    ws.on('close', (code) => { clearTimeout(t); resolve(code) })
    ws.on('error', () => { /* a 401 upgrade surfaces as an error then a close */ })
  })

  beforeAll(async () => {
    httpServer = http.createServer((req, res) => { res.writeHead(200); res.end('ok') })
    initializeMesh(httpServer, { basePath: BASE, meshRoomSecret: SECRET })
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
    port = httpServer.address().port
    wsBase = `ws://127.0.0.1:${port}${BASE}/mesh`
  })

  afterAll(async () => {
    await new Promise((r) => httpServer.close(r))
  })

  // The point of the asymmetry: br_id_ge's public index.html/field.html embed
  // the relay URL, so visitors must keep connecting with no secret at all --
  // otherwise co-presence dies, or the secret ships in public HTML.
  it('lets an anonymous visitor join with no secret while a secret is configured', async () => {
    const visitor = new WebSocket(`${wsBase}?room=g1&node=visitor-1`)
    await new Promise((r, reject) => {
      visitor.on('open', r)
      visitor.on('error', reject)
    })
    expect(visitor.readyState).toBe(WebSocket.OPEN)
    visitor.close()
    await wait(50)
  })

  it('refuses a keeper-* claim that does not present the secret', async () => {
    const impostor = new WebSocket(`${wsBase}?room=g2&node=keeper-bridge`)
    let opened = false
    impostor.on('open', () => { opened = true })
    await closedWith(impostor)
    expect(opened).toBe(false)
  })

  it('admits a keeper-* claim that presents the secret', async () => {
    const keeper = new WebSocket(`${wsBase}?room=g3&node=keeper-bridge&secret=${SECRET}`)
    await new Promise((r, reject) => {
      keeper.on('open', r)
      keeper.on('error', reject)
    })
    expect(keeper.readyState).toBe(WebSocket.OPEN)
    keeper.close()
    await wait(50)
  })

  it('refuses a keeper-* claim presenting the wrong secret', async () => {
    const impostor = new WebSocket(`${wsBase}?room=g4&node=keeper-bridge&secret=wrong`)
    let opened = false
    impostor.on('open', () => { opened = true })
    await closedWith(impostor)
    expect(opened).toBe(false)
  })

  // Reconnect: the keeper's replacement socket must be able to take the id back
  // from a holder the server still believes is live, or a dropped keeper locks
  // itself out until TCP reaps the old socket.
  it('lets an authenticated keeper reclaim its own live id', async () => {
    const first = new WebSocket(`${wsBase}?room=g5&node=keeper-bridge&secret=${SECRET}`)
    await new Promise((r) => first.on('open', r))
    const firstClose = closedWith(first)

    const second = new WebSocket(`${wsBase}?room=g5&node=keeper-bridge&secret=${SECRET}`)
    await new Promise((r, reject) => {
      second.on('open', r)
      second.on('error', reject)
    })

    expect(await firstClose).toBe(4000)
    expect(second.readyState).toBe(WebSocket.OPEN)
    second.close()
    await wait(50)
  })

  it('still refuses an unauthenticated duplicate of an ordinary live id', async () => {
    const holder = new WebSocket(`${wsBase}?room=g6&node=visitor-9`)
    await new Promise((r) => holder.on('open', r))
    let holderClosed = null
    holder.on('close', (code) => { holderClosed = code })

    const impostor = new WebSocket(`${wsBase}?room=g6&node=visitor-9`)
    expect(await closedWith(impostor)).toBe(4409)
    expect(holderClosed).toBe(null)
    expect(holder.readyState).toBe(WebSocket.OPEN)

    holder.close()
    await wait(50)
  })
})

describe('room history — the room keeps its chat', () => {
  const BASE = '/serverXR'
  let httpServer
  let port
  let wsBase

  const { initDb, closeDb } = require('./db.js')

  beforeAll(async () => {
    initDb(':memory:')
    httpServer = http.createServer((req, res) => { res.writeHead(200); res.end('ok') })
    initializeMesh(httpServer, { basePath: BASE, meshHistoryChannels: 'talk,keeper:say' })
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
    port = httpServer.address().port
    wsBase = `ws://127.0.0.1:${port}${BASE}/mesh`
  })

  afterAll(async () => {
    await new Promise((r) => httpServer.close(r))
    closeDb()
  })

  const open = async (room, node) => {
    const ws = new WebSocket(`${wsBase}?room=${room}&node=${node}`)
    await new Promise((r) => ws.on('open', r))
    return ws
  }

  const collectHistory = async (ws) => {
    const lines = []
    for (;;) {
      const m = await nextMsg(ws, (x) => x.type === 'mesh:history')
      lines.push(...m.lines)
      if (m.done) return lines
    }
  }

  it('persists talk lines and replays them, oldest-first with stable ids, to a later device that asks', async () => {
    const a = await open('field-h1', 'a')
    const b = await open('field-h1', 'b')
    await wait(50)
    a.send(JSON.stringify({ type: 'publish', channel: 'talk', payload: { text: 'first words' } }))
    const liveFirst = await nextMsg(b, (m) => m.type === 'mesh:event' && m.channel === 'talk')
    expect(typeof liveFirst.id).toBe('string')
    b.send(JSON.stringify({ type: 'publish', channel: 'talk', payload: { text: 'an answer' } }))
    await nextMsg(a, (m) => m.type === 'mesh:event' && m.channel === 'talk')
    a.close(); b.close()
    await wait(50)

    // a fresh arrival — different device, empty room — asks and receives the kept chat
    const late = await open('field-h1', 'late')
    late.send(JSON.stringify({ type: 'control', cmd: 'history' }))
    const lines = await collectHistory(late)
    expect(lines.map((l) => l.payload.text)).toEqual(['first words', 'an answer'])
    expect(lines.map((l) => l.from)).toEqual(['a', 'b'])
    // the replayed line IS the live line — same id, so listeners dedupe on identity
    expect(lines[0].id).toBe(liveFirst.id)
    late.close()
    await wait(50)
  })

  it('never persists ephemeral channels, never ids them, and never replays history as mesh:event', async () => {
    const a = await open('field-h2', 'a')
    const b = await open('field-h2', 'b')
    await wait(50)
    a.send(JSON.stringify({ type: 'publish', channel: 'motion', payload: { x: 1, y: 2, z: 3 } }))
    const evt = await nextMsg(b, (m) => m.type === 'mesh:event' && m.channel === 'motion')
    expect(evt.id).toBeUndefined()
    a.close(); b.close()
    await wait(50)

    const late = await open('field-h2', 'late')
    const stray = []
    late.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString())
        if (m.type === 'mesh:event') stray.push(m)
      } catch { /* not json */ }
    })
    late.send(JSON.stringify({ type: 'control', cmd: 'history' }))
    const lines = await collectHistory(late)
    expect(lines).toEqual([])
    expect(stray).toEqual([])
    late.close()
    await wait(50)
  })

  it('keeps the room alive when the history store is gone — a lost line, not a lost room', async () => {
    const a = await open('field-h3', 'a')
    const b = await open('field-h3', 'b')
    await wait(50)
    closeDb()
    const evtP = nextMsg(b, (m) => m.type === 'mesh:event' && m.channel === 'talk')
    a.send(JSON.stringify({ type: 'publish', channel: 'talk', payload: { text: 'still speaking' } }))
    const evt = await evtP
    expect(evt.payload.text).toBe('still speaking')

    a.send(JSON.stringify({ type: 'control', cmd: 'history' }))
    const lines = await collectHistory(a)
    expect(lines).toEqual([])
    initDb(':memory:')
    a.close(); b.close()
    await wait(50)
  })

  it('a hub with history unconfigured answers an empty, done replay — asking is always safe', async () => {
    const bare = http.createServer((req, res) => { res.writeHead(200); res.end('ok') })
    initializeMesh(bare, { basePath: BASE })
    await new Promise((r) => bare.listen(0, '127.0.0.1', r))
    const barePort = bare.address().port
    const ws = new WebSocket(`ws://127.0.0.1:${barePort}${BASE}/mesh?room=r&node=n`)
    await new Promise((r) => ws.on('open', r))
    ws.send(JSON.stringify({ type: 'control', cmd: 'history' }))
    const m = await nextMsg(ws, (x) => x.type === 'mesh:history')
    expect(m.lines).toEqual([])
    expect(m.done).toBe(true)
    ws.close()
    await new Promise((r) => bare.close(r))
  })
})

describe('mesh hub survives frames that parse to a non-object', () => {
  const BASE = '/serverXR'
  let httpServer
  let wsBase

  beforeAll(async () => {
    httpServer = http.createServer((req, res) => { res.writeHead(200); res.end('ok') })
    initializeMesh(httpServer, { basePath: BASE })
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
    wsBase = `ws://127.0.0.1:${httpServer.address().port}${BASE}/mesh`
  })

  afterAll(async () => {
    await new Promise((r) => httpServer.close(r))
  })

  it('drops "null", numbers and arrays and keeps answering pings', async () => {
    const a = new WebSocket(`${wsBase}?room=rn&node=a`)
    await new Promise((r) => a.on('open', r))
    for (const frame of ['null', '1', '[]', '"publish"', 'true']) a.send(frame)
    await wait(30)
    const pongP = nextMsg(a, (m) => m.type === 'control:pong')
    a.send(JSON.stringify({ type: 'control', cmd: 'ping', sentAt: Date.now() }))
    const pong = await pongP
    expect(pong.type).toBe('control:pong')
    a.close()
    await wait(50)
  })
})
