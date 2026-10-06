// The parent's half of the NDI® lane: owns the forked child (worker.js), never the
// library. Built on first use by routes/ndiRoutes.js; nothing here runs at boot.
//
//   · the child is spawned on first need and exits after 60 s with nothing to do;
//   · receivers are ref-counted by (name, maxWidth, bandwidth): the first subscriber
//     opens one, the last to leave starts a 5 s linger before it is closed — a page
//     reload or a second still does not pay for a reconnect;
//   · a child that dies is restarted with backoff (1 s → 30 s) and every receiver is
//     re-opened: subscribers keep their subscription and simply see frames resume;
//   · caps: 8 receivers, 16 subscribers;
//   · the AUTOSCAN (startScan): while it is on, the child is kept alive with nothing
//     to receive, restarted after a crash like any receiver, and every list its one
//     long-lived finder reports is folded into a registry (scanner.js) whose changes
//     go to onScan() listeners — the change feed at /ndi/api/scan/events. With no
//     runtime the scan says so ("no-runtime") and re-probes once a minute, which
//     costs a stat, not a fork.
//
// `forkChild` is injectable so tests drive a fake child (an EventEmitter with
// send/kill); the real one is child_process.fork with 'advanced' serialization so a
// JPEG crosses the pipe as a Buffer, not as JSON.
const path = require('path')
const { probeNdi } = require('./library')
const { createSourceRegistry, isEmptyChange } = require('./scanner')

// What the autoscan is doing. `running` is the only state in which the list is a
// reading of the network; in every other one it is history, and `count` is null.
const SCAN_STATES = ['off', 'starting', 'running', 'restarting', 'no-runtime', 'error']

const DEFAULTS = {
  lingerMs: 5000,
  idleExitMs: 60000,
  backoffMinMs: 1000,
  backoffMaxMs: 30000,
  maxReceivers: 8,
  maxSubscribers: 16,
  unavailableTtlMs: 60000,
  killGraceMs: 1500,
  // A fresh finder only ADDS names for this long: the SDK warns that its first lists
  // are incomplete ("it commonly takes a few seconds to discover all sources").
  scanSettleMs: 3000
}

const defaultFork = () => {
  const { fork } = require('child_process')
  return fork(path.join(__dirname, 'worker.js'), [], {
    serialization: 'advanced',
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true
  })
}

class NdiCapError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const asBuffer = (value) => {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return null
}

function createNdiManager({ forkChild = defaultFork, probe = probeNdi, log = () => {}, ...overrides } = {}) {
  const opt = { ...DEFAULTS, ...overrides }
  let child = null
  let ready = null // { version, path } once the child has the library loaded
  let unavailable = null // { reason, how, detail, at } — the child said "cannot", do not retry at once
  let sources = []
  let sourcesSeen = false
  let lastStats = null
  let closed = false
  let backoffMs = opt.backoffMinMs
  let restartTimer = null
  let idleTimer = null
  let nextId = 1
  let restarts = 0
  const receivers = new Map() // key → receiver
  const waiters = new Set() // fns run on every child message / exit

  // ── the autoscan's own state ──
  const registry = createSourceRegistry()
  const scanListeners = new Set()
  let scanning = false
  let scanSince = null
  let finderStartedAt = 0 // when the current child said `ready` — its finder was made then
  let lastHeardAt = null // the child's last word of any kind: the list is fresh as of this
  let lastList = null
  let settleTimer = null
  let scanRetryTimer = null
  let lastScanState = 'off'

  const keyOf = (name, maxWidth, bandwidth) => `${name.toLowerCase()}|${maxWidth}|${bandwidth}`
  const subscriberCount = () => { let n = 0; for (const r of receivers.values()) n += r.subs.size; return n }
  const notify = () => { for (const fn of [...waiters]) fn(); checkScanState() }

  const scanState = () => {
    if (!scanning) return 'off'
    if (unavailable) return unavailable.reason === 'not-installed' || unavailable.reason === 'no-koffi' ? 'no-runtime' : 'error'
    if (restartTimer) return 'restarting'
    if (!child || !ready || !sourcesSeen) return 'starting'
    return 'running'
  }

  const scanSnapshot = () => {
    const state = scanState()
    const looking = state === 'running'
    return {
      state,
      reason: unavailable ? unavailable.reason : null,
      how: unavailable ? unavailable.how : null,
      detail: unavailable ? unavailable.detail || '' : '',
      version: ready ? ready.version : null,
      since: scanSince,
      checkedAt: looking ? lastHeardAt : null,
      // null, never 0, when nothing is looking: "we cannot see" is not "there is nothing".
      count: looking ? registry.count() : null,
      sources: registry.list()
    }
  }

  const emitScan = (change) => {
    if (!scanListeners.size) return
    const event = { type: change ? 'change' : 'state', change: change || null, scan: scanSnapshot() }
    for (const fn of [...scanListeners]) { try { fn(event) } catch {} }
  }

  function checkScanState() {
    const state = scanState()
    if (state === lastScanState) return
    lastScanState = state
    emitScan(null)
  }

  const scheduleScanRetry = () => {
    if (!scanning || closed || scanRetryTimer) return
    scanRetryTimer = setTimeout(() => {
      scanRetryTimer = null
      if (!scanning || closed) return
      ensureChild()
      checkScanState()
    }, opt.unavailableTtlMs + 10)
    scanRetryTimer.unref?.()
  }

  // A list from the finder → the registry → a change event, if anything changed.
  const foldList = (list) => {
    if (!scanning) return
    const now = Date.now()
    lastList = list
    const settling = now - finderStartedAt < opt.scanSettleMs
    const change = registry.apply(list, now, { settling })
    if (settling && !settleTimer) {
      settleTimer = setTimeout(() => {
        settleTimer = null
        // Only if a finder is still up: a list from a dead child is not a reading.
        if (!scanning || !child || !ready || !lastList) return
        const late = registry.apply(lastList, Date.now())
        if (!isEmptyChange(late)) emitScan(late)
      }, Math.max(0, finderStartedAt + opt.scanSettleMs - now) + 5)
      settleTimer.unref?.()
    }
    if (!isEmptyChange(change)) emitScan(change)
  }

  const sendToChild = (message) => {
    if (!child || !child.connected) return false
    try { child.send(message); return true } catch { return false }
  }

  const touchIdle = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    if (closed || !child || receivers.size || scanning) return
    idleTimer = setTimeout(() => { idleTimer = null; if (!receivers.size) stopChild() }, opt.idleExitMs)
    idleTimer.unref?.()
  }

  // Asked to go: a 'shutdown' message lets it release its receivers, then a kill after a
  // grace period. `now` (close(), process exit) skips the grace — there may be no later.
  const stopChild = ({ now = false } = {}) => {
    const c = child
    if (!c) return
    child = null; ready = null; sourcesSeen = false; sources = []; lastList = null
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
    lastHeardAt = Date.now()
    if (message.type === 'ready') {
      ready = { version: String(message.version || ''), path: String(message.path || '') }
      finderStartedAt = Date.now()
      unavailable = null
    } else if (message.type === 'fatal') {
      unavailable = { reason: message.reason || 'load-failed', how: message.how || '', detail: message.detail || '', at: Date.now() }
      log(`[ndi] not available: ${unavailable.reason} — ${unavailable.how}`)
    } else if (message.type === 'sources') {
      sources = Array.isArray(message.sources) ? message.sources : []
      sourcesSeen = true
      foldList(sources)
    } else if (message.type === 'state') {
      const r = [...receivers.values()].find((x) => x.id === message.id)
      if (r) {
        r.state = message.state; r.detail = message.detail || ''; r.source = message.source || null
        // Which address the runtime was handed. The SENDER chooses it, and on a rig
        // with more than one network that choice is the whole story — so it travels.
        r.address = message.address || ''
        for (const sub of r.subs) sub.onState?.({ state: r.state, detail: r.detail, source: r.source, address: r.address })
      }
    } else if (message.type === 'frame') {
      const r = [...receivers.values()].find((x) => x.id === message.id)
      const jpeg = asBuffer(message.jpeg)
      if (r && jpeg) {
        backoffMs = opt.backoffMinMs // pictures are flowing: the next crash starts the backoff over
        r.lastFrame = { jpeg, width: message.width, height: message.height, seq: message.seq, at: Date.now() }
        for (const sub of r.subs) { try { sub.onFrame?.(r.lastFrame) } catch {} }
      }
    } else if (message.type === 'stats') {
      lastStats = { ...message, at: Date.now() }
      // Every 2 s from a live child whose finder has not reported a change: every name
      // present is still present as of now.
      if (scanning && sourcesSeen) registry.touch(lastHeardAt)
    }
    notify()
  }

  const onExit = (code, signal) => {
    const fatal = Boolean(unavailable)
    child = null; ready = null; sourcesSeen = false; sources = []; lastList = null
    if (closed) { notify(); return }
    if (fatal) { scheduleScanRetry(); notify(); return }
    // idle and not scanning: the next request starts a fresh one
    if (!receivers.size && !scanning) { notify(); return }
    log(`[ndi] child exited (${signal || code}); restarting in ${backoffMs} ms`)
    for (const r of receivers.values()) {
      r.state = 'restarting'; r.detail = 'the NDI process stopped and is being restarted'
      for (const sub of r.subs) sub.onState?.({ state: r.state, detail: r.detail, source: r.source, address: r.address || '' })
    }
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = setTimeout(() => { restartTimer = null; restarts += 1; ensureChild() }, backoffMs)
    restartTimer.unref?.()
    backoffMs = Math.min(opt.backoffMaxMs, backoffMs * 2)
    notify()
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
      scheduleScanRetry()
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
    mine.on('error', (error) => log(`[ndi] child error: ${error?.message || error}`))
    mine.once('exit', (code, signal) => { if (child === mine) onExit(code, signal) })
    for (const r of receivers.values()) openInChild(r)
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

  const closeReceiver = (r) => {
    if (r.lingerTimer) { clearTimeout(r.lingerTimer); r.lingerTimer = null }
    if (receivers.get(r.key) !== r) return
    receivers.delete(r.key)
    sendToChild({ type: 'close', id: r.id })
    touchIdle()
  }

  const subscribe = ({ name, maxWidth = 0, bandwidth = 'highest', onFrame, onState } = {}) => {
    if (closed) throw new NdiCapError('closed', 'the NDI lane is shut down')
    const cleanName = String(name || '').trim()
    const width = Number(maxWidth) > 0 ? Math.floor(Number(maxWidth)) : 0
    const bw = bandwidth === 'lowest' ? 'lowest' : 'highest'
    const key = keyOf(cleanName, width, bw)
    let r = receivers.get(key)
    if (subscriberCount() >= opt.maxSubscribers) throw new NdiCapError('cap-subscribers', `this di.iiii already serves ${opt.maxSubscribers} NDI viewers`)
    if (!r) {
      if (receivers.size >= opt.maxReceivers) throw new NdiCapError('cap-receivers', `this di.iiii already receives ${opt.maxReceivers} NDI pictures`)
      r = { key, id: `r${nextId++}`, name: cleanName, maxWidth: width, bandwidth: bw, subs: new Set(), lingerTimer: null, lastFrame: null, state: 'starting', detail: '', source: null, address: '' }
      receivers.set(key, r)
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
      if (ensureChild()) openInChild(r)
    } else if (r.lingerTimer) {
      clearTimeout(r.lingerTimer); r.lingerTimer = null
    }
    const sub = { onFrame, onState }
    r.subs.add(sub)
    let left = false
    return {
      key,
      receiver: () => ({ state: r.state, detail: r.detail, source: r.source, address: r.address || '', lastFrame: r.lastFrame }),
      unsubscribe: () => {
        if (left) return
        left = true
        r.subs.delete(sub)
        if (r.subs.size || receivers.get(key) !== r) return
        r.lingerTimer = setTimeout(() => closeReceiver(r), opt.lingerMs)
        r.lingerTimer.unref?.()
      }
    }
  }

  // Each receiver is opened exactly once per child: by ensureChild() when it forks
  // (that is what re-opens everything after a crash), or here when the child already runs.
  const openInChild = (r) => {
    if (r.openedIn === child) return
    r.openedIn = child
    sendToChild({ type: 'open', id: r.id, name: r.name, maxWidth: r.maxWidth, bandwidth: r.bandwidth })
  }

  const summary = async ({ waitMs = 3000 } = {}) => {
    ensureChild()
    touchIdle()
    if (child) await waitFor(() => ready || unavailable || !child, waitMs)
    if (ready) return { available: true, version: ready.version, reason: null, how: null }
    if (unavailable) return { available: false, version: null, reason: unavailable.reason, how: unavailable.how }
    return { available: false, version: null, reason: 'load-failed', how: 'the NDI process did not answer in time — ask again in a moment' }
  }

  const getSources = async ({ waitMs = 2500 } = {}) => {
    ensureChild()
    touchIdle()
    if (child) await waitFor(() => sourcesSeen || unavailable || !child, waitMs)
    return { available: !unavailable && Boolean(child), reason: unavailable ? unavailable.reason : null, how: unavailable ? unavailable.how : null, sources: sources.map((s) => ({ name: s.name, address: s.address })) }
  }

  // One JPEG: a fresh frame if one is already flowing, else the first to arrive within
  // `waitMs`. → { jpeg, width, height } | { error:'unavailable'|'timeout', … }
  const still = async ({ name, maxWidth = 0, bandwidth = 'highest', waitMs = 3000 } = {}) => {
    let resolveFrame
    const arrived = new Promise((resolve) => { resolveFrame = resolve })
    const sub = subscribe({ name, maxWidth, bandwidth, onFrame: (frame) => resolveFrame(frame) })
    try {
      if (!child && unavailable) return { error: 'unavailable', reason: unavailable.reason, how: unavailable.how }
      const held = sub.receiver().lastFrame
      if (held && Date.now() - held.at < 1000) return held
      let timer = null
      const frame = await Promise.race([arrived, new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs) })])
      clearTimeout(timer)
      if (frame) return frame
      if (unavailable) return { error: 'unavailable', reason: unavailable.reason, how: unavailable.how }
      const now = sub.receiver()
      return { error: 'timeout', state: now.state, detail: now.detail }
    } finally {
      sub.unsubscribe()
    }
  }

  const stats = () => ({
    child: child ? { pid: child.pid, ready: Boolean(ready), version: ready ? ready.version : null } : null,
    unavailable: unavailable ? { reason: unavailable.reason, how: unavailable.how } : null,
    restarts,
    backoffMs,
    subscribers: subscriberCount(),
    receivers: [...receivers.values()].map((r) => ({
      id: r.id, name: r.name, maxWidth: r.maxWidth, bandwidth: r.bandwidth, subscribers: r.subs.size,
      lingering: Boolean(r.lingerTimer), state: r.state, detail: r.detail, source: r.source, address: r.address || '',
      lastFrameAgeMs: r.lastFrame ? Date.now() - r.lastFrame.at : null
    })),
    worker: lastStats,
    scan: { state: scanState(), count: scanState() === 'running' ? registry.count() : null, listeners: scanListeners.size }
  })

  // ── the autoscan ──────────────────────────────────────────────────────────
  // Idempotent. Once on, it stays on until stopScan() or close(): continuous is
  // the point. → the snapshot as it stands.
  const startScan = () => {
    if (closed) return scanSnapshot()
    if (!scanning) { scanning = true; scanSince = Date.now() }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    ensureChild()
    checkScanState()
    return scanSnapshot()
  }

  const stopScan = () => {
    if (!scanning) return
    scanning = false
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
    if (scanRetryTimer) { clearTimeout(scanRetryTimer); scanRetryTimer = null }
    touchIdle()
    checkScanState()
  }

  // The snapshot once the scan has had `waitMs` to reach a reading — for a caller
  // that has just switched it on and would otherwise print "starting".
  const scan = async ({ waitMs = 0 } = {}) => {
    startScan()
    if (waitMs > 0) await waitFor(() => scanState() !== 'starting', waitMs)
    return scanSnapshot()
  }

  // listener({ type:'change'|'state', change:{ appeared, gone, changed }|null, scan }) → off()
  const onScan = (listener) => {
    scanListeners.add(listener)
    return () => { scanListeners.delete(listener) }
  }

  const close = () => {
    if (closed) return
    closed = true
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
    if (scanRetryTimer) { clearTimeout(scanRetryTimer); scanRetryTimer = null }
    scanning = false
    scanListeners.clear()
    for (const r of receivers.values()) if (r.lingerTimer) clearTimeout(r.lingerTimer)
    receivers.clear()
    stopChild({ now: true })
    notify()
  }

  return {
    subscribe, summary, getSources, still, stats, close, hasChild: () => child !== null,
    startScan, stopScan, scan, scanSnapshot, onScan, isScanning: () => scanning
  }
}

module.exports = { createNdiManager, NdiCapError, DEFAULTS, SCAN_STATES }
