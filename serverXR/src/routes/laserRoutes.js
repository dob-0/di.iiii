const path = require('path')
const express = require('express')
const { requireLocalRuntime, requireSameMachine } = require('../localRuntimeGuard')

// One sweep at a time, and a pause after each: a sweep is 254 packets a network, and a button
// pressed twice must not make it 508 (laserFind.js).
const FIND_GAP_MS = 5000

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
//   POST /laser/api/find       {} — ask every address of this machine's IPv4 /24s the read-only info
//                              question (0x77) and list the cubes that answered (laserFind.js)
//   POST /laser/api/config     { cubes: [{ serial, ip, name }, …] } — write laser.json (laserConfig.js)
//                              and reload: the engine is disarmed and closed first, then rebuilt
//                              from the new file on the next request. No restart.
// Who may call what (2026-10-14): GET state and frames, and blackout, answer as before
// (requireLocalRuntime). Arm, frame, alive, find and config answer only a browser on this same
// machine with no proxy in between (requireSameMachine), unless DI_ALLOW_LAN_DEVICES=1.
function registerLaserRoutes(app, { dataDir, mountPaths = ['/laser'], log, engineOptions = {}, findCubes, now = Date.now } = {}) {
  const laserDir = path.join(dataDir, 'laser')
  let engine = null
  const getEngine = () => {
    if (engine) return engine
    const { createLaserEngine } = require('../laser/laserEngine')
    engine = createLaserEngine({ dataDir: laserDir, log, ...engineOptions })
    return engine
  }
  // Disarm, close and forget the engine; the next request builds it from laser.json again.
  const reload = async () => {
    const old = engine
    engine = null
    if (!old) return { wasArmed: false }
    const wasArmed = Boolean(old.state().armed)
    old.arm({ armed: false })
    await old.close()
    return { wasArmed }
  }
  const find = findCubes || ((opts) => require('../laser/laserFind').findCubes(opts))
  let finding = null
  let lastFindAt = -Infinity

  const router = express.Router()
  router.use(express.json({ limit: '512kb' }))
  router.get('/api/state', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getEngine().state()) })
  router.get('/api/frames', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getEngine().frames()) })
  router.post('/api/frame', requireSameMachine, (req, res) => {
    const out = getEngine().setFrame(req.body?.cube, req.body?.points)
    res.status(out.ok ? 200 : 400).json(out)
  })
  router.post('/api/alive', requireSameMachine, (req, res) => {
    const out = getEngine().alive(req.body?.cube)
    res.status(out.ok ? 200 : 400).json(out)
  })
  router.post('/api/blackout', (req, res) => res.json(getEngine().blackout()))
  router.post('/api/arm', requireSameMachine, (req, res) => {
    const out = getEngine().arm(req.body || {})
    res.status(out.ok ? 200 : 403).json(out)
  })
  router.post('/api/find', requireSameMachine, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const wait = lastFindAt + FIND_GAP_MS - now()
    if (finding || wait > 0) {
      const retryAfterMs = finding ? FIND_GAP_MS : Math.ceil(wait)
      res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
      res.status(429).json({ ok: false, error: finding ? 'a search is already running' : `searched a moment ago: try again in ${Math.ceil(wait / 1000)} s`, retryAfterMs })
      return
    }
    try {
      finding = Promise.resolve(find({}))
      const out = await finding
      res.status(out.ok ? 200 : 502).json(out)
    } catch (error) {
      res.status(500).json({ ok: false, error: `the search failed: ${error.message}` })
    } finally {
      finding = null
      lastFindAt = now()
    }
  })
  router.post('/api/config', requireSameMachine, async (req, res) => {
    const { saveCubes } = require('../laser/laserConfig')
    let saved
    try {
      saved = saveCubes(laserDir, req.body?.cubes)
    } catch (error) {
      res.status(500).json({ ok: false, error: `laser.json could not be written: ${error.message}` })
      return
    }
    if (!saved.ok) { res.status(400).json(saved); return }
    const { wasArmed } = await reload()
    log?.warn?.(`[laser] cubes set from the panel (${saved.config.cubes.map((c) => `${c.id} ${c.ip}`).join(', ')}); ${wasArmed ? 'DISARMED for the reload' : 'disarmed'}`)
    res.json({ ok: true, disarmed: true, wasArmed, file: saved.file, cubes: saved.config.cubes, state: getEngine().state() })
  })

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)

  return {
    getEngine,
    hasEngine: () => engine !== null,
    reload,
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
