// @vitest-environment node

// The parent's half of the SEND lane, driven against a FAKE child: an output opening on
// its first frame, the per-output idle close, the whole-child idle exit, the caps, a
// crash that re-opens every live output, and close(). No koffi, no NDI runtime — CI has
// neither, and none of this needs one.
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createNdiSendManager, NdiCapError } = require('./sendManager.js')

// Stands in for a forked sendWorker.js: it records what the parent sent (opens, closes,
// frames) and can be made to answer, to die, and to be killed.
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
  state(id, state, detail = '', viewers = 0) { this.emit('message', { type: 'state', id, state, detail, viewers }) }
  stats(outputsById = {}) { this.emit('message', { type: 'stats', pid: this.pid, cpuUserMs: 1, cpuSystemMs: 1, rssMb: 40, outputs: outputsById, at: Date.now() }) }
  die(signal = 'SIGKILL') { this.connected = false; this.emit('exit', null, signal) }
  opens() { return this.sent.filter((m) => m.type === 'open') }
  closes() { return this.sent.filter((m) => m.type === 'close') }
  frames() { return this.sent.filter((m) => m.type === 'frame') }
}

const managers = []
afterEach(() => { while (managers.length) managers.pop().close() })

// Short timings so the real clock can be used — fake timers and a promise-driven
// manager fight each other, and these waits are what the production code actually does.
const build = (overrides = {}) => {
  const children = []
  const manager = createNdiSendManager({
    forkChild: () => { const c = new FakeChild(1000 + children.length); children.push(c); return c },
    probe: () => ({ ok: true }),
    idleOutputMs: 40,
    idleExitMs: 120,
    backoffMinMs: 20,
    killGraceMs: 10,
    ...overrides
  })
  managers.push(manager)
  return { manager, children, last: () => children[children.length - 1] }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const jpeg = (text = 'jpeg-bytes') => Buffer.from(text)

describe('the NDI send manager and its child', () => {
  it('forks nothing until a frame is actually pushed', () => {
    const { manager, children } = build()
    expect(children).toHaveLength(0)
    expect(manager.hasChild()).toBe(false)
    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    expect(children).toHaveLength(1)
  })

  it('opens an output on its first frame and answers ok before the child is ready', () => {
    const { manager, last } = build()
    const result = manager.pushFrame({ name: 'td_out', jpeg: jpeg() })
    expect(result).toMatchObject({ ok: true, seq: 1, viewers: 0 })
    const child = last()
    expect(child.opens()).toHaveLength(1)
    expect(child.opens()[0].name).toBe('td_out')
    expect(child.frames()).toHaveLength(1)
    expect(child.frames()[0].jpeg.toString()).toBe('jpeg-bytes')
  })

  it('a second name opens a second output in the same child', () => {
    const { manager, last } = build()
    manager.pushFrame({ name: 'td_out', jpeg: jpeg() })
    manager.pushFrame({ name: 'other', jpeg: jpeg() })
    const child = last()
    expect(child.opens()).toHaveLength(2)
    expect(child.opens().map((m) => m.name).sort()).toEqual(['other', 'td_out'])
    // the same name again reuses the open output — no second 'open', seq advances
    const again = manager.pushFrame({ name: 'TD_OUT', jpeg: jpeg() })
    expect(child.opens()).toHaveLength(2)
    expect(again.seq).toBe(2)
  })

  it('caps outputs and says which cap was hit', () => {
    const { manager } = build()
    manager.pushFrame({ name: 'a', jpeg: jpeg() })
    manager.pushFrame({ name: 'b', jpeg: jpeg() })
    manager.pushFrame({ name: 'c', jpeg: jpeg() })
    manager.pushFrame({ name: 'd', jpeg: jpeg() })
    const refused = manager.pushFrame({ name: 'e', jpeg: jpeg() })
    expect(refused.error).toBe('cap')
    expect(refused.reason).toBe('cap-outputs')
    expect(refused.how).toMatch(/already sends 4/)
    // an existing output is never capped out by its OWN traffic
    const again = manager.pushFrame({ name: 'a', jpeg: jpeg() })
    expect(again.ok).toBe(true)
  })

  it('rejects a missing name or a missing jpeg without forking anything', () => {
    const { manager, children } = build()
    expect(manager.pushFrame({ jpeg: jpeg() })).toMatchObject({ error: 'bad', reason: 'missing-name' })
    expect(manager.pushFrame({ name: 'td' })).toMatchObject({ error: 'bad', reason: 'missing-jpeg' })
    expect(manager.pushFrame({ name: 'td', jpeg: 'not-a-buffer' })).toMatchObject({ error: 'bad', reason: 'missing-jpeg' })
    expect(children).toHaveLength(0)
  })

  it('closes an output after it has gone idle, and tells the child', async () => {
    const { manager, last } = build()
    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    const child = last()
    const id = child.opens()[0].id
    expect(manager.outputs()).toHaveLength(1)

    await wait(60) // past idleOutputMs
    expect(child.closes()).toHaveLength(1)
    expect(child.closes()[0].id).toBe(id)
    expect(manager.outputs()).toHaveLength(0)
  })

  it('a frame within the idle window cancels the close — the output is never told to stop', async () => {
    const { manager, last } = build()
    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    await wait(25)
    manager.pushFrame({ name: 'td', jpeg: jpeg() }) // resets the idle timer before it fires
    await wait(25)
    expect(last().closes()).toHaveLength(0)
    expect(manager.outputs()).toHaveLength(1)
  })

  it('lets the child go once the last output has gone idle, and forks a fresh one on the next frame', async () => {
    const { manager, children, last } = build()
    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    await wait(60) // past idleOutputMs: the output closes, the child is now idle
    expect(last().killed).toBe(false)
    await wait(140) // past idleExitMs
    expect(children[0].killed).toBe(true)
    expect(manager.hasChild()).toBe(false)

    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    expect(children).toHaveLength(2)
  })

  it('stopOutput() closes an output explicitly and tells the truth about unknown names', () => {
    const { manager, last } = build()
    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    expect(manager.stopOutput({ name: 'nope' })).toBe(false)
    expect(manager.stopOutput({ name: 'TD' })).toBe(true) // keys are lowercased
    expect(last().closes()).toHaveLength(1)
    expect(manager.outputs()).toHaveLength(0)
  })

  it('carries viewers and per-output stats from the child into outputs()', () => {
    const { manager, last } = build()
    manager.pushFrame({ name: 'td_out', jpeg: jpeg() })
    const child = last()
    const id = child.opens()[0].id
    child.ready()
    child.state(id, 'sending', '', 3)
    child.stats({ [id]: { name: 'td_out', frames: 10, dropped: 2, viewers: 3, width: 1280, height: 720, decodeMs: 1, sendMs: 1, fps: 30 } })

    const [o] = manager.outputs()
    expect(o.state).toBe('sending')
    expect(o.viewers).toBe(3)
    expect(o.frames).toBe(10)
    expect(o.dropped).toBe(2)
    expect(o.width).toBe(1280)
    expect(o.height).toBe(720)
  })

  it('survives a child that dies mid-stream: restarts it with backoff and re-opens every live output', async () => {
    const { manager, children, last } = build()
    manager.pushFrame({ name: 'a', jpeg: jpeg() })
    manager.pushFrame({ name: 'b', jpeg: jpeg() })
    const first = last()
    first.ready()

    first.die('SIGKILL')
    expect(manager.outputs().every((o) => o.state === 'restarting')).toBe(true)

    await wait(60) // past the backoff
    expect(children).toHaveLength(2)
    const second = last()
    expect(second).not.toBe(first)
    expect(second.opens()).toHaveLength(2)
    expect(second.opens().map((m) => m.name).sort()).toEqual(['a', 'b'])
    expect(manager.stats().restarts).toBe(1)

    // the SAME outputs are still what the caller sees — no re-registration needed
    const pushed = manager.pushFrame({ name: 'a', jpeg: jpeg() })
    expect(pushed.ok).toBe(true)
  })

  it('does not restart a child that died having said the library is not there', async () => {
    const { manager, children } = build()
    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    children[0].fatal('not-installed', 'install libndi, then restart di')
    children[0].die(0)
    await wait(60)
    expect(children).toHaveLength(1) // no pointless restart loop against a missing library

    const summary = await manager.summary({ waitMs: 10 })
    expect(summary).toMatchObject({ available: false, reason: 'not-installed', how: 'install libndi, then restart di' })
  })

  it('answers summary from what the child reports, and reports no-koffi from the probe alone', async () => {
    const { manager, last } = build()
    const pending = manager.summary({ waitMs: 200 })
    last().ready('NDI SDK WIN64 6.3.2.0')
    expect(await pending).toMatchObject({ available: true, version: 'NDI SDK WIN64 6.3.2.0', reason: null })

    const { manager: manager2, children: children2 } = build({ probe: () => ({ ok: false, reason: 'no-koffi', how: 'run "npm install" in serverXR' }) })
    const summary2 = await manager2.summary({ waitMs: 10 })
    expect(summary2).toMatchObject({ available: false, reason: 'no-koffi' })
    expect(children2).toHaveLength(0)
  })

  it('close() kills the child at once, tears down every output, and refuses to fork another', async () => {
    const { manager, children, last } = build()
    manager.pushFrame({ name: 'td', jpeg: jpeg() })
    const child = last()
    manager.close()
    expect(child.killed).toBe(true)
    expect(manager.hasChild()).toBe(false)
    expect(manager.outputs()).toHaveLength(0)
    expect(manager.pushFrame({ name: 'td', jpeg: jpeg() })).toMatchObject({ error: 'unavailable', reason: 'closed' })
    await wait(60)
    expect(children).toHaveLength(1) // the death of the child it killed does not restart it
  })

  it('exposes NdiCapError with the cap-outputs code used by pushFrame', () => {
    const err = new NdiCapError('cap-outputs', 'this di.iiii already sends 4 NDI outputs')
    expect(err.code).toBe('cap-outputs')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('a machine that cannot send says so, every time', () => {
  it('refuses a frame when the runtime is missing, instead of answering ok', async () => {
    // The failure this guards against is the only one a page could never see for itself:
    // pushFrame used to open an output, drop the frame on the floor because there was no
    // child to take it, and answer { ok: true }. The browser would then sit there posting
    // thirty frames a second, believing it was on the network, and nothing anywhere would
    // say otherwise.
    const { manager, children } = build({ probe: () => ({ ok: false, reason: 'not-installed', how: 'install libndi, then restart di' }) })
    const refused = manager.pushFrame({ name: 'wall', jpeg: jpeg() })
    expect(refused.error).toBe('unavailable')
    expect(refused.reason).toBe('not-installed')
    expect(refused.how).toMatch(/libndi/)
    // and it leaves no phantom behind: nothing is listed as being sent, nothing was forked
    expect(manager.outputs()).toEqual([])
    expect(children).toHaveLength(0)
  })

  it('refuses once the child itself has said it cannot, not only at the probe', async () => {
    const { manager, last } = build()
    manager.pushFrame({ name: 'wall', jpeg: jpeg() })
    last().fatal('load-failed', 'the NDI runtime is installed but could not be loaded')
    last().die()
    await wait(10)
    const refused = manager.pushFrame({ name: 'wall', jpeg: jpeg() })
    expect(refused.error).toBe('unavailable')
    expect(refused.reason).toBe('load-failed')
  })

  it('keeps taking frames while the child is merely between restarts', async () => {
    // A restart is "not yet", not "cannot": the source is coming back, the page should
    // keep its rhythm, and those few frames are dropped in silence on purpose.
    const { manager, last } = build()
    manager.pushFrame({ name: 'wall', jpeg: jpeg() })
    last().ready()
    last().die()
    const during = manager.pushFrame({ name: 'wall', jpeg: jpeg() })
    expect(during.ok).toBe(true)
    expect(manager.outputs().map((o) => o.name)).toEqual(['wall'])
  })
})
