// @vitest-environment node
// The OSC bridge on real loopback sockets: a plain dgram sender stands for TouchDesigner or
// a console, a plain dgram receiver for the machine an OSC Out talks to.
import dgram from 'node:dgram'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createOscBridge, targetProblem } = require('./oscBridge.js')
const osc = require('./oscProtocol.js')

const cleanups = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

const bridgeFor = (opts = {}) => {
  const bridge = createOscBridge({ lanAllowed: () => false, ...opts })
  cleanups.push(() => bridge.close())
  return bridge
}
// A free UDP port, found by binding 0 and letting go.
const freePort = () => new Promise((resolve) => {
  const s = dgram.createSocket('udp4')
  s.bind(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})
const sendRaw = (buf, port) => new Promise((resolve, reject) => {
  const s = dgram.createSocket('udp4')
  s.send(buf, port, '127.0.0.1', (err) => { s.close(); if (err) reject(err); else resolve() })
})
const until = async (fn, ms = 1000) => {
  const t0 = Date.now()
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('hearing', () => {
  it('binds the loopback, reads a message, a bundle, and filters by pattern', async () => {
    const bridge = bridgeFor()
    const port = await freePort()
    const opened = await bridge.listen(port)
    expect(opened).toMatchObject({ ok: true, bind: '127.0.0.1', port })
    await sendRaw(osc.encodeMessage('/fader/1', [0.5]), port)
    await sendRaw(osc.encodeBundle([osc.encodeMessage('/fader/2', [0.25]), osc.encodeMessage('/cue/go', ['3'])]), port)
    await until(() => bridge.read(port).messages.length === 3)
    const all = bridge.read(port)
    expect(all.messages.map((m) => m.address)).toEqual(['/fader/1', '/fader/2', '/cue/go'])
    expect(all.messages[0]).toMatchObject({ seq: 1, args: [{ type: 'f', value: 0.5 }], from: '127.0.0.1' })
    expect(bridge.read(port, { pattern: '/fader/*' }).messages.map((m) => m.args[0].value)).toEqual([0.5, 0.25])
    expect(bridge.read(port, { since: 2 }).messages.map((m) => m.seq)).toEqual([3])
  })

  it('counts a malformed packet as refused and keeps no made-up message', async () => {
    const bridge = bridgeFor()
    const port = await freePort()
    await bridge.listen(port)
    await sendRaw(Buffer.from('not osc!'), port)
    await until(() => bridge.read(port).refused === 1)
    const r = bridge.read(port)
    expect(r.messages).toEqual([])
    expect(r.lastRefusal.error).toMatch(/OSC/)
  })

  it('keeps the last 4 when keep = 4, and tells a slow reader how many it missed', async () => {
    const bridge = bridgeFor({ keep: 4 })
    const port = await freePort()
    await bridge.listen(port)
    for (let i = 1; i <= 10; i++) await sendRaw(osc.encodeMessage('/n', [{ type: 'i', value: i }]), port)
    await until(() => bridge.read(port).seq === 10)
    const r = bridge.read(port, { since: 2 })
    expect(r.messages.map((m) => m.args[0].value)).toEqual([7, 8, 9, 10])
    expect(r.missed).toBe(4) // messages 3, 4, 5, 6
  })

  it('says, in words, when the port is taken by another program', async () => {
    const holder = dgram.createSocket('udp4')
    const port = await new Promise((r) => holder.bind(0, '127.0.0.1', () => r(holder.address().port)))
    cleanups.push(() => new Promise((r) => holder.close(r)))
    const bridge = bridgeFor()
    const out = await bridge.listen(port)
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/already taken/)
    // forgotten, so a later ask tries again
    expect(bridge.state().listeners).toEqual([])
  })

  it('refuses a port under 1024', async () => {
    expect((await bridgeFor().listen(80)).ok).toBe(false)
  })

  it('closes a listener nobody asked about for idleMs', async () => {
    let t = 0
    const bridge = bridgeFor({ now: () => t, idleMs: 1000 })
    const port = await freePort()
    await bridge.listen(port)
    t = 500; bridge.read(port); bridge.sweep()
    expect(bridge.state().listeners.length).toBe(1)
    t = 1600; bridge.sweep()
    expect(bridge.state().listeners.length).toBe(0)
  })
})

describe('speaking', () => {
  it('sends a message a plain UDP receiver decodes to the same address and values', async () => {
    const rx = dgram.createSocket('udp4')
    const port = await new Promise((r) => rx.bind(0, '127.0.0.1', () => r(rx.address().port)))
    cleanups.push(() => new Promise((r) => rx.close(r)))
    const got = new Promise((r) => rx.once('message', (m) => r(osc.decodePacket(m))))
    const bridge = bridgeFor()
    const out = await bridge.send({ host: '127.0.0.1', port, address: '/composition/master', args: [0.75, 'go', 3], numbers: 'float' })
    expect(out).toMatchObject({ ok: true, to: `127.0.0.1:${port}` })
    const m = await got
    expect(m.address).toBe('/composition/master')
    expect(m.args).toEqual([{ type: 'f', value: 0.75 }, { type: 's', value: 'go' }, { type: 'f', value: 3 }])
    expect(bridge.state().sent.messages).toBe(1)
  })

  it('refuses a public, broadcast or malformed target, and a bad address, before any byte leaves', async () => {
    const bridge = bridgeFor()
    expect((await bridge.send({ host: '8.8.8.8', port: 9000, address: '/x' })).error).toMatch(/private network/)
    expect((await bridge.send({ host: '192.168.1.255', port: 9000, address: '/x' })).error).toMatch(/broadcast/)
    expect((await bridge.send({ host: 'example.com', port: 9000, address: '/x' })).error).toMatch(/IPv4/)
    expect((await bridge.send({ host: '127.0.0.1', port: 0, address: '/x' })).error).toMatch(/port/)
    expect((await bridge.send({ host: '127.0.0.1', port: 9000, address: 'x' })).error).toMatch(/OSC address/)
    expect(bridge.state().sent.messages).toBe(0)
  })

  it('knows the private ranges', () => {
    for (const ok of ['127.0.0.1', 'localhost', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.0.20', '169.254.3.3']) expect(targetProblem(ok)).toBe(null)
    for (const bad of ['172.32.0.1', '11.0.0.1', '224.0.0.1', '300.1.1.1', '']) expect(targetProblem(bad)).not.toBe(null)
  })
})
