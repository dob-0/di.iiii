// @vitest-environment node

// The parent's half of the lane, driven against a FAKE child: ref-counting, the linger,
// the caps, a crash that keeps its subscribers, and close(). No koffi, no NDI runtime —
// CI has neither, and none of this needs one.
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createNdiManager, NdiCapError } = require('./manager.js')

// Stands in for a forked worker.js: it records what the parent sent and can be made to
// answer, to die, and to be killed.
class FakeChild extends EventEmitter {
  constructor(pid) {
    super()
    this.pid = pid
    this.connected = true
    this.sent = []
    this.killed = false
  }

  send(message) { this.sent.push(message); return true }
  kill() { this.killed = true; this.connected = false; this.emit('exit', null, 'SIGTERM') }
  // What the worker says back.
  ready(version = 'NDI SDK TEST 6.3.2.0') { this.emit('message', { type: 'ready', version, path: '/fake/libndi.so.6' }) }
  fatal(reason = 'not-installed', how = 'install libndi, then restart di') { this.emit('message', { type: 'fatal', reason, how }) }
  sources(list) { this.emit('message', { type: 'sources', sources: list }) }
  state(id, state, detail = '', source = null, address = '') { this.emit('message', { type: 'state', id, state, detail, source, address }) }
  frame(id, jpeg = Buffer.from('jpeg-bytes'), seq = 1) { this.emit('message', { type: 'frame', id, jpeg, width: 320, height: 180, seq }) }
  die(signal = 'SIGKILL') { this.connected = false; this.emit('exit', null, signal) }
  opens() { return this.sent.filter((m) => m.type === 'open') }
  closes() { return this.sent.filter((m) => m.type === 'close') }
}

const managers = []
afterEach(() => { while (managers.length) managers.pop().close() })

// Short timings so the real clock can be used — fake timers and a promise-driven
// manager fight each other, and these waits are what the production code actually does.
const build = (overrides = {}) => {
  const children = []
  const manager = createNdiManager({
    forkChild: () => { const c = new FakeChild(1000 + children.length); children.push(c); return c },
    probe: () => ({ ok: true }),
    lingerMs: 40,
    idleExitMs: 120,
    backoffMinMs: 20,
    killGraceMs: 10,
    ...overrides
  })
  managers.push(manager)
  return { manager, children, last: () => children[children.length - 1] }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('the NDI manager and its child', () => {
  // The two-machine defect (2026-09-20): `stats` said `state: "connecting", detail: ""`
  // and nothing else, so nobody could tell WHICH address the runtime had been handed.
  // Both now travel from the child, into stats, and out to every subscriber.
  it('carries the reason and the dialled address from the child into stats', async () => {
    const { manager, last } = build()
    const seen = []
    const sub = manager.subscribe({ name: 'td_out', onState: (s) => seen.push(s) })
    last().ready()
    const id = last().opens()[0].id
    last().state(id, 'connecting', 'no connection to "AYLMO (td_out_windows)" at 192.168.15.53:5961 after 5 s', 'AYLMO (td_out_windows)', '192.168.15.53:5961')
    await wait(10)

    const r = manager.stats().receivers[0]
    expect(r.state).toBe('connecting')
    expect(r.detail).toContain('no connection')
    expect(r.address).toBe('192.168.15.53:5961')
    expect(r.source).toBe('AYLMO (td_out_windows)')
    expect(seen.at(-1).address).toBe('192.168.15.53:5961')
    expect(sub.receiver().address).toBe('192.168.15.53:5961')
    sub.unsubscribe()
  })

  // A still that gives up must hand the route the reason, not just "no picture" — the
  // 504 body is the only place a person standing at the rig ever sees it.
  it('a timed-out still reports the state and the reason the child gave', async () => {
    const { manager, last } = build()
    const pending = manager.still({ name: 'td_out', waitMs: 120 })
    await wait(10)
    const id = last().opens()[0].id
    last().ready()
    last().state(id, 'connecting', 'no connection to "AYLMO (td_out_windows)" at 192.168.15.53:5961 after 5 s', 'AYLMO (td_out_windows)', '192.168.15.53:5961')
    const result = await pending
    expect(result.error).toBe('timeout')
    expect(result.state).toBe('connecting')
    expect(result.detail).toContain('192.168.15.53:5961')
  })

  it('forks nothing until something is actually asked of it', async () => {
    const { manager, children } = build()
    expect(children).toHaveLength(0)
    expect(manager.hasChild()).toBe(false)
    manager.subscribe({ name: 'td', onFrame: () => {} })
    expect(children).toHaveLength(1)
  })

  it('opens ONE receiver for many subscribers to the same picture, and fans frames to all', () => {
    const { manager, last } = build()
    const seenA = []
    const seenB = []
    manager.subscribe({ name: 'td_out', onFrame: (f) => seenA.push(f) })
    manager.subscribe({ name: 'td_out', onFrame: (f) => seenB.push(f) })
    const child = last()
    expect(child.opens()).toHaveLength(1)
    const id = child.opens()[0].id

    child.frame(id)
    expect(seenA).toHaveLength(1)
    expect(seenB).toHaveLength(1)
    expect(seenA[0].jpeg.toString()).toBe('jpeg-bytes')
  })

  it('treats a different width or bandwidth as a different receiver', () => {
    const { manager, last } = build()
    manager.subscribe({ name: 'td', onFrame: () => {} })
    manager.subscribe({ name: 'td', maxWidth: 640, onFrame: () => {} })
    manager.subscribe({ name: 'td', bandwidth: 'lowest', onFrame: () => {} })
    expect(last().opens()).toHaveLength(3)
    // …but the same three asked for again reuse what is open.
    manager.subscribe({ name: 'TD', onFrame: () => {} })
    manager.subscribe({ name: 'td', maxWidth: 640, onFrame: () => {} })
    expect(last().opens()).toHaveLength(3)
  })

  it('lingers 5 s (40 ms here) after the last subscriber leaves, and a return within it costs no reconnect', async () => {
    const { manager, last } = build()
    const first = manager.subscribe({ name: 'td', onFrame: () => {} })
    const child = last()
    expect(child.opens()).toHaveLength(1)

    first.unsubscribe()
    expect(child.closes()).toHaveLength(0) // not at once

    await wait(15)
    const again = manager.subscribe({ name: 'td', onFrame: () => {} }) // back inside the linger
    await wait(60)
    expect(child.closes()).toHaveLength(0) // the linger was cancelled
    expect(child.opens()).toHaveLength(1) // and nothing was re-opened

    again.unsubscribe()
    await wait(70)
    expect(child.closes()).toHaveLength(1)
    expect(child.closes()[0].id).toBe(child.opens()[0].id)
  })

  it('lets the child go after it has been idle, and forks a fresh one when asked again', async () => {
    const { manager, children, last } = build()
    const sub = manager.subscribe({ name: 'td', onFrame: () => {} })
    sub.unsubscribe()
    await wait(60) // past the linger: the receiver closes, the child is now idle
    expect(last().killed).toBe(false)
    await wait(140) // past idleExitMs
    expect(children[0].killed).toBe(true)
    expect(manager.hasChild()).toBe(false)

    manager.subscribe({ name: 'td', onFrame: () => {} })
    expect(children).toHaveLength(2)
  })

  it('caps receivers and viewers, and says which cap was hit', () => {
    const { manager } = build({ maxReceivers: 2, maxSubscribers: 3 })
    manager.subscribe({ name: 'a', onFrame: () => {} })
    manager.subscribe({ name: 'b', onFrame: () => {} })
    expect(() => manager.subscribe({ name: 'c', onFrame: () => {} })).toThrow(NdiCapError)
    try {
      manager.subscribe({ name: 'c', onFrame: () => {} })
    } catch (error) {
      expect(error.code).toBe('cap-receivers')
      expect(error.message).toMatch(/already receives 2/)
    }
    // A third viewer of an ALREADY OPEN picture is allowed; the fourth is not.
    manager.subscribe({ name: 'a', onFrame: () => {} })
    try {
      manager.subscribe({ name: 'a', onFrame: () => {} })
      throw new Error('the subscriber cap did not hold')
    } catch (error) {
      expect(error.code).toBe('cap-subscribers')
    }
  })

  it('survives a child that dies mid-stream: restarts it, re-opens the receiver, keeps the subscriber', async () => {
    const { manager, children, last } = build()
    const seen = []
    const states = []
    manager.subscribe({ name: 'td_out', onFrame: (f) => seen.push(f), onState: (s) => states.push(s.state) })
    const first = last()
    first.ready()
    first.frame(first.opens()[0].id)
    expect(seen).toHaveLength(1)

    first.die('SIGKILL')
    expect(states).toContain('restarting')

    await wait(60) // past the backoff
    expect(children).toHaveLength(2)
    const second = last()
    expect(second).not.toBe(first)
    // The same picture is asked for again, without the subscriber doing anything.
    expect(second.opens()).toHaveLength(1)
    expect(second.opens()[0].name).toBe('td_out')

    second.ready()
    second.frame(second.opens()[0].id)
    expect(seen).toHaveLength(2) // the stream resumed for the SAME subscriber
    expect(manager.stats().restarts).toBe(1)
  })

  it('does not restart a child that died having said the library is not there', async () => {
    const { manager, children, last } = build()
    manager.subscribe({ name: 'td', onFrame: () => {} })
    last().fatal('not-installed', 'install libndi, then restart di')
    last().die(0)
    await wait(60)
    expect(children).toHaveLength(1) // no pointless restart loop against a missing library

    const summary = await manager.summary({ waitMs: 10 })
    expect(summary).toMatchObject({ available: false, reason: 'not-installed', how: 'install libndi, then restart di' })
  })

  it('answers summary and sources from what the child reports', async () => {
    const { manager, last } = build()
    const pending = manager.summary({ waitMs: 200 })
    last().ready('NDI SDK WIN64 6.3.2.0')
    expect(await pending).toMatchObject({ available: true, version: 'NDI SDK WIN64 6.3.2.0', reason: null })

    const list = manager.getSources({ waitMs: 200 })
    last().sources([{ name: 'AYLMO (td_out)', address: '10.0.0.2:5961' }])
    expect(await list).toMatchObject({ available: true, sources: [{ name: 'AYLMO (td_out)', address: '10.0.0.2:5961' }] })
  })

  it('reports no-koffi from the probe alone, without ever forking', async () => {
    const { manager, children } = build({ probe: () => ({ ok: false, reason: 'no-koffi', how: 'run "npm install" in serverXR' }) })
    const summary = await manager.summary({ waitMs: 10 })
    expect(summary).toMatchObject({ available: false, reason: 'no-koffi' })
    expect(children).toHaveLength(0)
  })

  it('hands back a still from the frame that arrives, and times out saying what the receiver is doing', async () => {
    const { manager, last } = build()
    const pending = manager.still({ name: 'td', waitMs: 200 })
    const child = last()
    child.emit('message', { type: 'state', id: child.opens()[0].id, state: 'waiting', detail: 'no NDI source matching "td" on this network yet' })
    child.frame(child.opens()[0].id, Buffer.from('a-picture'))
    const frame = await pending
    expect(frame.jpeg.toString()).toBe('a-picture')

    const nothing = await manager.still({ name: 'absent', waitMs: 40 })
    expect(nothing.error).toBe('timeout')
    expect(nothing.state).toBe('starting')
  })

  it('close() kills the child at once and refuses to fork another', async () => {
    const { manager, children, last } = build()
    manager.subscribe({ name: 'td', onFrame: () => {} })
    const child = last()
    manager.close()
    expect(child.killed).toBe(true)
    expect(manager.hasChild()).toBe(false)
    expect(() => manager.subscribe({ name: 'td', onFrame: () => {} })).toThrow(/shut down/)
    await wait(60)
    expect(children).toHaveLength(1) // the death of the child it killed does not restart it
  })
})

// The AUTOSCAN (2026-09-24, owner: "autoscan ndi mean what there are the ndi signals in
// net now"). One long-lived child with one finder; the parent folds each list into the
// registry and tells its listeners what appeared and what left.
describe('the NDI autoscan', () => {
  const TD = { name: 'AYLMO (td_out_windows)', address: '192.168.15.53:5961' }
  const OBS = { name: 'WIN (OBS)', address: '192.168.15.20:5962' }

  const scanBuild = (overrides = {}) => build({ scanSettleMs: 0, ...overrides })

  it('is off until asked, then forks one child and reports running once a list arrives', async () => {
    const { manager, children, last } = scanBuild()
    expect(manager.scanSnapshot()).toMatchObject({ state: 'off', count: null })
    expect(children).toHaveLength(0)

    const states = []
    manager.onScan((event) => states.push(event.scan.state))
    expect(manager.startScan().state).toBe('starting')
    expect(children).toHaveLength(1)
    last().ready()
    last().sources([TD])
    const snap = manager.scanSnapshot()
    expect(snap).toMatchObject({ state: 'running', count: 1, version: 'NDI SDK TEST 6.3.2.0' })
    expect(snap.sources[0]).toMatchObject({ ...TD, present: true, goneSince: null })
    expect(typeof snap.checkedAt).toBe('number')
    expect(states).toContain('running')
  })

  it('pushes appeared and gone as the finder reports them', async () => {
    const { manager, last } = scanBuild()
    const changes = []
    manager.onScan((event) => { if (event.change) changes.push(event.change) })
    manager.startScan()
    last().ready()
    last().sources([])
    last().sources([TD])
    last().sources([TD, OBS])
    last().sources([OBS])
    expect(changes.map((c) => [c.appeared.map((s) => s.name), c.gone.map((s) => s.name)])).toEqual([
      [[TD.name], []],
      [[OBS.name], []],
      [[], [TD.name]]
    ])
    const gone = manager.scanSnapshot().sources.find((s) => s.name === TD.name)
    expect(gone.present).toBe(false)
    expect(typeof gone.goneSince).toBe('number')
    expect(manager.scanSnapshot().count).toBe(1)
  })

  it('keeps the child alive with nothing to receive — no idle exit while scanning', async () => {
    const { manager, children, last } = scanBuild({ idleExitMs: 30 })
    manager.startScan()
    last().ready()
    await wait(90)
    expect(last().killed).toBe(false)
    expect(manager.hasChild()).toBe(true)
    manager.stopScan()
    await wait(90)
    expect(manager.hasChild()).toBe(false)
    expect(children).toHaveLength(1)
  })

  it('restarts a crashed child with no receivers, says "restarting", and does not call the sources gone', async () => {
    const { manager, children, last } = scanBuild({ scanSettleMs: 60 })
    const changes = []
    manager.onScan((event) => { if (event.change) changes.push(event.change) })
    manager.startScan()
    last().ready()
    last().sources([TD, OBS])
    await wait(80) // past the first finder's settle window
    last().die()
    expect(manager.scanSnapshot()).toMatchObject({ state: 'restarting', count: null })
    await wait(40)
    expect(children).toHaveLength(2)
    // The new finder's first list is short — the SDK says early lists are incomplete.
    last().ready()
    last().sources([OBS])
    expect(changes.flatMap((c) => c.gone)).toEqual([])
    expect(manager.scanSnapshot().count).toBe(2)
    // After the settle window the same short list IS a reading: TD has left.
    await wait(90)
    expect(changes.flatMap((c) => c.gone).map((s) => s.name)).toEqual([TD.name])
  })

  it('with no runtime: never forks, says no-runtime with the how, count null — and re-probes later', async () => {
    let installed = false
    const { manager, children, last } = scanBuild({
      probe: () => (installed ? { ok: true } : { ok: false, reason: 'not-installed', how: 'install libndi, then restart di' }),
      unavailableTtlMs: 40
    })
    const snap = manager.startScan()
    expect(snap).toMatchObject({ state: 'no-runtime', reason: 'not-installed', count: null, sources: [] })
    expect(snap.how).toMatch(/libndi/)
    expect(children).toHaveLength(0)
    installed = true
    await wait(80)
    expect(children).toHaveLength(1)
    last().ready()
    last().sources([TD])
    expect(manager.scanSnapshot()).toMatchObject({ state: 'running', count: 1 })
  })

  it('a runtime that will not load is an error, not "no runtime"', async () => {
    const { manager, last } = scanBuild()
    manager.startScan()
    last().fatal('load-failed', 'install libndi, then restart di')
    expect(manager.scanSnapshot()).toMatchObject({ state: 'error', reason: 'load-failed', count: null })
  })

  it('scan({ waitMs }) waits for the first reading', async () => {
    const { manager, last } = scanBuild()
    const pending = manager.scan({ waitMs: 300 })
    last().ready()
    setTimeout(() => last().sources([TD]), 20)
    expect(await pending).toMatchObject({ state: 'running', count: 1 })
  })

  it('close() stops the scan and its listeners', async () => {
    const { manager, last } = scanBuild()
    let heard = 0
    manager.onScan(() => { heard += 1 })
    manager.startScan()
    last().ready()
    const before = heard
    manager.close()
    expect(manager.isScanning()).toBe(false)
    last().sources([TD])
    expect(heard).toBe(before)
  })
})
