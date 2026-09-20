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
// docs/architecture/NDI.md has the licence position: the runtime is installed by the
// person, never shipped. NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
const BOUNDARY = 'di-ndi-frame'
const NAME_MAX = 200
const WIDTH_MIN = 16
const WIDTH_MAX = 4096
const FPS_MIN = 1
const FPS_MAX = 60
const STILL_WAIT_MS = 3000

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

function registerNdiRoutes(app, { mountPaths = ['/ndi'], log = () => {}, createManager = null } = {}) {
  let manager = null
  const getManager = () => {
    if (manager) return manager
    const make = createManager || require('../ndi/manager').createNdiManager
    manager = make({ log })
    return manager
  }

  const router = express.Router()
  const noStore = (res) => res.set('Cache-Control', 'no-store')

  const refuse = (res, error) => {
    if (error && (error.code === 'cap-receivers' || error.code === 'cap-subscribers')) {
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

  router.get('/api/stats', (_req, res) => {
    noStore(res).json(getManager().stats())
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
    hasManager: () => manager !== null,
    // Only a manager that was actually built is closed; asking never builds one.
    close: () => { if (manager) { manager.close(); manager = null } }
  }
}

module.exports = { registerNdiRoutes, BOUNDARY }
