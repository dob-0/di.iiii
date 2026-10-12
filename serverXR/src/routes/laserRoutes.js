const path = require('path')
const express = require('express')
const { requireLocalRuntime } = require('../localRuntimeGuard')

// The lasers — serverXR/src/laser — mounted at /laser on a LOCAL di.iiii (MOXIR's LaserCubes,
// 2026-10-05). The lighting desk's twin in shape (lightingRoutes.js): built on the first request,
// never at boot; loopback-only unless DI_ALLOW_LAN_DEVICES=1; 404 on a hosted tier. The engine is
// DISARMED at every start — nothing reaches a cube until someone arms it with the sign-off phrase.
//
//   GET  /laser/api/state      armed, sim, the zone, the guards, the cubes (each one's info from
//                              GET_FULL_INFO, its rate, armed or stopped and why)
//   GET  /laser/api/frames     the kept frames (the room's laser view, the editor's preview), and
//                              which cubes are stopped
//   POST /laser/api/frame      { cube: 'all' | id, points: [[x, y, r, g, b], …] }
//   POST /laser/api/alive      { cube: 'all' | id } — the editor still holds that frame (the
//                              signal-loss stop blanks a lit frame not refreshed in 200 ms)
//   POST /laser/api/blackout   {}
//   POST /laser/api/arm        { armed: true, confirm: '<the sign-off phrase>' } | { armed: false }
function registerLaserRoutes(app, { dataDir, mountPaths = ['/laser'], log } = {}) {
  let engine = null
  const getEngine = () => {
    if (engine) return engine
    const { createLaserEngine } = require('../laser/laserEngine')
    engine = createLaserEngine({ dataDir: path.join(dataDir, 'laser'), log })
    return engine
  }

  const router = express.Router()
  router.use(express.json({ limit: '512kb' }))
  router.get('/api/state', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getEngine().state()) })
  router.get('/api/frames', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getEngine().frames()) })
  router.post('/api/frame', (req, res) => {
    const out = getEngine().setFrame(req.body?.cube, req.body?.points)
    res.status(out.ok ? 200 : 400).json(out)
  })
  router.post('/api/alive', (req, res) => {
    const out = getEngine().alive(req.body?.cube)
    res.status(out.ok ? 200 : 400).json(out)
  })
  router.post('/api/blackout', (req, res) => res.json(getEngine().blackout()))
  router.post('/api/arm', (req, res) => {
    const out = getEngine().arm(req.body || {})
    res.status(out.ok ? 200 : 403).json(out)
  })

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)

  return {
    getEngine,
    hasEngine: () => engine !== null,
    // Every cube blanked and switched off, the socket closed; resolves when the messages have left.
    close: () => {
      if (!engine) return Promise.resolve()
      const going = engine.shutdown()
      engine = null
      return going
    }
  }
}

module.exports = { registerLaserRoutes }
