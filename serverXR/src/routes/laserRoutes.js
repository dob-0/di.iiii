const express = require('express')
const { requireLocalRuntime } = require('../localRuntimeGuard')

// The laser lane — serverXR/src/lighting/laser — at /laser on a LOCAL di.iiii, the
// lighting desk's rules: local runtime only (a hosted tier answers 404 through the
// guard), and nothing is built at boot — the UDP socket and the render loop start on
// the first request, and the output stays OFF until a page switches it on.
//
//   GET  /laser/api/state   what the lane and the cube are doing
//   POST /laser/api/update  { ip?, rate?, look?, on? } — also the page's heartbeat
//   POST /laser/api/off     OFF, from anywhere on this machine, no body needed
//   POST /laser/api/preview { look, t? } — the frame the cube would get, for the panel's
//                           picture; touches no cube and builds no lane
function registerLaserRoutes(app, { mountPaths = ['/laser'], log } = {}) {
  let lane = null
  const getLane = () => {
    if (lane) return lane
    const { createLaserLane } = require('../lighting/laser/lane')
    lane = createLaserLane({ log })
    // `di down` and systemd stop the server with SIGTERM, which ends the process
    // without an 'exit' — so the cube would never hear OFF. Only once a lane exists
    // (an install that never touched a laser keeps the default signal behaviour):
    // switch the cube off, give the packets 150 ms to leave, then exit as the signal
    // would have.
    for (const sig of ['SIGTERM', 'SIGINT']) {
      process.once(sig, () => {
        try { lane?.close() } catch { /* going down anyway */ }
        setTimeout(() => process.exit(sig === 'SIGINT' ? 130 : 143), 150)
      })
    }
    return lane
  }

  const router = express.Router()
  router.use(express.json({ limit: '64kb' }))
  router.get('/api/state', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    // Asking never builds the lane.
    res.json(lane ? lane.status() : { on: false, built: false })
  })
  router.post('/api/update', (req, res) => {
    try {
      res.json(getLane().update(req.body || {}))
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  })
  router.post('/api/preview', (req, res) => {
    const { renderFrame } = require('../lighting/laser/shapes')
    const t = Number(req.body?.t) || 0
    // 300 points is plenty to see the shape; [x, y, r, g, b] rounded to keep it small.
    const frame = renderFrame(req.body?.look || {}, t, 300)
    res.set('Cache-Control', 'no-store')
    res.json({ points: frame.map((p) => [p.x, p.y, p.r, p.g, p.b].map((v) => Math.round(v * 1000) / 1000)) })
  })
  router.post('/api/off', (_req, res) => {
    if (lane) lane.switchOff('switched off (/laser/api/off)')
    res.json(lane ? lane.status() : { on: false, built: false })
  })

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)

  // An orderly exit switches the cube off. A signal that ends the process without
  // 'exit' (kill -9) cannot; the lane's header says what that leaves.
  process.once('exit', () => { try { lane?.close() } catch { /* going down anyway */ } })

  return { getLane, hasLane: () => lane !== null, close: () => { if (lane) { lane.close(); lane = null } } }
}

module.exports = { registerLaserRoutes }
