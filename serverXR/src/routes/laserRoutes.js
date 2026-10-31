const fs = require('fs')
const path = require('path')
const express = require('express')
const { requireLocalRuntime, requireSameMachine, requireOwnPage } = require('../localRuntimeGuard')

// THE STOPS — Disarm ({ armed: false }) and Blackout follow ONE rule. Whether a remote viewer may stop
// the lasers is the owner's open decision (ledger N644.2). Until he decides, both are local-only, as
// strict as Arm (requireSameMachine). true = both answer anyone the local runtime answers
// (requireLocalRuntime, mounted below). The one-line change is this constant.
const STOPS_FROM_REMOTE = false
const stopGate = STOPS_FROM_REMOTE ? (req, res, next) => next() : requireSameMachine

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
//   POST /laser/api/resolve    { ip, serial?, name?, out } — a Laser Out's address (2026-10-14): checked
//                              private unicast, asked the info question (0x77) unless the engine
//                              already hears it, added to laser.json and the running engine keyed by
//                              serial (no reload: the other cubes keep running), and given to that
//                              Out. status: answering | wrong-serial | no-answer | refused
//   POST /laser/api/arm        { armed, cube, out, confirm? } — ONE cube on or off; the phrase only
//                              on the first ON of a run (laserEngine.js rule 10)
//   POST /laser/api/show       { project, map?: { cubeId: groupId }, scale?, reloadMs? } — play that project's laser lines
//                              (`scale` 0.1…10: the picture zoomed about each cube's axis, or 'fit': each picture fills the cube's keep-in zone; what leaves the field is blanked)
//                              on the cubes by show time (laser/laserShow.js, 2026-10-17): the room's frames, the
//                              engine's guards; restarts a running show. 404 no such project, 400 nothing to play
//   POST /laser/api/show/stop  {} — the show player stops; its cubes go blank (a stop: STOPS_FROM_REMOTE)
//   POST /laser/api/show/still { project, map?, confirm: '<the sign-off phrase>' } — the laser safety officer approves
//                              the still beams that project's frames hold, per real cube: written to laser.json
//                              (stillBeams, kept with what was approved before) and the engine reloaded, DISARMED —
//                              arm again, then play. Without the phrase: 403 and the counts it would approve.
//   POST /laser/api/config     { cubes: [{ serial, ip, name }, …] } — write laser.json (laserConfig.js)
//                              and reload: the engine is disarmed and closed first, then rebuilt
//                              from the new file on the next request. No restart.
// THE LASER DESK (laser/laserDesk.js, 2026-10-29) — the light desk's twin for the cubes, one more sender (Out `desk`):
//   GET  /laser/               the desk's page (laser/ui/); its relative addresses reach both api/ and desk/api/
//   GET  /laser/desk/api/state the bank, the live look, master, BPM, blackout, each cube's desk setup and hold
//   GET  /laser/desk/api/view  what the engine keeps for each cube now (after the zone), rounded: the stage view
//   GET  /laser/desk/api/thumbs a small picture of every look, for the bank's tiles
//   POST /laser/desk/api/go    { look } — that look on the cubes        POST …/live { …fields } — edit the live look
//   POST /laser/desk/api/store { id?, name?, look? } — the live look (or the page's Preview) into its tile, or a new one
//   POST /laser/desk/api/looks/rename { id, name } · …/looks/delete { id } · …/looks/order { ids }
//   POST /laser/desk/api/looks/edit { id, …fields } — change a look of the bank (the cubes follow when it is on them)
//   POST /laser/desk/api/looks/copy { id } — a copy as a new tile after it · POST …/save {} — write desk.json now
//   POST /laser/desk/api/looks/paste { look, after? } — a copied look as a new tile · POST …/undo {} · …/redo {}
//   POST /laser/desk/api/palette { colours } — My colours, the whole list
//   POST /laser/desk/api/master { level } · …/bpm { bpm } | { tap: true } · …/cube { id, on?, flipX?, size?, x?, y?, order? }
//   POST /laser/desk/api/release {} · …/blackout { on } — stops: the STOPS_FROM_REMOTE gate, as /blackout
//   GET  /laser/lib/laser.js    the desk's drawing code for the page (window.DiLaser): its tiles play the looks
// The desk is built on its first request, never at boot, and a start finds it RELEASED: nothing on the cubes until a
// look is pressed. Its frames meet every rule of the engine (zone, guards, arming, one Out per cube) like any other.
// Who may call what (2026-10-14, review round 2): GET state and frames answer as before
// (requireLocalRuntime). EVERY POST first passes requireOwnPage: Host is one of this machine's own
// names and Origin (or Referer) is that same origin, so no other website and no rebound name can
// drive a cube. Arm, frame, alive, find and config then answer only a browser on this same machine
// with no proxy in between (requireSameMachine), unless DI_ALLOW_LAN_DEVICES=1. Disarm and blackout
// follow STOPS_FROM_REMOTE (above).
// How long a Laser Out's address check waits for the cube's answer.
const PROBE_WAIT_MS = 800

// GET /laser/lib/laser.js: shared/'s laser modules for the desk's page, which has no bundler. Each file runs in its own
// function as a CommonJS module; require('./x.cjs') between them resolves inside the script. Installs ship shared/
// (scripts/pack-runtime.mjs), so this works on an installed di as in a checkout.
const DESK_LIB_FILES = ['laserFrame.cjs', 'laserShapes.cjs', 'laserLook.cjs']
const buildDeskLib = () => {
  const dir = path.join(__dirname, '../../../shared')
  const defs = DESK_LIB_FILES.map((name) => `defs[${JSON.stringify(name)}] = function (module, exports, require) {\n${fs.readFileSync(path.join(dir, name), 'utf8')}\n}`)
  return [
    `// GENERATED by serverXR/src/routes/laserRoutes.js from shared/${DESK_LIB_FILES.join(', ')}.`,
    ';(() => {',
    'const defs = {}',
    'const cache = {}',
    "const req = (name) => { const key = name.replace(/^\\.\\//, ''); if (!cache[key]) { const module = { exports: {} }; cache[key] = module; defs[key](module, module.exports, req) } return cache[key].exports }",
    ...defs,
    "window.DiLaser = { ...req('laserShapes.cjs'), ...req('laserLook.cjs') }",
    '})()',
    '',
  ].join('\n')
}

function registerLaserRoutes(app, { dataDir, mountPaths = ['/laser'], log, engineOptions = {}, findCubes, probeCube, now = Date.now, loadDocument } = {}) {
  const laserDir = path.join(dataDir, 'laser')
  let engine = null
  const getEngine = () => {
    if (engine) return engine
    const { createLaserEngine } = require('../laser/laserEngine')
    engine = createLaserEngine({ dataDir: laserDir, log, ...engineOptions })
    return engine
  }
  // The show player (laser/laserShow.js): a project's laser lines on the cubes. It asks for the engine of the
  // moment on every tick, so a config reload (a new engine) does not stop the show.
  const { createShowPlayer } = require('../laser/laserShow')
  const player = createShowPlayer({ getEngine, loadDocument, now, log })
  // The desk (laser/laserDesk.js): built on its first request, and like the player it asks for the engine of the moment.
  let desk = null
  const getDesk = () => {
    if (desk) return desk
    const { createLaserDesk } = require('../laser/laserDesk')
    desk = createLaserDesk({ dataDir: laserDir, getEngine, now, log })
    return desk
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
  // The one cube at `ip`, asked once (the read-only 0x77), or null when nothing answered.
  const probe = probeCube || (async (ip) => {
    const out = await require('../laser/laserFind').sweep({ targets: [ip], gapMs: 0, waitMs: PROBE_WAIT_MS })
    if (!out.ok) throw new Error(out.error)
    return out.cubes[0] || null
  })
  let finding = null
  let lastFindAt = -Infinity

  const router = express.Router()
  router.use((req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? next() : requireOwnPage(req, res, next)))
  router.use(express.json({ limit: '512kb' }))
  router.get('/api/state', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ...getEngine().state(), show: player.state() }) })
  router.post('/api/show', requireSameMachine, async (req, res) => {
    const out = await player.start({ project: req.body?.project, map: req.body?.map, reloadMs: req.body?.reloadMs, scale: req.body?.scale, tween: req.body?.tween })
    res.status(out.ok ? 200 : out.status || 400).json({ ...out, show: player.state() })
  })
  router.post('/api/show/stop', stopGate, (req, res) => res.json({ ok: true, ...player.stop(), show: player.state() }))
  router.post('/api/show/still', requireSameMachine, async (req, res) => {
    const got = await player.resolve({ project: req.body?.project, map: req.body?.map, scale: req.body?.scale })
    if (!got.ok) return res.status(got.status || 400).json(got)
    const { stillBeams, ARM_PHRASE } = require('../laser/laserEngine')
    const { stillBeamsOfGroup } = require('../laser/laserShow')
    const perCube = got.map.map((m) => ({ cube: m.cube, group: m.group, stillBeams: stillBeamsOfGroup(m.lines, stillBeams, { scale: got.scale, zone: getEngine().state().zone, tween: req.body?.tween === true }) }))
    const counts = Object.fromEntries(perCube.map((p) => [p.cube, p.stillBeams.length]))
    if (req.body?.confirm !== ARM_PHRASE) {
      return res.status(403).json({ ok: false, needsPhrase: true, error: 'not approved: the laser safety officer\'s sign-off phrase is missing or wrong', project: got.project, wouldApprove: counts })
    }
    const { readRaw, writeConfig } = require('../laser/laserConfig')
    const config = readRaw(laserDir) || {}
    // No laser.json yet (the sim's six cubes): the file starts from the cubes the engine runs, so the approval has rows.
    if (!Array.isArray(config.cubes) || !config.cubes.length) {
      config.cubes = getEngine().state().cubes.map((c) => ({ id: c.id, ...(c.name ? { name: c.name } : {}), ...(c.ip ? { ip: c.ip } : {}), ...(c.serial ? { serial: c.serial } : {}) }))
    }
    const cubes = config.cubes
    const key = (b) => `${Math.round(b.x / 0.005)},${Math.round(b.y / 0.005)}`
    for (const p of perCube) {
      const c = cubes.find((x) => x && x.id === p.cube)
      if (!c) continue
      const kept = new Map((Array.isArray(c.stillBeams) ? c.stillBeams : []).filter((b) => Number.isFinite(Number(b?.x)) && Number.isFinite(Number(b?.y))).map((b) => [key(b), b]))
      for (const b of p.stillBeams) if (!kept.has(key(b))) kept.set(key(b), b)
      c.stillBeams = [...kept.values()]
    }
    let file
    try { file = writeConfig(laserDir, config) } catch (error) {
      return res.status(500).json({ ok: false, error: `laser.json could not be written: ${error.message}` })
    }
    const { wasArmed } = await reload()
    log?.warn?.(`[laser] still beams of "${got.project}" approved: ${perCube.map((p) => `${p.cube} ${p.stillBeams.length}`).join(', ')}; ${wasArmed ? 'DISARMED for the reload' : 'disarmed'}`)
    res.json({ ok: true, project: got.project, approved: counts, total: Object.fromEntries(cubes.map((c) => [c.id, (c.stillBeams || []).length])), file, disarmed: true, wasArmed, state: getEngine().state() })
  })
  router.get('/api/frames', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getEngine().frames()) })
  router.post('/api/frame', requireSameMachine, (req, res) => {
    const out = getEngine().setFrame(req.body?.cube, req.body?.points, req.body?.out ?? null)
    res.status(out.ok ? 200 : 400).json(out)
  })
  router.post('/api/alive', requireSameMachine, (req, res) => {
    const out = getEngine().alive(req.body?.cube, req.body?.out ?? null)
    res.status(out.ok ? 200 : 400).json(out)
  })
  router.post('/api/blackout', stopGate, (req, res) => res.json(getEngine().blackout()))
  // Arming is the strict gate; disarming is a stop and takes the stops' rule.
  router.post('/api/arm', (req, res, next) => (req.body?.armed === true ? requireSameMachine : stopGate)(req, res, next), (req, res) => {
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
  router.post('/api/resolve', requireSameMachine, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const { outAddressProblem } = require('../laser/laserFind')
    const ip = String(req.body?.ip ?? '').trim()
    const out = String(req.body?.out ?? '').slice(0, 120)
    const want = String(req.body?.serial ?? '').toLowerCase()
    if (!out) { res.status(400).json({ ok: false, status: 'refused', error: 'which Laser Out is asking (out) is missing' }); return }
    const problem = outAddressProblem(ip)
    if (problem) { res.status(400).json({ ok: false, status: 'refused', error: problem }); return }
    const engine = getEngine()
    let found = null
    const heard = engine.heardAt(ip)
    if (heard) found = { ...heard.info, ip }
    else {
      try {
        found = await probe(ip)
      } catch (error) {
        res.status(502).json({ ok: false, status: 'no-answer', error: error.message }); return
      }
    }
    if (!found?.serial) { res.json({ ok: false, status: 'no-answer', ip, error: `no cube answered at ${ip} — is it on, in Client mode, and on this network?` }); return }
    const about = { ip, serial: found.serial, modelName: found.modelName || 'LaserCube', firmware: found.firmware ?? null }
    if (want && want !== found.serial) {
      res.json({ ok: false, status: 'wrong-serial', ...about, expected: want, error: `the cube at ${ip} is serial ${found.serial}, not ${want}: another box has this address now. Find cubes again, or clear the serial to take this one.` }); return
    }
    // Another engine may have been built by a reload while the probe waited.
    const now2 = getEngine()
    const refused = now2.canTake({ serial: found.serial, ip, out })
    if (refused) { res.status(409).json({ ok: false, status: 'refused', ...about, error: refused }); return }
    const { upsertCube } = require('../laser/laserConfig')
    let saved
    try {
      saved = upsertCube(laserDir, { serial: found.serial, ip, name: req.body?.name })
    } catch (error) {
      res.status(500).json({ ok: false, status: 'refused', error: `laser.json could not be written: ${error.message}` }); return
    }
    if (!saved.ok) { res.status(400).json({ ok: false, status: 'refused', ...about, error: saved.error }); return }
    const added = now2.upsertCube(saved.cube, heard ? null : found.info || null, out)
    if (!added.ok) { res.status(400).json({ ok: false, status: 'refused', ...about, error: added.error }); return }
    const cube = now2.state().cubes.find((c) => c.id === added.id)
    res.json({ ok: true, status: 'answering', ...about, cube: { id: added.id, name: cube?.name, armed: Boolean(cube?.armed) }, droppedStillBeams: saved.dropped })
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
    if (saved.dropped?.length) log?.warn?.(`[laser] still beams NOT carried (matched by address, not serial; approve again): ${saved.dropped.map((d) => `${d.id} ${d.ip}`).join(', ')}`)
    res.json({ ok: true, disarmed: true, wasArmed, file: saved.file, cubes: saved.config.cubes, droppedStillBeams: saved.dropped || [], state: getEngine().state() })
  })

  // ---- the desk
  const answer = (res, out) => res.status(out.ok ? 200 : out.status || 400).json(out)
  router.get('/desk/api/state', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getDesk().state()) })
  router.get('/desk/api/view', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getDesk().view()) })
  router.get('/desk/api/thumbs', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(getDesk().thumbs()) })
  router.post('/desk/api/go', requireSameMachine, (req, res) => answer(res, getDesk().go(req.body?.look)))
  router.post('/desk/api/live', requireSameMachine, (req, res) => answer(res, getDesk().editLive(req.body || {})))
  router.post('/desk/api/store', requireSameMachine, (req, res) => answer(res, getDesk().store({ id: req.body?.id, name: req.body?.name, look: req.body?.look })))
  router.post('/desk/api/looks/rename', requireSameMachine, (req, res) => answer(res, getDesk().rename(req.body?.id, req.body?.name)))
  router.post('/desk/api/looks/edit', requireSameMachine, (req, res) => answer(res, getDesk().editLook(req.body?.id, req.body || {})))
  router.post('/desk/api/looks/copy', requireSameMachine, (req, res) => answer(res, getDesk().copyLook(req.body?.id)))
  router.post('/desk/api/looks/paste', requireSameMachine, (req, res) => answer(res, getDesk().pasteLook(req.body?.look, req.body?.after)))
  router.post('/desk/api/undo', requireSameMachine, (req, res) => answer(res, getDesk().undo()))
  router.post('/desk/api/redo', requireSameMachine, (req, res) => answer(res, getDesk().redo()))
  router.post('/desk/api/save', requireSameMachine, (req, res) => answer(res, getDesk().saveBank()))
  router.post('/desk/api/looks/delete', requireSameMachine, (req, res) => answer(res, getDesk().remove(req.body?.id)))
  router.post('/desk/api/looks/order', requireSameMachine, (req, res) => answer(res, getDesk().reorder(req.body?.ids)))
  router.post('/desk/api/palette', requireSameMachine, (req, res) => answer(res, getDesk().setPalette(req.body?.colours)))
  router.post('/desk/api/master', requireSameMachine, (req, res) => answer(res, getDesk().setMaster(req.body?.level)))
  router.post('/desk/api/bpm', requireSameMachine, (req, res) => answer(res, req.body?.tap ? getDesk().tap() : getDesk().setBpm(req.body?.bpm)))
  router.post('/desk/api/cube', requireSameMachine, (req, res) => answer(res, getDesk().setCube(req.body?.id, req.body || {})))
  router.post('/desk/api/release', stopGate, (req, res) => answer(res, getDesk().release()))
  router.post('/desk/api/blackout', stopGate, (req, res) => answer(res, getDesk().setBlackout(req.body?.on)))
  // The page: /laser → /laser/ (its addresses are relative), then the files of laser/ui/.
  router.get('/', (req, res, next) => {
    const [bare, query] = req.originalUrl.split('?')
    if (!bare.endsWith('/')) { res.redirect(302, bare + '/' + (query ? '?' + query : '')); return }
    next()
  })
  // The desk's own drawing code for the page (its tiles play the looks): shared/laserFrame.cjs, laserShapes.cjs and
  // laserLook.cjs, each wrapped as a CommonJS module in one plain script that sets window.DiLaser. Built once.
  let deskLib = null
  router.get('/lib/laser.js', (req, res) => {
    deskLib ??= buildDeskLib()
    res.set('Cache-Control', 'no-store')
    res.type('application/javascript').send(deskLib)
  })
  router.use(express.static(path.join(__dirname, '../laser/ui'), { index: 'index.html', maxAge: 0 }))

  for (const mount of mountPaths) app.use(mount, requireLocalRuntime, router)

  return {
    getEngine,
    getDesk,
    hasEngine: () => engine !== null,
    reload,
    // Every cube blanked and switched off, the socket closed; resolves when the messages have left.
    close: () => {
      if (desk) { desk.close(); desk = null }
      if (!engine) return Promise.resolve()
      player.stop()
      const going = engine.shutdown()
      engine = null
      return going
    }
  }
}

module.exports = { registerLaserRoutes }
