// @vitest-environment node

// The /ndi lane as HTTP: who may reach it, what it says when the runtime is absent, and
// the two picture routes. The manager underneath is the real one — only its child is
// fake — so the route contract and the ref-counting are exercised together.
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerNdiRoutes } = require('./ndiRoutes.js')
const { createNdiManager } = require('../ndi/manager.js')
const { createNdiSendManager } = require('../ndi/sendManager.js')

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
})

class FakeChild extends EventEmitter {
  constructor() { super(); this.pid = 4242; this.connected = true; this.sent = [] }
  send(message) { this.sent.push(message); return true }
  kill() { this.connected = false; this.emit('exit', null, 'SIGTERM') }
  opens() { return this.sent.filter((m) => m.type === 'open') }
  frames() { return this.sent.filter((m) => m.type === 'frame') }
}

const envBefore = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL, DI_ALLOW_LAN_DEVICES: process.env.DI_ALLOW_LAN_DEVICES }
const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
  for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})

// `probe` decides whether the lane believes NDI could work at all; `clientIp` fakes a
// request arriving from somewhere other than this machine.
const boot = async ({ probe = () => ({ ok: true }), clientIp = null } = {}) => {
  const children = []
  const senders = []
  const app = express()
  if (clientIp) app.use((req, _res, next) => { Object.defineProperty(req, 'ip', { value: clientIp }); next() })
  const lane = registerNdiRoutes(app, {
    mountPaths: ['/ndi', '/serverXR/ndi'],
    log: () => {},
    createManager: (options) => createNdiManager({
      ...options,
      probe,
      forkChild: () => { const c = new FakeChild(); children.push(c); return c },
      lingerMs: 30,
      idleExitMs: 200,
      killGraceMs: 10
    }),
    createSendManager: (options) => createNdiSendManager({
      ...options,
      probe,
      forkChild: () => { const c = new FakeChild(); senders.push(c); return c },
      idleOutputMs: 200,
      idleExitMs: 200,
      killGraceMs: 10
    })
  })
  const { server, base } = await listen(app)
  cleanups.push(() => new Promise((resolve) => { lane.close(); server.close(resolve) }))
  return { base, lane, children, senders, last: () => children[children.length - 1], lastSender: () => senders[senders.length - 1] }
}

// The child answers as the worker would, as soon as the parent has forked it.
const readyWhenForked = async (ctx, { sources = [] } = {}) => {
  for (let i = 0; i < 100 && !ctx.children.length; i += 1) await new Promise((r) => setTimeout(r, 5))
  const child = ctx.last()
  child.emit('message', { type: 'ready', version: 'NDI SDK TEST 6.3.2.0', path: '/fake/libndi.so.6' })
  child.emit('message', { type: 'sources', sources })
  return child
}

const senderReadyWhenForked = async (ctx) => {
  for (let i = 0; i < 100 && !ctx.senders.length; i += 1) await new Promise((r) => setTimeout(r, 5))
  const child = ctx.lastSender()
  child.emit('message', { type: 'ready', version: 'NDI SDK TEST 6.3.2.0', path: '/fake/libndi.so.6' })
  return child
}

// The smallest thing that is unmistakably a JPEG: SOI, then a marker. The routes only
// look at the first two bytes, and the child that would decode it is fake here.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01, 0x00])
const postFrame = (base, name, body = JPEG) => fetch(`${base}/ndi/out.jpg?name=${encodeURIComponent(name)}`, {
  method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body
})

describe('/ndi — who may reach it', () => {
  it('does not exist on a hosted server', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DI_LOCAL
    const { base } = await boot()
    for (const path of ['/ndi/api/summary', '/ndi/api/sources', '/ndi/api/stats', '/ndi/in.mjpg?name=td']) {
      const res = await fetch(`${base}${path}`)
      expect(res.status, path).toBe(404)
    }
  })

  it('exists on a `di up` install even in production mode', async () => {
    process.env.NODE_ENV = 'production'
    process.env.DI_LOCAL = '1'
    const ctx = await boot()
    const pending = fetch(`${ctx.base}/ndi/api/summary`)
    await readyWhenForked(ctx)
    expect((await pending).status).toBe(200)
  })

  it('refuses a request from another machine by default, and names the flag', async () => {
    delete process.env.NODE_ENV
    delete process.env.DI_ALLOW_LAN_DEVICES
    const { base } = await boot({ clientIp: '192.168.1.40' })
    const res = await fetch(`${base}/ndi/api/summary`)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.detail).toMatch(/DI_ALLOW_LAN_DEVICES=1/)
  })

  it('answers the LAN once that flag is set', async () => {
    delete process.env.NODE_ENV
    process.env.DI_ALLOW_LAN_DEVICES = '1'
    const ctx = await boot({ clientIp: '192.168.1.40' })
    const pending = fetch(`${ctx.base}/ndi/api/summary`)
    await readyWhenForked(ctx)
    expect((await pending).status).toBe(200)
  })

  it('is mounted under the app base path as well as at the root', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const pending = fetch(`${ctx.base}/serverXR/ndi/api/summary`)
    await readyWhenForked(ctx)
    expect((await pending).status).toBe(200)
  })
})

describe('/ndi — what it says with no runtime installed', () => {
  it('answers 200 with available:false and how to fix it, and never forks a child', async () => {
    delete process.env.NODE_ENV
    const { base, children } = await boot({ probe: () => ({ ok: false, reason: 'not-installed', how: 'install libndi, then restart di' }) })
    const res = await fetch(`${base}/ndi/api/summary`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ available: false, version: null, reason: 'not-installed', how: 'install libndi, then restart di' })
    expect(children).toHaveLength(0)
  })

  it('says the same about koffi, which is an optional dependency and may simply be absent', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot({ probe: () => ({ ok: false, reason: 'no-koffi', how: 'run "npm install" in serverXR so the optional koffi package is present, then restart di' }) })
    const body = await (await fetch(`${base}/ndi/api/summary`)).json()
    expect(body).toMatchObject({ available: false, reason: 'no-koffi' })
    expect(body.how).toMatch(/npm install/)

    // The picture routes refuse rather than hang.
    const mjpg = await fetch(`${base}/ndi/in.mjpg?name=td`)
    expect(mjpg.status).toBe(503)
    const still = await fetch(`${base}/ndi/api/still?name=td`)
    expect(still.status).toBe(503)
  })
})

describe('/ndi — the source list and the pictures', () => {
  it('lists what the finder found', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const pending = fetch(`${ctx.base}/ndi/api/sources`)
    await readyWhenForked(ctx, { sources: [{ name: 'AYLMO (td_out_windows)', address: '10.10.10.2:5961' }] })
    const body = await (await pending).json()
    expect(body.sources).toEqual([{ name: 'AYLMO (td_out_windows)', address: '10.10.10.2:5961' }])
  })

  it('serves a still as one JPEG, and asks the child for the name and width given', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const pending = fetch(`${ctx.base}/ndi/api/still?name=td_out&w=640`)
    const child = await readyWhenForked(ctx)
    expect(child.opens()[0]).toMatchObject({ name: 'td_out', maxWidth: 640, bandwidth: 'highest' })
    child.emit('message', { type: 'frame', id: child.opens()[0].id, jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]), width: 640, height: 360, seq: 1 })

    const res = await pending
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])) // a JPEG really starts here
    expect(bytes).toHaveLength(7)
  })

  it('gives up on a still with 504 and says what the receiver is waiting for', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const pending = fetch(`${ctx.base}/ndi/api/still?name=nothing-here`)
    const child = await readyWhenForked(ctx)
    child.emit('message', {
      type: 'state', id: child.opens()[0].id, state: 'waiting',
      detail: 'no NDI source matching "nothing-here" on this network yet'
    })
    const res = await pending
    expect(res.status).toBe(504)
    const body = await res.json()
    expect(body.error).toBe('no picture')
    expect(body.state).toBe('waiting')
    expect(body.detail).toMatch(/no NDI source matching/)
  }, 12000)

  it('streams multipart/x-mixed-replace and writes a part per frame', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const controller = new AbortController()
    const pending = fetch(`${ctx.base}/ndi/in.mjpg?name=td_out`, { signal: controller.signal })
    const child = await readyWhenForked(ctx)
    const res = await pending
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('multipart/x-mixed-replace; boundary=di-ndi-frame')
    expect(res.headers.get('cache-control')).toBe('no-store')

    const id = child.opens()[0].id
    const reader = res.body.getReader()
    child.emit('message', { type: 'frame', id, jpeg: Buffer.from([0xff, 0xd8, 0xaa, 0xbb]), width: 320, height: 180, seq: 1 })
    const { value } = await reader.read()
    const part = Buffer.from(value).toString('latin1')
    expect(part).toContain('--di-ndi-frame')
    expect(part).toContain('Content-Type: image/jpeg')
    expect(part).toContain('Content-Length: 4')

    // Leaving closes the subscription: the receiver is let go after its linger.
    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(child.sent.filter((m) => m.type === 'close')).toHaveLength(1)
  })

  it('reports its receivers and subscribers in stats', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const controller = new AbortController()
    const pending = fetch(`${ctx.base}/ndi/in.mjpg?name=td_out`, { signal: controller.signal })
    await readyWhenForked(ctx)
    await pending
    const stats = await (await fetch(`${ctx.base}/ndi/api/stats`)).json()
    expect(stats.child).toMatchObject({ pid: 4242, ready: true })
    expect(stats.subscribers).toBe(1)
    expect(stats.receivers[0]).toMatchObject({ name: 'td_out', subscribers: 1 })
    controller.abort()
  })
})

describe('/ndi — what it refuses to be asked', () => {
  it('requires a name and bounds its length', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    for (const query of ['', '?name=', '?name=%20%20']) {
      const res = await fetch(`${base}/ndi/api/still${query}`)
      expect(res.status, query).toBe(400)
    }
    const long = await fetch(`${base}/ndi/api/still?name=${'x'.repeat(201)}`)
    expect(long.status).toBe(400)
    expect((await long.json()).detail).toMatch(/longer than 200/)
  })

  it('refuses a name carrying control characters', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const res = await fetch(`${base}/ndi/api/still?name=td%00out`)
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toMatch(/control characters/)
  })

  it('bounds w, fps and bandwidth', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const cases = ['w=0', 'w=8', 'w=4097', 'w=-100', 'w=abc', 'w=1.5', 'fps=0', 'fps=61', 'fps=xyz', 'bw=anything']
    for (const q of cases) {
      const res = await fetch(`${base}/ndi/in.mjpg?name=td&${q}`)
      expect(res.status, q).toBe(400)
    }
  })

  it('answers 404 for an unknown path under the mount, without touching the runtime', async () => {
    delete process.env.NODE_ENV
    const { base, children } = await boot()
    const res = await fetch(`${base}/ndi/api/nonsense`)
    expect(res.status).toBe(404)
    expect(children).toHaveLength(0)
  })
})

describe('the lane object index.js holds', () => {
  it('never builds a manager just for being asked whether it has one', async () => {
    delete process.env.NODE_ENV
    const { lane } = await boot()
    expect(lane.hasManager()).toBe(false)
    lane.close()
    expect(lane.hasManager()).toBe(false)
  })
})

// The lane pointed the other way: a page posts its picture and this machine broadcasts
// it. The send manager underneath is the real one — only its child is fake.
describe('/ndi/out.jpg — a page sending a picture out', () => {
  it('does not exist on a hosted server either', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DI_LOCAL
    const { base } = await boot()
    expect((await postFrame(base, 'wall')).status).toBe(404)
    expect((await fetch(`${base}/ndi/api/outputs`)).status).toBe(404)
  })

  it('takes a frame and names the output it opened', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const pending = postFrame(ctx.base, 'wall')
    const child = await senderReadyWhenForked(ctx)
    const res = await pending
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.name).toBe('wall')
    expect(child.opens().map((m) => m.name)).toContain('wall')
    expect(child.frames()).toHaveLength(1)
    // The bytes reach the child unchanged — a JPEG must not be re-encoded on the way
    // through the parent, which is the whole reason the fork uses advanced serialization.
    expect(Buffer.from(child.frames()[0].jpeg).equals(JPEG)).toBe(true)
  })

  it('refuses a body that is not a JPEG, and says which part is wrong', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const notJpeg = await postFrame(ctx.base, 'wall', Buffer.from('<!doctype html>'))
    expect(notJpeg.status).toBe(400)
    expect((await notJpeg.json()).detail).toMatch(/JPEG/)

    const empty = await postFrame(ctx.base, 'wall', Buffer.alloc(0))
    expect(empty.status).toBe(400)
  })

  it('refuses a missing or impossible name before it forks anything', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    expect((await postFrame(ctx.base, '')).status).toBe(400)
    expect((await postFrame(ctx.base, 'x'.repeat(201))).status).toBe(400)
    expect(ctx.senders).toHaveLength(0)
  })

  it('lists what it is sending, and stops one when asked', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const pending = postFrame(ctx.base, 'wall')
    const child = await senderReadyWhenForked(ctx)
    await pending
    child.emit('message', { type: 'state', id: child.opens()[0].id, state: 'sending', detail: '', viewers: 2 })

    const listed = await (await fetch(`${ctx.base}/ndi/api/outputs`)).json()
    expect(listed.available).toBe(true)
    expect(listed.outputs.map((o) => o.name)).toEqual(['wall'])
    expect(listed.outputs[0].viewers).toBe(2)

    const stopped = await (await fetch(`${ctx.base}/ndi/out.jpg?name=wall`, { method: 'DELETE' })).json()
    expect(stopped.stopped).toBe(true)
    expect(child.sent.some((m) => m.type === 'close')).toBe(true)
  })

  it('answers a stop for something it never sent, without forking to find out', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const res = await fetch(`${ctx.base}/ndi/out.jpg?name=never`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await res.json()).stopped).toBe(false)
    expect(ctx.senders).toHaveLength(0)
  })

  it('reports the send lane in /api/stats only once a page has actually sent', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot()
    const before = await (await fetch(`${ctx.base}/ndi/api/stats`)).json()
    expect(before.out).toBe(null)

    const pending = postFrame(ctx.base, 'wall')
    await senderReadyWhenForked(ctx)
    await pending

    const after = await (await fetch(`${ctx.base}/ndi/api/stats`)).json()
    expect(after.out).not.toBe(null)
    expect(after.out.outputs.map((o) => o.name)).toEqual(['wall'])
  })

  it('says the runtime is missing rather than swallowing the frame', async () => {
    delete process.env.NODE_ENV
    const ctx = await boot({ probe: () => ({ ok: false, reason: 'not-installed', how: 'install libndi, then restart di' }) })
    const res = await postFrame(ctx.base, 'wall')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.reason).toBe('not-installed')
    expect(body.how).toMatch(/libndi/)
    expect(ctx.senders).toHaveLength(0)
  })
})
