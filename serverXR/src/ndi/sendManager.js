// The parent's half of the NDI® SEND lane: owns the forked child (sendWorker.js), never
// the library. Built on first use by routes/ndiRoutes.js; nothing here runs at boot.
//
// This is copied wholesale from manager.js (the receive lane) rather than built on a
// shared base class. The two lanes drift for good reasons — a source's lifecycle is not
// a mirror image of a receiver's — and a shared base would turn every future change to
// one lane into a risk for the other. Where this file departs from manager.js, the
// comment at that spot says why.
//
//   · the child is spawned on first frame and exits after 60 s with no outputs left;
//   · an output has exactly ONE publisher and NO subscribers — there is no ref-count to
//     hold it open. It is born from its first pushFrame() and dies when frames stop
//     arriving for `idleOutputMs` (default 5000). This is the one structural difference
//     from the receive lane: a browser tab that navigates away simply stops posting
//     frames, there is no "I am leaving" beacon it can send, so silence itself is the
//     only signal we ever get that an output should close;
//   · a child that dies is restarted with backoff (1 s -> 30 s) and every LIVE output is
//     re-opened in the new child: a crash is a hiccup for whoever is still posting
//     frames, not a reason to make them re-create the source;
//   · caps: 4 outputs. There is no subscriber cap here — nothing subscribes.
//
// `forkChild` is injectable so tests drive a fake child (an EventEmitter with
// send/kill); the real one is child_process.fork with 'advanced' serialization so a
// JPEG crosses the pipe as a Buffer, not as JSON.
const path = require('path')
const { probeNdi } = require('./library')

const DEFAULTS = {
  idleOutputMs: 5000,
  idleExitMs: 60000,
  backoffMinMs: 1000,
  backoffMaxMs: 30000,
  maxOutputs: 4,
  unavailableTtlMs: 60000,
  killGraceMs: 1500
}

const defaultFork = () => {
  const { fork } = require('child_process')
  return fork(path.join(__dirname, 'sendWorker.js'), [], {
    serialization: 'advanced',
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true
  })
}

// Same shape as manager.js's NdiCapError, defined locally on purpose: a shared import
// would be the one thread tying these two independent files back together.
class NdiCapError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const asBuffer = (value) => {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return null
}

function createNdiSendManager({ forkChild = defaultFork, probe = probeNdi, log = () => {}, ...overrides } = {}) {
  const opt = { ...DEFAULTS, ...overrides }
  let child = null
  let ready = null // { version, path } once the child has the library loaded
  let unavailable = null // { reason, how, detail, at } — the child said "cannot", do not retry at once
  let lastStats = null
  let closed = false
  let backoffMs = opt.backoffMinMs
  let restartTimer = null
  let idleTimer = null // whole-child idle: armed only while liveOutputs is empty
  let nextId = 1
  let restarts = 0
  // Keyed by lowercased name ALONE — no maxWidth, no bandwidth, because a send output
  // is not shaped by what a viewer asks for. There is no viewer asking; there is a
  // browser posting frames under a name, and that name is the whole identity.
  const liveOutputs = new Map()
  const waiters = new Set() // fns run on every child message / exit

  const notify = () => { for (const fn of [...waiters]) fn() }

  const sendToChild = (message) => {
    if (!child || !child.connected) return false
    try { child.send(message); return true } catch { return false }
  }

  // Whole-child idle timer: armed only once every output has closed. Unlike the receive
  // lane there is no per-receiver linger to race against — an output either has a live
  // idle timer of its own (see touchOutputIdle) or it does not exist any more.
  const touchIdle = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    if (closed || !child || liveOutputs.size) return
    idleTimer = setTimeout(() => { idleTimer = null; if (!liveOutputs.size) stopChild() }, opt.idleExitMs)
    idleTimer.unref?.()
  }

  // Asked to go: a 'shutdown' message lets it release, then a kill after a grace period.
  // `now` (close(), process exit) skips the grace — there may be no later.
  const stopChild = ({ now = false } = {}) => {
    const c = child
    if (!c) return
    child = null; ready = null
    c.removeAllListeners('exit'); c.removeAllListeners('message'); c.removeAllListeners('error')
    c.on('error', () => {})
    if (now) { try { c.kill() } catch {} return }
    try { if (c.connected) c.send({ type: 'shutdown' }) } catch {}
    const t = setTimeout(() => { try { c.kill() } catch {} }, opt.killGraceMs)
    t.unref?.()
    c.once('exit', () => clearTimeout(t))
  }

  const onMessage = (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'ready') {
      ready = { version: String(message.version || ''), path: String(message.path || '') }
      unavailable = null
    } else if (message.type === 'fatal') {
      unavailable = { reason: message.reason || 'load-failed', how: message.how || '', detail: message.detail || '', at: Date.now() }
      log(`[ndi-send] not available: ${unavailable.reason} — ${unavailable.how}`)
    } else if (message.type === 'state') {
      const o = [...liveOutputs.values()].find((x) => x.id === message.id)
      if (o) {
        o.state = message.state; o.detail = message.detail || ''
        if (typeof message.viewers === 'number') o.viewers = message.viewers
      }
    } else if (message.type === 'stats') {
      lastStats = { ...message, at: Date.now() }
      // The receive lane resets its backoff when a 'frame' message proves a picture is
      // actually flowing. Frames flow the OTHER way in this lane — parent to child — so
      // there is no frame echo to watch for. The 2 s stats heartbeat is the equivalent
      // proof of life: it only ever arrives from a child that is up and pumping.
      backoffMs = opt.backoffMinMs
      const perOutput = message.outputs || {}
      for (const o of liveOutputs.values()) {
        const s = perOutput[o.id]
        if (!s) continue
        o.frames = Number(s.frames) || 0
        o.dropped = Number(s.dropped) || 0
        o.width = Number(s.width) || 0
        o.height = Number(s.height) || 0
        if (typeof s.viewers === 'number') o.viewers = s.viewers
      }
    }
    notify()
  }

  const onExit = (code, signal) => {
    const fatal = Boolean(unavailable)
    child = null; ready = null
    notify()
    if (closed || fatal) return
    if (!liveOutputs.size) return // idle: the next frame starts a fresh one
    log(`[ndi-send] child exited (${signal || code}); restarting in ${backoffMs} ms`)
    for (const o of liveOutputs.values()) {
      o.state = 'restarting'; o.detail = 'the NDI process stopped and is being restarted'
    }
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(() => { restartTimer = null; restarts += 1; ensureChild() }, backoffMs)
    restartTimer.unref?.()
    backoffMs = Math.min(opt.backoffMaxMs, backoffMs * 2)
  }

  // → the child, or null with `unavailable` set.
  const ensureChild = () => {
    if (closed) return null
    if (child) return child
    if (restartTimer) return null // a restart is already scheduled — do not jump the backoff
    if (unavailable && Date.now() - unavailable.at < opt.unavailableTtlMs) return null
    const probed = probe()
    if (!probed.ok) {
      unavailable = { reason: probed.reason, how: probed.how, detail: probed.detail || '', at: Date.now() }
      return null
    }
    unavailable = null
    try {
      child = forkChild()
    } catch (error) {
      unavailable = { reason: 'load-failed', how: '', detail: String(error?.message || error), at: Date.now() }
      return null
    }
    const mine = child
    mine.on('message', onMessage)
    mine.on('error', (error) => log(`[ndi-send] child error: ${error?.message || error}`))
    mine.once('exit', (code, signal) => { if (child === mine) onExit(code, signal) })
    for (const o of liveOutputs.values()) openInChild(o)
    touchIdle()
    return child
  }

  // Resolve when `test()` is truthy, or with its last value after `ms`.
  const waitFor = (test, ms) => new Promise((resolve) => {
    const first = test()
    if (first) { resolve(first); return }
    let timer = null
    const check = () => {
      const value = test()
      if (!value) return
      waiters.delete(check); clearTimeout(timer); resolve(value)
    }
    timer = setTimeout(() => { waiters.delete(check); resolve(test()) }, ms)
    waiters.add(check)
  })

  // Each output is opened exactly once per child: by ensureChild() when it forks (that
  // is what re-opens everything after a crash), or here when the child already runs.
  const openInChild = (o) => {
    if (o.openedIn === child) return
    o.openedIn = child
    sendToChild({ type: 'open', id: o.id, name: o.name })
  }

  // No linger: nobody is "leaving" an output the way a subscriber leaves a receiver.
  // The only reason an output ever closes is either an explicit stopOutput() call or
  // its idle timer firing because pushFrame() stopped being called for it.
  const closeOutput = (o) => {
    if (o.idleTimer) { clearTimeout(o.idleTimer); o.idleTimer = null }
    if (liveOutputs.get(o.key) !== o) return
    liveOutputs.delete(o.key)
    sendToChild({ type: 'close', id: o.id })
    touchIdle()
  }

  // Reset on every pushFrame(); fires when frames for this output stop arriving. This
  // is the whole lifecycle for a send output — there is nothing else watching it.
  const touchOutputIdle = (o) => {
    if (o.idleTimer) { clearTimeout(o.idleTimer); o.idleTimer = null }
    if (closed) return
    o.idleTimer = setTimeout(() => { o.idleTimer = null; closeOutput(o) }, opt.idleOutputMs)
    o.idleTimer.unref?.()
  }

  // One JPEG, posted under `name`. Opens the output on its first call, resets the idle
  // timer on every call. The child may not have answered 'ready' yet by the time this
  // returns — that is fine and expected: we say `ok` and let the state catch up on the
  // next stats/state message, exactly the way a picture keeps trying to connect. There
  // is no reason to make the browser retry just because the child is still starting.
  const pushFrame = ({ name, jpeg } = {}) => {
    const cleanName = String(name || '').trim()
    if (!cleanName) return { error: 'bad', reason: 'missing-name', how: 'pushFrame needs a name' }
    const buf = asBuffer(jpeg)
    if (!buf) return { error: 'bad', reason: 'missing-jpeg', how: 'pushFrame needs a JPEG buffer' }
    const key = cleanName.toLowerCase()
    let o = liveOutputs.get(key)
    // Whether this machine can send at all is decided BEFORE an output is made, so a
    // di.iiii with no runtime never grows a phantom source it is not broadcasting. The
    // page has no way of knowing before it asks, and answering `ok` to a frame that goes
    // nowhere is the one failure it could never see: it would sit there believing it was
    // on the network. `unavailable` is the child saying "cannot", not "not yet" — a child
    // that is merely between restarts leaves it null, and those frames are dropped in
    // silence because the source really is coming back.
    const c = ensureChild()
    if (!c && unavailable) return { error: 'unavailable', reason: unavailable.reason, how: unavailable.how }
    if (!o) {
      // close() empties liveOutputs and refuses to fork again, so a brand-new name
      // arriving after close() lands here rather than silently doing nothing.
      if (closed) return { error: 'unavailable', reason: 'closed', how: 'the NDI send lane is shut down' }
      if (liveOutputs.size >= opt.maxOutputs) {
        const capErr = new NdiCapError('cap-outputs', `this di.iiii already sends ${opt.maxOutputs} NDI outputs`)
        return { error: 'cap', reason: capErr.code, how: capErr.message }
      }
      o = {
        key, id: `o${nextId++}`, name: cleanName, state: 'starting', detail: '', viewers: 0,
        frames: 0, dropped: 0, width: 0, height: 0, seq: 0, lastFrameAt: 0, idleTimer: null, openedIn: null
      }
      liveOutputs.set(key, o)
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } // no longer all-idle
    }
    touchOutputIdle(o)
    o.lastFrameAt = Date.now()
    o.seq += 1
    if (c) {
      if (o.openedIn !== c) openInChild(o)
      sendToChild({ type: 'frame', id: o.id, jpeg: buf, seq: o.seq })
    }
    return { ok: true, seq: o.seq, viewers: o.viewers }
  }

  const stopOutput = ({ name } = {}) => {
    const key = String(name || '').trim().toLowerCase()
    const o = liveOutputs.get(key)
    if (!o) return false
    closeOutput(o)
    return true
  }

  const outputs = () => [...liveOutputs.values()].map((o) => ({
    name: o.name, state: o.state, detail: o.detail, viewers: o.viewers,
    frames: o.frames, dropped: o.dropped, width: o.width, height: o.height,
    lastFrameAgeMs: o.lastFrameAt ? Date.now() - o.lastFrameAt : null
  }))

  const summary = async ({ waitMs = 3000 } = {}) => {
    ensureChild()
    touchIdle()
    if (child) await waitFor(() => ready || unavailable || !child, waitMs)
    if (ready) return { available: true, version: ready.version, reason: null, how: null }
    if (unavailable) return { available: false, version: null, reason: unavailable.reason, how: unavailable.how }
    return { available: false, version: null, reason: 'load-failed', how: 'the NDI process did not answer in time — ask again in a moment' }
  }

  const stats = () => ({
    child: child ? { pid: child.pid, ready: Boolean(ready), version: ready ? ready.version : null } : null,
    unavailable: unavailable ? { reason: unavailable.reason, how: unavailable.how } : null,
    restarts,
    backoffMs,
    outputs: outputs(),
    worker: lastStats
  })

  const close = () => {
    if (closed) return
    closed = true
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    for (const o of liveOutputs.values()) if (o.idleTimer) clearTimeout(o.idleTimer)
    liveOutputs.clear()
    stopChild({ now: true })
    notify()
  }

  return { pushFrame, stopOutput, outputs, summary, stats, close, hasChild: () => child !== null }
}

module.exports = { createNdiSendManager, NdiCapError, DEFAULTS }
