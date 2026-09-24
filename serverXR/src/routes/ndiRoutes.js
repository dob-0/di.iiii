const express = require('express')
const { requireLocalRuntime } = require('../localRuntimeGuard')

// NDI® in — serverXR/src/ndi — mounted at /ndi on a LOCAL di.iiii. The twin of the
// lighting desk's lane (routes/lightingRoutes.js), with the same three rules:
//   1. nothing is built at boot: the manager is made on the first request to /ndi, and
//      even then the NDI runtime is only ever loaded inside a forked child process
//      (ndi/worker.js) — serverXR boots and runs the same with no koffi and no runtime;
//   2. every route sits behind requireLocalRuntime: a hosted server answers 404, and a
//      local one answers only its own machine unless DI_ALLOW_LAN_DEVICES=1;
//   3. a request can only NAME a source. The name is matched against what the NDI
//      finder itself discovered (ndi/names.js); no address from a client is ever dialled.
//
//   GET /ndi/api/summary            { available, version, reason, how }
//   GET /ndi/api/sources            { available, sources:[{ name, address }] }
//   GET /ndi/api/still?name=&w=     one JPEG (waits up to 3 s for a first frame, else 504)
//   GET /ndi/in.mjpg?name=&w=&fps=  multipart/x-mixed-replace — point an <img> at it
//   GET /ndi/api/stats              receivers, subscribers, the child's timings
//
// The AUTOSCAN — which NDI sources are on the network right now, without anyone
// pressing "find". One long-lived finder in the child (the SDK's own continuous
// discovery), a registry of first-seen / last-seen / gone-since (ndi/scanner.js):
//
//   GET /ndi/api/scan?wait=ms       { state, reason, how, version, since, checkedAt,
//                                     count, sources:[{ name, address, present,
//                                     firstSeen, lastSeen, goneSince }] }
//   GET /ndi/api/scan/events        text/event-stream: `event: scan` with that same
//                                   snapshot at once, then on every change with
//                                   `change: { appeared, gone, changed }` beside it
//
//   state: off · starting · running · restarting · no-runtime · error. `count` is
//   null in every state but running: a machine that cannot look never says "0".
//   Either route switches the scan on; a real install (DI_LOCAL=1) switches it on at
//   boot — scanAtBootFrom() below — unless DI_NDI_SCAN=0.
//
// NDI out — serverXR/src/ndi/sendManager.js — is the same lane pointed the other way.
// di.iiii draws its pictures in a browser, so the frames come UP from a page as ordinary
// JPEGs and this server broadcasts them; nothing here generates a picture.
//
//   POST   /ndi/out.jpg?name=       one JPEG, the body -> { ok, seq, viewers }
//   DELETE /ndi/out.jpg?name=       stop sending under that name now
//   GET    /ndi/api/outputs         { available, outputs:[{ name, viewers, frames, ... }] }
//
// An output is born from its first frame and lives only while frames keep arriving: a
// page that is closed simply stops posting, and there is no close beacon worth trusting.
//
// docs/architecture/NDI.md has the licence position: the runtime is installed by the
// person, never shipped. NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
const BOUNDARY = 'di-ndi-frame'
const NAME_MAX = 200
const WIDTH_MIN = 16
const WIDTH_MAX = 4096
const FPS_MIN = 1
const FPS_MAX = 60
const STILL_WAIT_MS = 3000
// A 4K JPEG at a generous quality is comfortably under this; anything larger is a mistake
// upstream, and refusing it is cheaper than decoding it.
const FRAME_LIMIT = '8mb'
// The change feed: an SSE comment this often keeps proxies and the browser from
// calling a quiet network a dead connection; the cap bounds what a page left open
// in many tabs can hold.
const SCAN_PING_MS = 20000
const SCAN_WAIT_MAX_MS = 5000
const MAX_SCAN_STREAMS = 32

// Should the autoscan start when the server boots? Yes on a real install (`di up`
// sets DI_LOCAL=1), no on a developer's box or in tests unless asked for —
// DI_NDI_SCAN=1 forces it on, DI_NDI_SCAN=0 off. A hosted server never scans:
// hasLocalRuntime() is false there and the lane is never built.
const scanAtBootFrom = (env = process.env) => {
  const flag = String(env.DI_NDI_SCAN || '').trim()
  if (flag === '0') return false
  if (flag === '1') return true
  return env.DI_LOCAL === '1'
}

const bad = (res, detail) => res.status(400).json({ error: 'bad request', detail })

// → { name, maxWidth, fps, bandwidth } or null after answering 400.
const readQuery = (req, res) => {
  const raw = req.query.name
  if (typeof raw !== 'string' || !raw.trim()) { bad(res, 'name is required: part of an NDI source name'); return null }
  const name = raw.trim()
  if (name.length > NAME_MAX) { bad(res, `name is longer than ${NAME_MAX} characters`); return null }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) { bad(res, 'name contains control characters'); return null }

  const int = (key, min, max) => {
    const value = req.query[key]
    if (value === undefined || value === '') return 0
    if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return NaN
    const n = Number(value)
    return n >= min && n <= max ? n : NaN
  }
  const maxWidth = int('w', WIDTH_MIN, WIDTH_MAX)
  if (Number.isNaN(maxWidth)) { bad(res, `w must be a whole number from ${WIDTH_MIN} to ${WIDTH_MAX}`); return null }
  const fps = int('fps', FPS_MIN, FPS_MAX)
  if (Number.isNaN(fps)) { bad(res, `fps must be a whole number from ${FPS_MIN} to ${FPS_MAX}`); return null }
  const bw = req.query.bw
  if (bw !== undefined && bw !== 'highest' && bw !== 'lowest') { bad(res, 'bw must be "highest" or "lowest"'); return null }
  return { name, maxWidth, fps, bandwidth: bw === 'lowest' ? 'lowest' : 'highest' }
}

// The name half of readQuery on its own: an output is named and nothing else. -> name | null
const readName = (req, res) => {
  const raw = req.query.name
  if (typeof raw !== 'string' || !raw.trim()) { bad(res, 'name is required: what this picture is called on the network'); return null }
  const name = raw.trim()
  if (name.length > NAME_MAX) { bad(res, `name is longer than ${NAME_MAX} characters`); return null }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) { bad(res, 'name contains control characters'); return null }
  return name
}

function registerNdiRoutes(app, { mountPaths = ['/ndi'], log = () => {}, createManager = null, createSendManager = null } = {}) {
  let manager = null
  const getManager = () => {
    if (manager) return manager
    const make = createManager || require('../ndi/manager').createNdiManager
    manager = make({ log })
    return manager
  }

  // The two lanes are two children and two managers. A machine that only receives never
  // forks a sender, and a crash in one is not a gap in the other.
  let sendManager = null
  const getSendManager = () => {
    if (sendManager) return sendManager
    const make = createSendManager || require('../ndi/sendManager').createNdiSendManager
    sendManager = make({ log })
    return sendManager
  }

  const router = express.Router()
  const noStore = (res) => res.set('Cache-Control', 'no-store')

  const refuse = (res, error) => {
    if (error && (error.code === 'cap-receivers' || error.code === 'cap-subscribers' || error.code === 'cap-outputs')) {
      res.status(429).json({ error: 'busy', detail: error.message })
      return
    }
    res.status(503).json({ error: 'unavailable', detail: String(error?.message || error) })
  }

  router.get('/api/summary', async (_req, res) => {
    noStore(res).json(await getManager().summary())
  })

  router.get('/api/sources', async (_req, res) => {
    noStore(res).json(await getManager().getSources())
  })

  router.get('/api/scan', async (req, res) => {
    const raw = req.query.wait
    let waitMs = 0
    if (raw !== undefined && raw !== '') {
      if (typeof raw !== 'string' || !/^\d{1,5}$/.test(raw) || Number(raw) > SCAN_WAIT_MAX_MS) {
        bad(res, `wait must be a whole number of milliseconds up to ${SCAN_WAIT_MAX_MS}`); return
      }
      waitMs = Number(raw)
    }
    noStore(res).json(await getManager().scan({ waitMs }))
  })

  let scanStreams = 0
  router.get('/api/scan/events', (req, res) => {
    if (scanStreams >= MAX_SCAN_STREAMS) { noStore(res).status(429).json({ error: 'busy', detail: `this di.iiii already holds ${MAX_SCAN_STREAMS} NDI scan feeds` }); return }
    const m = getManager()
    scanStreams += 1
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders()
    const write = (event) => {
      if (res.destroyed || res.writableEnded) return
      res.write(`event: scan\ndata: ${JSON.stringify({ ...event.scan, change: event.change || null })}\n\n`)
    }
    // Subscribed before the scan is switched on, so the first state change is not missed.
    const off = m.onScan(write)
    res.write('retry: 3000\n\n')
    write({ scan: m.startScan(), change: null })
    const ping = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n') }, SCAN_PING_MS)
    ping.unref?.()
    let left = false
    const leave = () => { if (left) return; left = true; scanStreams -= 1; clearInterval(ping); off() }
    req.on('close', leave)
    res.on('close', leave)
    res.on('error', leave)
  })

  router.get('/api/stats', (_req, res) => {
    // Asking for stats must not fork anything. The receive manager is built because it
    // is what this route has always reported; the sender is reported only if a page has
    // actually sent a frame, so a machine that never sends stays a machine that never forks.
    noStore(res).json({ ...getManager().stats(), out: sendManager ? sendManager.stats() : null })
  })

  router.get('/api/outputs', async (_req, res) => {
    const m = getSendManager()
    const status = await m.summary()
    noStore(res).json({ available: status.available, reason: status.reason, how: status.how, outputs: m.outputs() })
  })

  // One frame, the body. The browser is the pacer and it self-throttles by not posting
  // the next frame until this one has answered — which is why there is no queue anywhere
  // in this lane and why a slow machine simply sends fewer frames instead of falling behind.
  router.post('/out.jpg', express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: FRAME_LIMIT }), (req, res) => {
    const name = readName(req, res)
    if (!name) return
    if (!Buffer.isBuffer(req.body) || !req.body.length) { bad(res, 'the body must be a JPEG'); return }
    // Two bytes are enough to tell a JPEG from a page of HTML posted by mistake, and the
    // mistake is worth naming here rather than three processes away inside sharp.
    if (req.body[0] !== 0xff || req.body[1] !== 0xd8) { bad(res, 'the body does not start like a JPEG'); return }
    let result
    try {
      result = getSendManager().pushFrame({ name, jpeg: req.body })
    } catch (error) { refuse(res, error); return }
    noStore(res)
    // pushFrame RETURNS its refusals rather than throwing them, so the cap has to be
    // mapped here by hand: a page that is told 503 will wait for a runtime that is
    // already loaded, when what it should do is give up this name and use another.
    if (result.error === 'cap') { res.status(429).json({ error: 'busy', detail: result.how }); return }
    if (result.error === 'bad') { bad(res, result.how); return }
    if (result.error) { res.status(503).json({ error: 'unavailable', reason: result.reason, how: result.how }); return }
    res.json({ ok: true, name, seq: result.seq, viewers: result.viewers })
  })

  router.delete('/out.jpg', (req, res) => {
    const name = readName(req, res)
    if (!name) return
    // Nothing is built to stop something that was never started: if no page has ever
    // sent a frame there is no sender, and saying so is the honest answer.
    const stopped = sendManager ? sendManager.stopOutput({ name }) : false
    noStore(res).json({ ok: true, stopped })
  })

  router.get('/api/still', async (req, res) => {
    const q = readQuery(req, res)
    if (!q) return
    let result
    try {
      result = await getManager().still({ name: q.name, maxWidth: q.maxWidth, bandwidth: q.bandwidth, waitMs: STILL_WAIT_MS })
    } catch (error) { refuse(res, error); return }
    noStore(res)
    if (result.error === 'unavailable') { res.status(503).json({ error: 'unavailable', reason: result.reason, how: result.how }); return }
    if (result.error) {
      res.status(504).json({ error: 'no picture', state: result.state || '', detail: result.detail || `no frame from "${q.name}" within ${STILL_WAIT_MS / 1000} s` })
      return
    }
    res.set('Content-Type', 'image/jpeg').set('Content-Length', String(result.jpeg.length)).end(result.jpeg)
  })

  router.get('/in.mjpg', async (req, res) => {
    const q = readQuery(req, res)
    if (!q) return
    const m = getManager()
    const status = await m.summary()
    if (!status.available) { noStore(res).status(503).json({ error: 'unavailable', reason: status.reason, how: status.how }); return }
    if (res.destroyed || req.destroyed) return

    const minGapMs = q.fps ? 1000 / q.fps : 0
    let lastWriteAt = 0
    let sub = null
    // Subscribing has to come BEFORE the headers, so a cap can still be answered with
    // 429 instead of a truncated 200. That leaves a window in which a frame could
    // arrive and write a part ahead of the headers — express would then flush its own
    // defaults and the stream would have no boundary. `streaming` closes the window,
    // so no future edit has to know that nothing may await between the two.
    let streaming = false
    const write = (frame) => {
      if (!streaming || res.destroyed || res.writableEnded) return
      const now = Date.now()
      // A little slack so "fps=30" of a 30 fps source does not alias down to 15.
      if (minGapMs && now - lastWriteAt < minGapMs * 0.85) return
      // A slow client never builds a queue: while its last frame is still in Node's
      // buffer the new one is dropped — the wall shows the present, late or not at all.
      if (res.writableLength > 0) return
      lastWriteAt = now
      res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.jpeg.length}\r\n\r\n`)
      res.write(frame.jpeg)
      res.write('\r\n')
    }
    try {
      sub = m.subscribe({ name: q.name, maxWidth: q.maxWidth, bandwidth: q.bandwidth, onFrame: write })
    } catch (error) { refuse(res, error); return }

    let left = false
    const leave = () => { if (!left) { left = true; sub.unsubscribe() } }
    req.on('close', leave)
    res.on('close', leave)
    res.on('error', leave)

    res.status(200).set({
      'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      'Cache-Control': 'no-store',
      Connection: 'close',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders()
    streaming = true
    // A receiver that is already running (a second viewer, a reload inside the linger)
    // has a picture in hand: show it now rather than after the next frame.
    const held = sub.receiver().lastFrame
    if (held && Date.now() - held.at < 1000) write(held)
  })

  router.use((_req, res) => res.status(404).json({ error: 'not found' }))

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)

  return {
    getManager,
    getSendManager,
    hasManager: () => manager !== null,
    hasSendManager: () => sendManager !== null,
    // The autoscan, switched on from index.js at boot (scanAtBootFrom). Builds the
    // manager — but the manager only forks when probeNdi() finds a runtime.
    startScan: () => getManager().startScan(),
    // Only a manager that was actually built is closed; asking never builds one.
    close: () => {
      if (manager) { manager.close(); manager = null }
      if (sendManager) { sendManager.close(); sendManager = null }
    }
  }
}

module.exports = { registerNdiRoutes, scanAtBootFrom, BOUNDARY }
