// THE LASER ENGINE — di's frames to MOXIR's LaserCubes (2026-10-05), safety first.
//
// The owner drives six LaserCube Ultra MK2 (10 W, class 4) live from the Nodes editor, not from the
// light desk. Frames (shared/laserFrame.cjs) come in over HTTP (laserRoutes.js); this engine keeps
// the latest one for all cubes and per cube, and — only when ARMED — streams them over UDP to the
// cubes (lasercubeProtocol.js) on a wired network.
//
// The rules that keep a class-4 laser from doing harm, in the order they apply:
//   1. DISARMED at every start. Nothing is sent to a cube — not a blank point — until someone arms,
//      and arming takes the exact sign-off phrase (ARM_PHRASE): the laser safety officer's
//      assessment comes first (IEC 60825-1; MOXIR's policy: owner sign-off owed). It is never
//      remembered across a restart.
//   2. The KEEP-IN ZONE, per cube, in the cube's own field (x, y -1…1): a point outside it is
//      blanked (colour 0) and pulled to its edge. The default keeps the upper half of the field
//      (y ≥ 0): with every cube aimed up into the roof (rig-lib laser-beside-lantern), no point of
//      a drawing can aim lower than the cube itself. Widen it only with the officer.
//   3. BLACKOUT clears every frame at once; DISARM switches every cube's output off (0x80 0).
//   4. Frames are only kept, never sent, without a configured cube address (sim): the room's laser
//      view and the editor's preview still show them. The guards below run in sim too, so a
//      rehearsal without cubes shows which cube would have been stopped and why.
//   5. A cube is armed only once it has ANSWERED: its GET_FULL_INFO (firmware, DAC rates, buffer,
//      temperature, serial, model) must have arrived. The info question (0x77) is the one thing
//      sent while disarmed — a read, no emission — once a second, so the info is there to arm on
//      and the editor can show it. Its maximum DAC rate is the ceiling the stream is paced to.
//   6. SIGNAL-LOSS STOP (the protocol spec's "safety timeouts"): while armed, a cube whose lit frame
//      has not been refreshed for FRAME_TIMEOUT_MS (a new frame, or the editor's keep-alive) is
//      blanked and sent output-off twice. A cube that has not been heard for LINK_LOST_MS is
//      stopped the same way and stays stopped until it is armed again.
//   7. STILL-BEAM GUARD (a software stand-in for scan-fail protection, which the maker documents
//      none of — lasers-exact.md §1): a frame whose lit beam does not move — every lit stretch of it
//      a dot inside STILL_WINDOW_DEG, or one spot taking at least half the frame's time — is a
//      still beam; held STILL_HOLD_MS it blanks the cube. The only still beams allowed are the ones
//      the laser safety officer lists for that cube in laser.json (stillBeams: MOXIR's design is two
//      static beams a cube, each ending on the stop). Thresholds and reasons at GUARD below —
//      UNVALIDATED until a real cube has been tested (checklist: PROGRESS.md, "LaserCube drive finished", 2026-10-09).
//   8. Server going down (SIGTERM, SIGINT, close): every addressed cube is blanked and sent
//      output-off twice before the socket closes (shutdown()).
//   9. THE GALVO AND POWER GUARDS (laserGuards.js, 2026-10-14): every frame, whatever sent it, is
//      step-limited, corner-held, dwelt and blank-delayed for the cube's rate before it streams; a
//      new frame is reached by a blank, step-limited bridge; colour is scaled down from 60 °C to
//      50 % at 75 °C (averaged); every stop — no frame, still beam, link lost, disarm, shutdown —
//      clears the cube's ring buffer (0x8d), walks the beam blank to the centre and parks it, then
//      output-off; a resume clears the buffer before output-on. The still-beam guard (7) stops a frame
//      that is still as posted OR as optimised. Round 2 (review of PR #931): the path work runs once
//      per posted frame (shared by cubes at the same rate), not in the tick; a frame longer than the
//      frame budget (67 ms of points at the cube's rate, ≤ its buffer) is refused (frame-too-long);
//      a dark frame cuts the lit pass at once; the path is planned at the rate the cube says it
//      plays; the cube's over-temperature flag stops it, its warning drops the power to the minimum.
//  10. ONE LASER OUT PER CUBE, ARMED ONE BY ONE (2026-10-14, the TouchDesigner-style Laser Out): each
//      Out names its cube by address; the server checks the address answers the info question
//      (0x77), adds the cube keyed by serial (upsertCube) and gives that Out the cube (a claim,
//      CLAIM_TTL_MS, renewed by its frames, keep-alives and checks). Another Out's frames, arm or
//      address on a claimed cube are refused. arm({ cube }) switches ONE cube on or off; the sign-off
//      phrase is asked on the first ON of a run (after a start, a reload or a disarm-all) and the
//      run stays signed off until the next disarm-all. Every guard above applies per cube as before.
// What software cannot do, said plainly: a galvo that stalls while a figure is being sent is a
// still beam the server never sees (it only knows what it commanded); a server killed with -9, or a
// cable pulled, leaves the cube to its own firmware, whose behaviour when the stream stops is not
// documented. The key switch, the interlock loop and the E-stops are the stops that always work.
//
// Config (optional): <dataDir>/laser/laser.json
//   { "cubes": [{ "id": "cube-1", "name": "Cut 1", "ip": "192.168.1.51",
//                 "stillBeams": [{ "x": -0.2, "y": 0.4, "within": 0.01 }] }, …],
//     "zone": { "xMin": -1, "xMax": 1, "yMin": 0, "yMax": 1 }, "dacRate": 30000,
//     "guards": { "litStep": 0.025, … } }   (and per cube "guards": {…}; keys: laserGuards.js)
//   stillBeams  the still beams the officer approved for this cube, in the cube's field (x, y -1…1),
//               each allowed to wander `within` (field units, default 0.01) of its point
//   dacRate     optional REQUEST for the cube's points per second, sent as SET_RATE only with
//               guards.sendSetRate; di always plans and paces at the rate the cube's own info says it
//               plays (never above its maximum), and shows rateMismatch when the two differ
//   "stopResume": "person" (default) | "legacy" — after a still-beam, frame-too-long or over-temperature stop the cube
//   stays dark until a person: Off then On, On, or a new Go (a frame posted with go: true); either way only a NEW frame that passes the guards lights it; after a no-frame stop it resumes by itself
//   within 2 s for the same Out, else it is disarmed. "legacy" is the old rule (any fresh frame resumes). Stage audit 2026-10-30, row 34.
// No file: six cubes cube-1…cube-6 without addresses (the rig's six), sim.
'use strict'

const fs = require('fs')
const path = require('path')
const dgram = require('dgram')
const { ALL_CUBES, normaliseFramePoints } = require('../../../shared/laserFrame.cjs')
const proto = require('./lasercubeProtocol')
const guardsLib = require('./laserGuards')

const ARM_PHRASE = 'the laser safety officer has signed off'
const DEFAULT_ZONE = Object.freeze({ xMin: -1, xMax: 1, yMin: 0, yMax: 1 })
const DEFAULT_CUBES = Object.freeze(Array.from({ length: 6 }, (_, i) => ({ id: `cube-${i + 1}`, name: `Cube ${i + 1}`, ip: null })))
const TICK_MS = 20
const BUFFER_MARGIN = 200
// The longest stretch of missed time a tick makes up (a stall past it is dropped, not banked).
const CATCH_UP_MAX_MS = 100
// How far ahead the engine keeps a cube's ring buffer filled, in ms of playing time. The first stream
// after a clear PRIMES the buffer this far (not one tick), so a late tick eats the cushion instead of
// starving the cube; the cap in stream() keeps it from growing past it. A frame change or a dark
// frame waits behind what is queued (up to LEAD_MS, 40 ms more than today's 20 ms), but a BLACKOUT,
// a disarm and every stop clear the buffer and send output-off at once, so the cushion holds no light
// after them. Measured on the studio Mac (fake cube, 3 runs a value, rehearsal bars 29 500 pts/s and
// <= 0.5 % missing, ledger N1545): with the priming 40 ms failed 1 of 3 runs, 60 ms 3 of 3 (8 of 8 in a
// second set), 80 ms 3 of 3; without it no value 40-120 passed (the misses were ticks of 26-46 ms
// against a 20 ms queue, not stalls longer than the lead). So 60 is the smallest that passes.
const LEAD_MS = 60
const INFO_POLL_MS = 1000
const SHUTDOWN_WAIT_MS = 250
// A Laser Out holds its cube while it says so (frame, keep-alive, its 3-second check): 10 s of silence
// (the editor closed, the tab gone) frees the cube for another Out.
const CLAIM_TTL_MS = 10000
// A dark frame (or no frame at all since On) nobody refreshes for this long: the cube is switched Off (review E2, R2),
// in darkOff 'auto' only. In 'never' (the product's default since 2026-10-31, N1591) it stays On and dark until a person's Off.
const DARK_IDLE_MS = 5000
// A Go counts at most once per this long per Out (review E4).
const GO_GAP_MS = 500
// After a no-frame stop the cube may light again by itself only inside this window, and only for the
// Out (claim holder) whose frame was playing when it stopped; later it is disarmed (stage audit row 34).
// laser.json "stopResume": "person" (default) | "legacy" (the old rule: any fresh frame resumes any stop).
const RESUME_WINDOW_MS = 2000
// Stops that leave the cube dark until a person switches it Off and On, presses On or sends a new Go.
// (over-temperature is also here for state().needsPerson; the tick disarms that cube before the resume branch is reached.)
const DARK_UNTIL_PERSON = new Set(['still-beam', 'frame-too-long', 'over-temperature'])

// THE GUARDS' NUMBERS — chosen 2026-10-09 against ~/work/agent-reports-2026-10-09/devices/lasers-exact.md.
// All UNVALIDATED until tested on a real cube (the checklist: PROGRESS.md, "LaserCube drive finished", 2026-10-09).
//
// FRAME_TIMEOUT_MS 200: the stop must be complete inside the 0.25 s exposure time the visible MPE is
//   written for (IEC 60825-1 Table A.1, H = 18 t^0.75 J/m², the aversion time base; report §2.1).
//   200 ms + one 20 ms tick + the loopback/LAN hop stays under 250 ms. The editor keeps a held frame
//   alive every 50 ms (LaserOutPanelWindow.jsx), so three missed keep-alives in a row are tolerated.
//   It is NOT a claim that 0.25 s in a 6 W beam is safe — at 61 m it is still 71× the MPE (report
//   §2.3); the separation and the stops are the control. It bounds how long a lost editor can leave
//   a drawing up.
// LINK_LOST_MS 3000: the cube answers every data message (0x78 on) and the info question every
//   second; three missed info answers with no data answers either is a dead link, not packet loss.
// STILL_WINDOW_DEG 0.6: a lit stretch that stays inside 0.6° (±0.3°) is a dot, not a stroke. The
//   report itself counts a beam held to ±0.3° as STATIC for its safety maths (report §2.3: "static
//   (held to ±0.3°), so the static NOHD is the right quantity"), so this guard calls still exactly
//   what the report calls static. In numbers: a dot wandering 0.6° (10.5 mrad) still gives an eye
//   20 m away at least (4 + 20 + 7) mm / (10.5 mrad × 20 m) ≈ 15 % of the static beam's dose (beam
//   4 mm + 1 mrad·r, 7 mm pupil, report §2.4), and the static 6 W beam is 71× the 0.25 s MPE at 61 m.
// SCAN_HALF_ANGLE_DEG 18.5: the maker's ">37°" scan angle read as ±18.5° (report §1, ASSUMPTION).
//   The smaller angle is the safe side here: the same window in degrees is a wider window in field
//   units, so more frames count as still. (The scene's laser view assumes ±30° — laserView.js — for the look.)
// STILL_DWELL_SHARE 0.5: a frame that parks the beam in one 0.6° window for half its time puts at
//   least half the cube's power (3 W of a 6 W cube) there without a break — a still beam inside a
//   figure. Measured 2026-10-09 on the Laser node's own eight shapes (laserShapes.js, 120 and 500
//   points, the default zone; laser.test.js keeps it): the most any shape puts in one window is
//   5.9 % at size 0.5 (the default), 21.0 % at 0.1, 39.7 % at 0.05 (all the fan's centre). From
//   size 0.03 (a figure about 1.1° across) the fan, line, star and spiral pass 50 %; at 0.01 every
//   shape is a dot. A shape that small is a still beam to anyone in it.
// STILL_HOLD_MS 200: the same 0.25 s base as the frame timeout; it lets a shape pass through a
//   point (a size knob swept through zero lasts a frame or two at 25 frames/s) without a stop. It
//   counts from the first tick that sees the still frame (≤ 20 ms after it arrives): ≤ 220 ms + the
//   hop from a still frame arriving to the blank.
const GUARD = Object.freeze({
    FRAME_TIMEOUT_MS: 200,
    LINK_LOST_MS: 3000,
    STILL_WINDOW_DEG: 0.6,
    SCAN_HALF_ANGLE_DEG: 18.5,
    STILL_DWELL_SHARE: 0.5,
    STILL_HOLD_MS: 200,
    DEFAULT_STILL_WITHIN: 0.01,
    VALIDATED: false
})
const STILL_WINDOW_FIELD = GUARD.STILL_WINDOW_DEG / GUARD.SCAN_HALF_ANGLE_DEG
const STOP = Object.freeze({ NO_INFO: 'no-info', NO_FRAME: 'no-frame', STILL_BEAM: 'still-beam', LINK_LOST: 'link-lost', FRAME_TOO_LONG: 'frame-too-long', OVER_TEMPERATURE: 'over-temperature' })
const STOP_TEXT = Object.freeze({
    [STOP.NO_INFO]: 'not armed: the cube never answered the info question',
    [STOP.NO_FRAME]: `stopped: no frame for ${GUARD.FRAME_TIMEOUT_MS} ms`,
    [STOP.STILL_BEAM]: `stopped: a still beam held ${GUARD.STILL_HOLD_MS} ms — send a new Go, or press On (it lights again on the next frame that passes)`,
    [STOP.LINK_LOST]: `stopped: the cube went silent for ${GUARD.LINK_LOST_MS / 1000} s — arm again`,
    [STOP.FRAME_TOO_LONG]: `stopped: the frame needs more points than one pass may take (${Math.round(guardsLib.FRAME_MAX_MS)} ms at the cube's rate) once the galvo guards are in — simplify it, then send a new Go or press On`,
    [STOP.OVER_TEMPERATURE]: 'stopped: the cube reports over-temperature — let it cool, then arm again'
})
// Why the ENGINE itself switched a cube Off (not a stop: an Off is never resumed, a person presses On). Kept on the cube
// and said on the desk until its next On (N1585, 2026-10-31: an On with nothing live went off after 5 s, unexplained).
const OFF = Object.freeze({ DARK_IDLE: 'dark-idle', OUT_LET_GO: 'out-let-go' })
const OFF_TEXT = Object.freeze({
    [OFF.DARK_IDLE]: `Off: it had nothing to draw for ${DARK_IDLE_MS / 1000} s`,
    [OFF.OUT_LET_GO]: 'Off: the Out that held it stopped sending'
})

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0

/** A zone from config, every edge a number in -1…1, min ≤ max; anything else falls back to the default edge. Pure. */
const normaliseZone = (zone = {}) => {
    const edge = (k) => (Number.isFinite(Number(zone?.[k])) ? clampTo(Number(zone[k]), -1, 1) : DEFAULT_ZONE[k])
    const z = { xMin: edge('xMin'), xMax: edge('xMax'), yMin: edge('yMin'), yMax: edge('yMax') }
    if (z.xMin > z.xMax) [z.xMin, z.xMax] = [DEFAULT_ZONE.xMin, DEFAULT_ZONE.xMax]
    if (z.yMin > z.yMax) [z.yMin, z.yMax] = [DEFAULT_ZONE.yMin, DEFAULT_ZONE.yMax]
    return z
}

/**
 * The keep-in zone applied: a point outside is pulled to the edge and blanked. Pure.
 * @returns {{ points: number[][], blanked: number }}
 */
const applyZone = (points, zone) => {
    let blanked = 0
    const out = points.map(([x, y, r, g, b]) => {
        const inside = x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax
        if (inside) return [x, y, r, g, b]
        if (r > 0 || g > 0 || b > 0) blanked += 1
        return [clampTo(x, zone.xMin, zone.xMax), clampTo(y, zone.yMin, zone.yMax), 0, 0, 0]
    })
    return { points: out, blanked }
}

/**
 * Dwell: every window (window × window, field units) whose lit points take at least `minShare` of
 * the frame's points — of its time, since the scanner spends one sample period on each point.
 * Found on a grid of half-window cells summed 2 × 2, so a dot up to half a window across always
 * lands whole in one window, and no two points farther apart than a window's diagonal are ever
 * counted together. One pass, O(points). Pure.
 * @returns {{ x: number, y: number, share: number }[]}  each spot's lit centroid and share, largest first
 */
const dwellSpots = (points, { window = STILL_WINDOW_FIELD, minShare = GUARD.STILL_DWELL_SHARE } = {}) => {
    const total = points.length
    if (!total) return []
    const h = window / 2
    const cells = new Map()
    for (const p of points) {
        if (!isLit(p)) continue
        const i = Math.floor(p[0] / h)
        const j = Math.floor(p[1] / h)
        const key = `${i},${j}`
        const cell = cells.get(key) || { i, j, n: 0, sx: 0, sy: 0 }
        cell.n += 1
        cell.sx += p[0]
        cell.sy += p[1]
        cells.set(key, cell)
    }
    const out = []
    const seen = new Set()
    for (const { i, j } of cells.values()) {
        for (const ai of [i - 1, i]) {
            for (const aj of [j - 1, j]) {
                const anchor = `${ai},${aj}`
                if (seen.has(anchor)) continue
                seen.add(anchor)
                let n = 0
                let sx = 0
                let sy = 0
                for (const key of [`${ai},${aj}`, `${ai + 1},${aj}`, `${ai},${aj + 1}`, `${ai + 1},${aj + 1}`]) {
                    const c = cells.get(key)
                    if (c) { n += c.n; sx += c.sx; sy += c.sy }
                }
                if (n > 0 && n / total >= minShare) out.push({ x: sx / n, y: sy / n, share: n / total })
            }
        }
    }
    // Overlapping windows see the same spot: keep the largest, drop any within a window of a kept one.
    const kept = []
    for (const spot of out.sort((a, b) => b.share - a.share)) {
        if (!kept.some((k) => Math.abs(k.x - spot.x) < window && Math.abs(k.y - spot.y) < window)) kept.push(spot)
    }
    return kept
}

/**
 * The frame's still beams, [] when its beam moves. Two ways a frame holds a beam still:
 *   dots   every lit stretch (consecutive lit points; the frame loops, so the last joins the first)
 *          stays inside one window — the frame is made of dots only: one still beam, or a few
 *   dwell  one window takes at least STILL_DWELL_SHARE of the frame's time, whatever else is drawn
 * Pure.
 * @returns {{ x: number, y: number, share: number, kind: 'dot' | 'dwell' }[]}
 */
const stillBeams = (points, { window = STILL_WINDOW_FIELD } = {}) => {
    const total = points.length
    if (!total || !points.some(isLit)) return []
    const runs = []
    let run = null
    for (const p of points) {
        if (!isLit(p)) { run = null; continue }
        if (!run) { run = { xMin: p[0], xMax: p[0], yMin: p[1], yMax: p[1], n: 0, sx: 0, sy: 0 }; runs.push(run) }
        run.xMin = Math.min(run.xMin, p[0]); run.xMax = Math.max(run.xMax, p[0])
        run.yMin = Math.min(run.yMin, p[1]); run.yMax = Math.max(run.yMax, p[1])
        run.n += 1; run.sx += p[0]; run.sy += p[1]
    }
    if (runs.length > 1 && isLit(points[0]) && isLit(points[total - 1])) {
        const [first] = runs
        const last = runs.pop()
        first.xMin = Math.min(first.xMin, last.xMin); first.xMax = Math.max(first.xMax, last.xMax)
        first.yMin = Math.min(first.yMin, last.yMin); first.yMax = Math.max(first.yMax, last.yMax)
        first.n += last.n; first.sx += last.sx; first.sy += last.sy
    }
    const dot = (r) => r.xMax - r.xMin < window && r.yMax - r.yMin < window
    if (runs.every(dot)) return runs.map((r) => ({ x: r.sx / r.n, y: r.sy / r.n, share: r.n / total, kind: 'dot' }))
    return dwellSpots(points, { window }).map((s) => ({ ...s, kind: 'dwell' }))
}

const normaliseStillBeams = (list) => (Array.isArray(list) ? list : [])
    .map((b) => ({ x: Number(b?.x), y: Number(b?.y), within: Number(b?.within) > 0 ? Math.min(Number(b.within), 0.1) : GUARD.DEFAULT_STILL_WITHIN }))
    .filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y))

// An address laser.json gives that cannot be one cube (broadcast, network, multicast, loopback:
// laserFind.js cubeAddressProblem) is not used: the cube has no address and the reason is in state.
// A serial, when the file has one, is checked against what the box at that address answers.
const cubeFrom = (c, i, base = guardsLib.DEFAULT_GUARDS) => {
    const given = typeof c?.ip === 'string' && c.ip ? c.ip : null
    const problem = given ? require('./laserFind').cubeAddressProblem(given) : null
    const serial = String(c?.serial || '').toLowerCase()
    return {
        id: String(c?.id || `cube-${i + 1}`),
        name: String(c?.name || c?.id || `Cube ${i + 1}`),
        ip: problem ? null : given,
        addressRefused: problem,
        serial: /^[0-9a-f]{12}$/.test(serial) ? serial : null,
        stillBeams: normaliseStillBeams(c?.stillBeams),
        guards: guardsLib.normaliseGuards(c?.guards, base)
    }
}

// The officer approved a cube's still beams for ONE box. When laser.json names its serial and the box
// answering that address reports another one (DHCP gave the address to another cube), none apply.
const serialMismatch = (c) => Boolean(c.serial && c.info?.serial && String(c.info.serial).toLowerCase() !== c.serial)
const approvedStill = (c) => (serialMismatch(c) ? [] : c.stillBeams)

const readConfig = (dir) => {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, 'laser.json'), 'utf8'))
        const base = guardsLib.normaliseGuards(raw.guards)
        const list = Array.isArray(raw.cubes) && raw.cubes.length ? raw.cubes : DEFAULT_CUBES
        const cubes = list.map((c, i) => cubeFrom(c, i, base))
        return { cubes, zone: normaliseZone(raw.zone), dacRate: Number(raw.dacRate) > 0 ? Number(raw.dacRate) : null, guards: base, stopResume: raw.stopResume === 'legacy' ? 'legacy' : 'person' }
    } catch {
        return { cubes: DEFAULT_CUBES.map((c, i) => cubeFrom(c, i)), zone: normaliseZone(), dacRate: null, guards: guardsLib.DEFAULT_GUARDS, stopResume: 'person' }
    }
}

/** Info a cube can be armed on: a maximum DAC rate that is a real number of points a second. */
const infoUsable = (info) => Boolean(info) && info.maxDacRate > 0 && info.maxDacRate <= 1000000

/**
 * @param {{ dataDir: string, createSocket?: () => object, now?: () => number, log?: object,
 *   setInterval?: Function, clearInterval?: Function, setTimeout?: Function }} opts
 */
const createLaserEngine = ({
    dataDir,
    createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }),
    now = Date.now,
    log = console,
    setInterval: every = setInterval,
    clearInterval: stopEvery = clearInterval,
    setTimeout: later = setTimeout,
    // How a run is signed off before the first On (owner 2026-10-30/31: "delete the sign-off thing"):
    //   'click'  (the product's default since 2026-10-31) On is the person's yes; no phrase is typed.
    //   'phrase' the older mode, kept (rule: nothing we have is ever lost): the first On of a run takes
    //            ARM_PHRASE typed exactly. The server picks it with DI_LASER_SIGN_OFF=phrase.
    signOff = 'phrase',
    // What a cube On with nothing to draw does (owner 2026-10-31 16:1x, N1591: "delete all that safety things"):
    //   'auto'  the older rule, kept (rule: nothing we have is ever lost) and the library default: nothing lit and nobody
    //           refreshing for DARK_IDLE_MS switches the cube Off (review E2, R2). The server picks it with DI_LASER_DARK_OFF=auto.
    //   'never' (the product's default since 2026-10-31) On stays On, armed and drawing nothing (blank points only), until
    //           a person presses Off, Disarm all or Blackout, or another guard stops it. An Out that lets go still switches Off.
    darkOff = 'auto'
} = {}) => {
    if (signOff !== 'click' && signOff !== 'phrase') throw new Error(`laser engine: signOff must be 'click' or 'phrase', not ${JSON.stringify(signOff)}`)
    if (darkOff !== 'auto' && darkOff !== 'never') throw new Error(`laser engine: darkOff must be 'auto' or 'never', not ${JSON.stringify(darkOff)}`)
    const phraseNeeded = () => signOff === 'phrase'
    const config = readConfig(dataDir)
    for (const c of config.cubes) if (c.addressRefused) log?.warn?.(`[laser] ${c.id}: laser.json address not used: ${c.addressRefused}`)
    const liveEntry = (c) => ({
        ...c,
        lastFrameAt: null,
        offBy: null,
        info: null, infoAt: null, heardAt: null,
        bufferFree: null, bufferAt: null, sentSince: 0, streamAt: null, streamCarry: 0,
        playing: null, index: 0, message: 0, frameNum: 0, lastPoint: [0, 0],
        armed: false, stop: null, stillSince: null,
        pointLoss: { blanked: 0, dropped: 0, blankedTotal: 0, droppedTotal: 0, frames: 0 },
        prep: null, playingPrep: null, guardsKey: JSON.stringify(c.guards), clearAt: null, clearConfirmed: false,
        temp: guardsLib.createTempAverager({ samples: c.guards.tempSamples, periodMs: c.guards.tempPeriodMs }),
        stops: { [STOP.NO_FRAME]: 0, [STOP.STILL_BEAM]: 0, [STOP.LINK_LOST]: 0, [STOP.FRAME_TOO_LONG]: 0, [STOP.OVER_TEMPERATURE]: 0 }
    })
    const live = new Map(config.cubes.map((c) => [c.id, liveEntry(c)]))
    const frames = { all: null, byCube: new Map() }
    let blackouts = 0 // how many times Blackout was pressed: the desk latches when this rises (review 1218 S1)
    let armed = false
    let darkLatch = false // the desk's Blackout in keep-arm mode: every armed cube plays blank, nobody's frame lights it, the arm stays (review R5)
    // Signed off for this run: the phrase was typed since the engine started or the last disarm-all.
    // Never written anywhere, never survives a restart (rule 1).
    let signedOff = false
    // cube id -> { out, at }: which Laser Out sends to that cube (rule 10).
    const claims = new Map()
    let socket = null
    let timer = null
    let infoTimer = null
    const sim = () => ![...live.values()].some((c) => c.ip)

    const send = (cube, buf, port, done) => {
        if (!socket || !cube.ip) { done?.(); return }
        try { socket.send(buf, port, cube.ip, () => done?.()) } catch (error) { log?.warn?.(`[laser] send to ${cube.ip}: ${error.message}`); done?.() }
    }
    const onMessage = (msg, rinfo) => {
        const info = proto.parseFullInfo(msg)
        const free = info ? null : proto.parseBufferFree(msg)
        const t = now()
        for (const c of live.values()) {
            if (c.ip !== rinfo?.address) continue
            c.heardAt = t
            if (info) { c.info = info; c.infoAt = t }
            if (free !== null) { c.bufferFree = free; c.bufferAt = t; c.sentSince = 0 }
            if (free !== null && msg[0] === proto.CMD.GET_BUFFER_FREE && c.clearAt !== null && t >= c.clearAt) c.clearConfirmed = true
        }
    }
    const askInfo = () => { for (const c of live.values()) send(c, proto.getFullInfo(), proto.PORT.CMD) }
    const openSocket = () => {
        if (socket || sim()) return
        socket = createSocket()
        socket.on?.('message', onMessage)
        socket.on?.('error', (error) => log?.warn?.(`[laser] socket: ${error.message}`))
        socket.bind?.(0)
        // A restart may leave a cube emitting from before it: off is always allowed, so every addressed
        // cube is told output-off twice before anything else (stage audit row 8).
        for (const c of live.values()) { send(c, proto.setOutput(false), proto.PORT.CMD); send(c, proto.setOutput(false), proto.PORT.CMD) }
        // The one thing sent while disarmed: the info question, now and every second.
        askInfo()
        infoTimer = every(askInfo, INFO_POLL_MS)
        infoTimer?.unref?.()
    }
    const framesFor = (id) => frames.byCube.get(id) || frames.all
    const claimOf = (id, t = now()) => {
        const claim = claims.get(id)
        return claim && t - claim.at <= CLAIM_TTL_MS ? claim : null
    }
    // Another Out holds this cube: the refusal's words, or null. A request without an Out (the
    // panel's old cube input, a script) is "another" too once an Out holds the cube.
    const heldByOther = (id, out) => {
        const claim = claimOf(id)
        if (!claim || (out && claim.out === String(out))) return null
        const c = live.get(id)
        return `${c?.name || id} (${id}${c?.ip ? ` at ${c.ip}` : ''}) is already driven by another Laser Out — one Out per cube. Give this Out another cube's address, or delete the other Out.`
    }
    const touchClaim = (id, out) => { if (out && live.has(id) && !heldByOther(id, out)) claims.set(id, { out: String(out), at: now() }) }

    // The rate the cube PLAYS (round 2, review §6): its last info answer (info.dacRate), never above
    // its maximum. laser.json's dacRate is a REQUEST: sent as SET_RATE only with guards.sendSetRate,
    // and it counts only once the cube's own answer says it plays it. Planning at a rate the cube
    // does not play would run the galvos faster than the step limit.
    const rateOf = (c) => {
        if (!infoUsable(c.info)) return null
        return Math.min(c.info.dacRate || c.info.maxDacRate, c.info.maxDacRate)
    }
    const rateMismatch = (c) => Boolean(config.dacRate && rateOf(c) && rateOf(c) !== Math.min(config.dacRate, c.info.maxDacRate))
    // The rate a cube's path is planned at: the rate it plays, or (sim, no info yet) laser.json's
    // dacRate, or the 30 kpps the guards were tuned at.
    const planRate = (c) => rateOf(c) || config.dacRate || guardsLib.REFERENCE_RATE
    const planOf = (c) => guardsLib.pathPlan(c.guards, planRate(c))
    const budgetOf = (c, rate) => guardsLib.frameBudget(rate, c.info?.rxBufferSize || null, BUFFER_MARGIN)
    // The frame as this cube will draw it (laserGuards.js), its still beams judged on that, and
    // whether it fits the frame budget. Worked out ONCE per posted frame for each (guards, rate,
    // budget), shared by every cube with the same, and kept on the frame (round 2, review §2): the
    // work happens when a frame is posted (setFrame), the tick only looks it up.
    const prepare = (c, frame) => {
        if (!frame) return null
        const rate = planRate(c)
        const budget = budgetOf(c, rate)
        const key = `${c.guardsKey}|${rate}|${budget}`
        let prep = frame.preps.get(key)
        if (!prep) {
            const plan = guardsLib.pathPlan(c.guards, rate)
            const opt = guardsLib.optimisePath(frame.points, plan, budget)
            prep = { key, rate, budget, plan, points: opt.points, overBudget: opt.overBudget, stats: opt.stats, still: opt.points ? stillBeams(opt.points) : [] }
            frame.preps.set(key, prep)
        }
        c.prep = prep
        return prep
    }
    const allowed = (c, spot) => approvedStill(c).some((b) => Math.hypot(spot.x - b.x, spot.y - b.y) <= b.within)
    // Still if EITHER the frame as posted OR as optimised is still (round 2, review §3): the
    // optimiser turns the move into a dot into a lit line and adds blank holds to the frame's time,
    // so the optimised list alone let a dot through that the raw frame shows plainly. Never looser
    // than the guard before the optimiser.
    const stillOf = (c, frame) => {
        if (!frame) return []
        const prep = prepare(c, frame)
        return [...frame.rawStill, ...(prep?.still || [])].filter((s) => !allowed(c, s))
    }
    // Brightness: the averaged-temperature limiter, and the cube's own temperature warning (byte 5)
    // takes it straight to the limiter's minimum.
    const powerOf = (c) => {
        const scale = guardsLib.powerScale(c.temp.average(), c.guards)
        return c.info?.temperatureWarning ? Math.min(scale, c.guards.tempMinScale) : scale
    }

    // The ring buffer cleared (CLEAR_RINGBUFFER 0x8d, twice): what was queued before a stop must not
    // play when the output comes back. The free count is full again.
    // Round 3 (re-review R2-1): the clear goes to the command port and the stream to the data port,
    // and UDP keeps no order between the two — a data message the cube takes BEFORE the clear would
    // lose its blank bridge to the clear, and the next one would jump lit from the park. So after a
    // clear nothing streams until the cube has answered a buffer-free question asked after it (0x8a,
    // on the same command port, so behind the clear) or, failing an answer, a whole tick later; and
    // the first data after a clear always starts a fresh pass with the blank bridge from where the
    // beam was parked.
    const clearBuffer = (c, t) => {
        send(c, proto.clearRingBuffer(), proto.PORT.CMD)
        send(c, proto.clearRingBuffer(), proto.PORT.CMD)
        send(c, proto.getBufferFree(), proto.PORT.CMD)
        if (c.info?.rxBufferSize) { c.bufferFree = c.info.rxBufferSize; c.bufferAt = t; c.sentSince = 0 }
        c.clearAt = t
        c.clearConfirmed = false
        c.streamAt = null
        c.streamCarry = 0
        c.playing = null
        c.index = 0
        c.playingPrep = null
    }
    const holdingForClear = (c, t) => c.clearAt !== null && !c.clearConfirmed && t - c.clearAt < TICK_MS
    // The stop's points (laserGuards.parkPath): blank where the beam is, a blank walk to the centre,
    // parked there — as ≤140-point messages. Data only; the caller sends output-off after.
    const parkMessages = (c) => {
        const pts = guardsLib.parkPath(c.lastPoint, planOf(c))
        const out = []
        for (let i = 0; i < pts.length; i += proto.MAX_POINTS_PER_MESSAGE) {
            out.push(proto.encodeSampleData(pts.slice(i, i + proto.MAX_POINTS_PER_MESSAGE), c.message, c.frameNum))
            c.message = (c.message + 1) & 0xff
        }
        c.sentSince += pts.length
        c.lastPoint = [0, 0]
        c.playingPrep = null
        return out
    }

    // A stop, in this order: the ring buffer cleared (twice), the beam parked blank at the centre,
    // output off (twice; the spec: critical commands twice, they are idempotent). The clear and the
    // park go to different ports, so the cube may take them in either order — UNVALIDATED on a real
    // cube; the output-off is what makes it dark.
    const stopCube = (c, reason, t, detail = null) => {
        c.stop = { reason, at: t, detail, holder: framesFor(c.id)?.out ?? null, frame: framesFor(c.id) ?? null, personAt: null }
        c.stops[reason] = (c.stops[reason] || 0) + 1
        c.stillSince = null
        c.playing = null
        c.index = 0
        clearBuffer(c, t)
        for (const buf of parkMessages(c)) send(c, buf, proto.PORT.DATA)
        send(c, proto.setOutput(false), proto.PORT.CMD)
        send(c, proto.setOutput(false), proto.PORT.CMD)
        log?.warn?.(`[laser] ${c.id} ${STOP_TEXT[reason]}${detail ? ` (${detail})` : ''}`)
    }
    // Back on: the buffer cleared first, so nothing queued before the stop can light.
    const resumeCube = (c, t) => {
        c.stop = null
        c.stillSince = null
        clearBuffer(c, t)
        send(c, proto.setOutput(true), proto.PORT.CMD)
        log?.warn?.(`[laser] ${c.id} resumed on a new frame`)
    }

    // The next stretch of the cube's frame, as much as its ring buffer has room for, in ≤140-point
    // messages. Room is estimated as the spec advises: the last free count the cube reported, plus
    // what it has played since at its DAC rate, minus what was sent since. A new lit frame starts at
    // the end of the one playing (no torn figures; one pass is at most the frame budget, ≤ 67 ms); a
    // DARK frame, blackout and stops cut at once (round 2, review §1: no lit point of a replaced
    // figure after the editor went dark).
    const stream = (c, frame, t) => {
        if (!c.ip) return
        const rate = rateOf(c)
        if (!rate) return
        if (holdingForClear(c, t)) return
        const prep = prepare(c, frame)
        if (c.playing && c.playingPrep && c.playingPrep !== prep && !frame?.lit) { c.playing = null; c.index = 0 }
        // Catch-up pacing (ledger N1501.18): the points due are the cube's rate × the time since the
        // last stream (the fraction carried), so a late tick sends the points it missed and the mean
        // rate is the DAC rate, not 600 / mean tick. A stall longer than CATCH_UP_MAX_MS is not
        // banked (the buffer would be past full), and the cube's free count still caps the send.
        const dt = c.streamAt === null ? LEAD_MS : Math.min(Math.max(0, t - c.streamAt), CATCH_UP_MAX_MS)
        c.streamAt = t
        const due = c.streamCarry + (rate * dt) / 1000
        let room = Math.floor(due)
        if (c.bufferFree !== null) {
            let free = c.bufferFree + (rate * (t - (c.bufferAt ?? t))) / 1000 - c.sentSince
            if (c.info?.rxBufferSize) free = Math.min(free, c.info.rxBufferSize)
            room = Math.min(room, Math.max(0, Math.floor(free - BUFFER_MARGIN)))
            const size = c.info?.rxBufferSize
            if (size) room = Math.min(room, Math.max(0, Math.floor(free - (size - (rate * LEAD_MS) / 1000))))
        }
        c.streamCarry = Math.min(due - Math.floor(due), 1)
        // The next pass of the frame, as optimised; a new frame is reached by a blank bridge.
        const next = () => {
            if (!prep?.points?.length) { c.playingPrep = null; return [[c.lastPoint[0], c.lastPoint[1], 0, 0, 0]] }
            const bridge = c.playingPrep === prep ? [] : guardsLib.bridgePath(c.lastPoint, prep.points[0], prep.plan)
            c.playingPrep = prep
            return bridge.length ? bridge.concat(prep.points) : prep.points
        }
        const power = powerOf(c)
        while (room > 0) {
            const chunk = []
            while (chunk.length < Math.min(room, proto.MAX_POINTS_PER_MESSAGE)) {
                if (!c.playing || c.index >= c.playing.length) {
                    if (c.playing) c.frameNum = (c.frameNum + 1) & 0xff
                    c.playing = next()
                    c.index = 0
                }
                const p = c.playing[c.index]
                c.index += 1
                chunk.push(p)
                c.lastPoint = [p[0], p[1]]
            }
            send(c, proto.encodeSampleData(guardsLib.scaleColour(chunk, power), c.message, c.frameNum), proto.PORT.DATA)
            c.message = (c.message + 1) & 0xff
            c.sentSince += chunk.length
            room -= chunk.length
        }
    }

    // Every tick, while armed, per armed cube: the link, the cube's over-temperature flag, the
    // signal-loss stop, the frame budget, the still-beam guard, then the stream. In sim the guards
    // run and nothing is sent. The frame's path work was done when it was posted (prepare).
    const tick = () => {
        if (!armed) return
        const t = now()
        for (const c of live.values()) {
            if (!c.armed) continue
            // A temperature reading counts only while fresh (two info periods), not a stale one.
            if (c.info && t - c.infoAt <= 2 * INFO_POLL_MS) c.temp.sample(t, c.info.temperature)
            if (c.ip && t - (c.heardAt ?? 0) > GUARD.LINK_LOST_MS) {
                stopCube(c, STOP.LINK_LOST, t)
                c.armed = false
                continue
            }
            if (c.info?.overTemperature) {
                stopCube(c, STOP.OVER_TEMPERATURE, t, `${c.info.temperature} °C`)
                c.armed = false
                continue
            }
            // A cube whose Out let go (its claim lapsed) or (darkOff 'auto') whose frame has gone dark and unrefreshed is switched
            // OFF, not left armed with output on for the next sender (review E2): a later Out must be switched On by a person.
            // In darkOff 'never' a dark cube stays armed and draws blank until a person's Off (N1591); an Out letting go still switches it Off.
            if (claims.has(c.id) && !claimOf(c.id, t)) {
                claims.delete(c.id)
                log?.warn?.(`[laser] ${c.id} its Out let go: switching it OFF`)
                armOne({ armed: false, cube: c.id })
                c.offBy = { reason: OFF.OUT_LET_GO, at: t }
                continue
            }
            const frame = darkLatch ? darkFrame(t) : framesFor(c.id)
            // The frame that tripped a stop and was kept through Off never lights the cube again (review R1): only a different one.
            // The dark latch (keep-arm Blackout, R5) neither clears the trip frame nor lights anything.
            if (c.tripFrame && !darkLatch) {
                if (frame === c.tripFrame) continue
                c.tripFrame = null
            }
            // No frame at all counts as dark, from the moment of On (review R2). Only in darkOff 'auto'.
            if (darkOff === 'auto' && !darkLatch && (!frame || !frame.lit) && !c.stop && t - Math.max(frame?.at ?? 0, c.armedAt ?? 0) > DARK_IDLE_MS) {
                log?.warn?.(`[laser] ${c.id} dark and unrefreshed for ${DARK_IDLE_MS} ms: switching it OFF`)
                armOne({ armed: false, cube: c.id })
                c.offBy = { reason: OFF.DARK_IDLE, at: t }
                continue
            }
            const prep = prepare(c, frame)
            const still = stillOf(c, frame)
            if (c.stop) {
                // Back on only on a frame newer than the stop that would not stop it again.
                const fresh = frame && frame.at > c.stop.at && t - frame.at <= GUARD.FRAME_TIMEOUT_MS
                const again = !fresh || (frame.lit && prep?.overBudget) || (c.stop.reason === STOP.STILL_BEAM && still.length)
                // A person (a Go on this frame, or On pressed on the stopped cube) lights it again, but never with the
                // frame that tripped it: only a NEW frame object, passing the guards (review E1, 2026-10-30).
                const person = (frame?.goAt > c.stop.at || c.stop.personAt !== null) && frame !== c.stop.frame
                if (config.stopResume === 'legacy') {
                    if (again) continue
                } else if (DARK_UNTIL_PERSON.has(c.stop.reason)) {
                    if (!person || again) continue
                } else {
                    // No-frame: back by itself within RESUME_WINDOW_MS, for the same Out only; else disarmed.
                    // A person's On skips the window and the Out check, but still needs a fresh frame.
                    if (c.stop.personAt === null) {
                        if (t - c.stop.at > RESUME_WINDOW_MS) {
                            c.armed = false
                            log?.warn?.(`[laser] ${c.id} stayed stopped past ${RESUME_WINDOW_MS} ms: disarmed, press On`)
                            continue
                        }
                        if (again || (frame.out ?? null) !== c.stop.holder) continue
                    } else if (again) continue
                }
                resumeCube(c, t)
            }
            if (frame?.lit && t - frame.at > GUARD.FRAME_TIMEOUT_MS) { stopCube(c, STOP.NO_FRAME, t); continue }
            if (frame?.lit && prep?.overBudget) {
                stopCube(c, STOP.FRAME_TOO_LONG, t, `more than ${prep.budget} points after the guards (${prep.stats.in} posted)`)
                continue
            }
            if (frame?.lit && still.length) {
                c.stillSince ??= t
                if (t - c.stillSince >= GUARD.STILL_HOLD_MS) {
                    const s = still[0]
                    stopCube(c, STOP.STILL_BEAM, t, `${s.kind === 'dot' ? 'a dot' : 'a dwell'} at x ${s.x.toFixed(3)}, y ${s.y.toFixed(3)}, ${Math.round(s.share * 100)} % of the frame`)
                    continue
                }
            } else c.stillSince = null
            stream(c, frame, t)
        }
    }

    const infoView = (c, t) => (c.info ? { ...c.info, ageMs: t - c.infoAt } : null)
    // What the guards did to the frame this cube is drawing: points in and out, the longest steps,
    // and how many times a second the figure is drawn at the cube's rate.
    const pathView = (c) => {
        const prep = c.prep
        if (!prep) return null
        const { plan } = prep
        return {
            rate: prep.rate,
            budget: prep.budget,
            overBudget: prep.overBudget,
            pointsIn: prep.stats.in,
            pointsOut: prep.overBudget ? null : prep.stats.out,
            framesPerSecond: !prep.overBudget && prep.stats.out ? Math.round((prep.rate / prep.stats.out) * 10) / 10 : null,
            maxLitStep: prep.stats.maxLitStep,
            maxBlankStep: prep.stats.maxBlankStep,
            plan: { litStep: plan.litStep, blankStep: plan.blankStep, startDwell: plan.startDwell, endDwell: plan.endDwell, blankBeforeOn: plan.blankBeforeOn, litAfterOn: plan.litAfterOn, litBeforeOff: plan.litBeforeOff, blankAfterOff: plan.blankAfterOff, parkPoints: plan.parkPoints }
        }
    }
    // The temperature limiter (laserGuards.powerScale): hot at an average ≥ tempEndC.
    const temperatureView = (c) => {
        const averageC = c.temp.average()
        return {
            lastC: c.info ? c.info.temperature : null,
            averageC: averageC === null ? null : Math.round(averageC * 10) / 10,
            samples: c.temp.count(),
            powerScale: powerOf(c),
            hot: averageC !== null && averageC >= c.guards.tempEndC,
            cubeWarning: Boolean(c.info?.temperatureWarning),
            cubeOverTemperature: Boolean(c.info?.overTemperature)
        }
    }
    // A cube On with nothing to draw: armed, not stopped, no dark latch, nothing lit, and nobody refreshing (no frame,
    // none since On, or one older than FRAME_TIMEOUT_MS). The dark rule's own condition (R2); reported in both modes.
    const nothingToDraw = (c, t) => {
        if (!armed || !c.armed || c.stop || darkLatch) return false
        const frame = framesFor(c.id)
        if (frame?.lit) return false
        return !(frame && frame.at > (c.armedAt ?? 0) && t - frame.at <= GUARD.FRAME_TIMEOUT_MS)
    }
    // How long before the dark rule (R2, in tick) switches this cube Off, for the desk to count down: only in darkOff
    // 'auto' and only while it counts (nothingToDraw). null otherwise. Reporting only: the rule and its time are tick()'s (N1585).
    const darkOffIn = (c, t) => {
        if (darkOff !== 'auto' || !nothingToDraw(c, t)) return null
        const frame = framesFor(c.id)
        return Math.max(0, DARK_IDLE_MS - (t - Math.max(frame?.at ?? 0, c.armedAt ?? 0)))
    }
    const state = () => {
        const t = now()
        return {
            armed,
            dark: darkLatch,
            signedOff,
            signOff,
            darkOff,
            sim: sim(),
            zone: { ...config.zone },
            stopResume: config.stopResume,
            guard: {
                frameTimeoutMs: GUARD.FRAME_TIMEOUT_MS,
                linkLostMs: GUARD.LINK_LOST_MS,
                stillWindowDeg: GUARD.STILL_WINDOW_DEG,
                stillDwellShare: GUARD.STILL_DWELL_SHARE,
                stillHoldMs: GUARD.STILL_HOLD_MS,
                darkIdleMs: DARK_IDLE_MS,
                validated: GUARD.VALIDATED,
                path: { ...config.guards, referenceRate: guardsLib.REFERENCE_RATE }
            },
            cubes: [...live.values()].map((c) => ({
                id: c.id,
                name: c.name,
                ip: c.ip,
                serial: c.serial,
                connected: Boolean(c.ip) && c.heardAt !== null && t - c.heardAt <= GUARD.LINK_LOST_MS,
                armed: armed && c.armed,
                claimedBy: claimOf(c.id, t)?.out ?? null,
                stop: c.stop ? { reason: c.stop.reason, text: STOP_TEXT[c.stop.reason], detail: c.stop.detail, at: c.stop.at, needsPerson: config.stopResume !== 'legacy' && DARK_UNTIL_PERSON.has(c.stop.reason) } : null,
                pointLoss: { ...c.pointLoss },
                stops: { ...c.stops },
                info: infoView(c, t),
                rate: rateOf(c),
                rateMismatch: rateMismatch(c),
                stillBeams: approvedStill(c).length,
                serialMismatch: serialMismatch(c),
                addressRefused: c.addressRefused,
                lastFrameAt: c.lastFrameAt,
                offBy: c.offBy ? { reason: c.offBy.reason, text: OFF_TEXT[c.offBy.reason], at: c.offBy.at } : null,
                darkOffInMs: darkOffIn(c, t),
                nothingToDraw: nothingToDraw(c, t),
                guards: c.guards,
                path: pathView(c),
                temperature: temperatureView(c)
            }))
        }
    }

    // A frame for 'all' replaces every cube's own frame except those a Laser Out holds (rule 10).
    const keep = (target, frame) => {
        if (target === ALL_CUBES) {
            frames.all = frame
            for (const id of [...frames.byCube.keys()]) if (!claimOf(id)) frames.byCube.delete(id)
        } else frames.byCube.set(target, frame)
        for (const c of live.values()) if (target === ALL_CUBES ? !claimOf(c.id) : c.id === target) c.lastFrameAt = frame.at
    }
    const goState = new Map()
    const targetOf = (cube) => (cube == null || cube === '' ? ALL_CUBES : String(cube))
    const unknown = (target) => (target !== ALL_CUBES && !live.has(target) ? `no cube "${target}" (cubes: ${[...live.keys()].join(', ')})` : null)

    /** Keep a frame for every cube ('all') or one; the zone applied. Never sends by itself. */
    const setFrame = (cube, points, out = null, { go = false } = {}) => {
        const target = targetOf(cube)
        const error = unknown(target) || (target === ALL_CUBES ? null : heldByOther(target, out))
        if (error) return { ok: false, error }
        if (target !== ALL_CUBES) touchClaim(target, out)
        // A raw point outside -1..1 is BLANKED here, before the frame is normalised (which would clamp
        // it lit onto the field edge); counted with the zone's blanks (stage audit row 33).
        let offField = 0
        const inField = (v) => !(typeof v === 'number' && Number.isFinite(v)) || (v >= -1 && v <= 1)
        const raw = (Array.isArray(points) ? points : []).map((p) => {
            const x = Array.isArray(p) ? p[0] : p?.x
            const y = Array.isArray(p) ? p[1] : p?.y
            if (inField(x) && inField(y)) return p
            const chan = (i, k) => (Array.isArray(p) ? p[i] : p?.[k])
            if ([chan(2, 'r'), chan(3, 'g'), chan(4, 'b')].some((v) => v > 0)) offField += 1
            return [x, y, 0, 0, 0]
        })
        const clean = normaliseFramePoints(raw)
        const zoned = applyZone(clean.points, config.zone)
        const blanked = zoned.blanked + offField
        for (const c of live.values()) {
            if (!(target === ALL_CUBES ? !claimOf(c.id) : c.id === target)) continue
            const l = c.pointLoss
            l.blanked = blanked; l.dropped = clean.dropped
            l.blankedTotal += blanked; l.droppedTotal += clean.dropped
            l.frames += 1
        }
        // A Go counts only on a rising edge: not while the sender keeps it set, and at most once per GO_GAP_MS per Out.
        const goKey = `${out ?? ''}|${target}`
        const lastGo = goState.get(goKey)
        const goCounts = go && !lastGo?.held && !(lastGo && now() - lastGo.at < GO_GAP_MS)
        goState.set(goKey, { held: go, at: goCounts ? now() : (lastGo?.at ?? -Infinity) })
        keep(target, {
            points: zoned.points,
            at: now(),
            out: out == null ? null : String(out),
            goAt: goCounts ? now() : null,
            lit: zoned.points.some(isLit),
            rawStill: stillBeams(zoned.points),
            preps: new Map()
        })
        // The guards' work for this frame, now, once per (guards, rate, budget) — not in the tick.
        const kept = target === ALL_CUBES ? frames.all : frames.byCube.get(target)
        for (const c of live.values()) if (target === ALL_CUBES ? !frames.byCube.has(c.id) : c.id === target) prepare(c, kept)
        return { ok: true, armed, dropped: clean.dropped, blanked, cubes: state().cubes }
    }

    /** The editor's keep-alive: the frame it holds is still wanted. Refreshes the frame's time only. */
    const alive = (cube, out = null) => {
        const target = targetOf(cube)
        const error = unknown(target) || (target === ALL_CUBES ? null : heldByOther(target, out))
        if (error) return { ok: false, error }
        if (target !== ALL_CUBES) touchClaim(target, out)
        const frame = target === ALL_CUBES ? frames.all : frames.byCube.get(target)
        if (!frame) return { ok: true, armed, kept: false }
        frame.at = now()
        for (const c of live.values()) if (target === ALL_CUBES || c.id === target) c.lastFrameAt = frame.at
        return { ok: true, armed, kept: true }
    }

    // The dark latch: a fresh blank frame every tick, whoever sends. Unlike blackout() it keeps every cube armed and keeps
    // the frames the senders post, so lifting it needs a new frame that passes the guards, not a new arm.
    const darkFrame = (t) => ({ points: [[0, 0, 0, 0, 0]], at: t, lit: false, rawStill: [], preps: new Map() })
    const dark = (on) => {
        darkLatch = on === true
        if (darkLatch) for (const c of live.values()) { c.playing = null; c.index = 0 }
        return { ok: true, armed, dark: darkLatch }
    }

    // Blackout from any source cuts the light at once, like a disarm or the SIGTERM path: the armed
    // cubes get their ring buffer cleared, the park at centre and output-off (offAll), so nothing
    // queued ahead (up to LEAD_MS) plays on. That leaves the run disarmed — lifting the blackout
    // never turns output on by itself; the sign-off phrase arms again, as after any disarm.
    const blackout = () => {
        blackouts += 1
        frames.all = null
        frames.byCube.clear()
        for (const c of live.values()) { c.playing = null; c.index = 0 }
        // Off is always sent, even when the engine believes it is disarmed (stage audit row 8).
        arm({ armed: false })
        return { ok: true, armed }
    }

    // Every addressed cube off: the cubes that were armed first park blank at the centre (their
    // stream's points), then every one gets output-off twice and buffer answers off. A cube never
    // armed gets no data point (rule 1), only the off commands. `done` is called once per message;
    // returns how many there are.
    const offAll = (wasArmed, done, only = null) => {
        const msgs = []
        for (const c of live.values()) {
            if (!c.ip || (only && !only.has(c.id))) continue
            if (wasArmed.has(c.id)) {
                msgs.push([c, proto.clearRingBuffer(), proto.PORT.CMD], [c, proto.clearRingBuffer(), proto.PORT.CMD])
                for (const buf of parkMessages(c)) msgs.push([c, buf, proto.PORT.DATA])
            }
            msgs.push([c, proto.setOutput(false), proto.PORT.CMD], [c, proto.setOutput(false), proto.PORT.CMD], [c, proto.enableBufferSizeResponse(false), proto.PORT.CMD])
        }
        for (const [c, buf, port] of msgs) send(c, buf, port, done)
        return msgs.length
    }
    const armedIds = () => new Set(armed ? [...live.values()].filter((c) => c.armed).map((c) => c.id) : [])

    const armCube = (c, t) => {
        if (c.armed) return
        if (c.ip && !infoUsable(c.info)) { c.stop = { reason: STOP.NO_INFO, at: t, detail: null }; return }
        // Round 3 (re-review R2-2): a cube that says it is over temperature is not armed at all.
        if (c.ip && c.info?.overTemperature) { c.stop = { reason: STOP.OVER_TEMPERATURE, at: t, detail: `${c.info.temperature} °C` }; return }
        c.armed = true
        c.armedAt = t
        c.offBy = null
        c.stop = null
        c.stillSince = null
        c.playing = null
        c.index = 0
        c.playingPrep = null
        // A fresh temperature average each arm (review §7): an old session's cool readings must not
        // hold the limiter off while the cube is hot now.
        c.temp = guardsLib.createTempAverager({ samples: c.guards.tempSamples, periodMs: c.guards.tempPeriodMs })
        send(c, proto.enableBufferSizeResponse(true), proto.PORT.CMD)
        // SET_RATE only as a request from laser.json; the plan follows the cube's next answer.
        if (c.guards.sendSetRate && config.dacRate && c.info) send(c, proto.setRate(Math.min(config.dacRate, c.info.maxDacRate)), proto.PORT.CMD)
        clearBuffer(c, t)
        send(c, proto.setOutput(true), proto.PORT.CMD)
    }

    // ONE cube on or off (rule 10). Off is always allowed and always sent. On needs: the cube known
    // and addressed, not held by another Out, the run signed off (the phrase now, or earlier in this
    // run), and the cube's own answer (armCube's checks).
    const armOne = ({ armed: want, cube, confirm, out }) => {
        const c = live.get(String(cube))
        if (!c) return { ok: false, armed, error: `no cube "${cube}" (cubes: ${[...live.keys()].join(', ')})` }
        if (want !== true) {
            const wasOn = armed && c.armed
            offAll(new Set(wasOn ? [c.id] : []), undefined, new Set([c.id]))
            c.armed = false
            c.stillSince = null
            if (c.stop?.reason !== STOP.NO_INFO) { c.tripFrame = c.stop?.frame ?? c.tripFrame ?? null; c.stop = null }
            if (![...live.values()].some((x) => x.armed)) {
                armed = false
                if (timer) { stopEvery(timer); timer = null }
            }
            if (wasOn) log?.warn?.(`[laser] ${c.id} OFF`)
            return { ok: true, armed, cube: c.id, cubeArmed: false, signedOff }
        }
        const held = heldByOther(c.id, out)
        if (held) return { ok: false, armed, error: `not on: ${held}` }
        if (!c.ip) return { ok: false, armed, error: `not on: ${c.id} has no address — give the Laser Out its cube's IP` }
        if (phraseNeeded() && !signedOff && confirm !== ARM_PHRASE) {
            return { ok: false, armed, needsPhrase: true, error: confirm ? 'not on: that is not the sign-off phrase. Type it exactly, as the laser safety officer agreed it.' : 'not on: the first ON of a run takes the sign-off phrase' }
        }
        openSocket()
        const t = now()
        // On on a stopped cube is a person's yes, not a relight: the cube stays dark until a NEW frame that passes the
        // guards arrives (the tick), never the frame that stopped it (review E1).
        if (c.armed && c.stop && c.stop.reason !== STOP.NO_INFO) c.stop.personAt = t
        armCube(c, t)
        if (!c.armed) return { ok: false, armed, error: `not on: ${c.id}: ${c.stop?.reason === STOP.OVER_TEMPERATURE ? 'the cube reports over-temperature' : 'the cube has not answered its info question — is it on and on this network?'}` }
        signedOff = true
        armed = true
        touchClaim(c.id, out)
        if (!timer) { timer = every(tick, TICK_MS); timer?.unref?.() }
        log?.warn?.(`[laser] ${c.id} ON (${c.ip})`)
        return { ok: true, armed, cube: c.id, cubeArmed: true, signedOff }
    }

    const arm = ({ armed: want, confirm, cube, out } = {}) => {
        if (cube != null && cube !== '' && cube !== ALL_CUBES) return armOne({ armed: want, cube, confirm, out })
        if (want !== true) {
            offAll(armedIds())
            armed = false
            signedOff = false
            for (const c of live.values()) { c.armed = false; c.stillSince = null; if (c.stop?.reason !== STOP.NO_INFO) { c.tripFrame = c.stop?.frame ?? c.tripFrame ?? null; c.stop = null } }
            if (timer) { stopEvery(timer); timer = null }
            return { ok: true, armed }
        }
        // The phrase is never echoed (nor in state()): it is typed by the officer, not copied from a hint.
        if (phraseNeeded() && confirm !== ARM_PHRASE) return { ok: false, armed, error: 'not armed: that is not the sign-off phrase. Type it exactly, as the laser safety officer agreed it.' }
        openSocket()
        const t = now()
        for (const c of live.values()) armCube(c, t)
        const ready = [...live.values()].filter((c) => c.armed)
        const refused = [...live.values()].filter((c) => !c.armed).map((c) => c.id)
        if (!sim() && !ready.some((c) => c.ip)) {
            for (const c of ready) c.armed = false
            const why = [...live.values()].filter((c) => !c.armed && c.ip).map((c) => `${c.id}: ${c.stop?.reason === STOP.OVER_TEMPERATURE ? 'over temperature' : 'no info'}`)
            return { ok: false, armed, error: `no cube could be armed (${why.join(', ')}): nothing armed. A cube needs to have answered its info question and not be over temperature. Check the cubes are on, cool and on this network, then arm again.`, cubes: state().cubes }
        }
        armed = true
        signedOff = true
        if (!timer) { timer = every(tick, TICK_MS); timer?.unref?.() }
        log?.warn?.(`[laser] ARMED (${sim() ? 'sim: no cube addresses, nothing is sent' : `${ready.filter((c) => c.ip).length} cubes`}${refused.length ? `; not armed, no info: ${refused.join(', ')}` : ''})`)
        return { ok: true, armed, refused, cubes: state().cubes }
    }

    // A Laser Out's address checked (rule 10): may this Out take the cube with this serial at this
    // address? null when it may, else the refusal. Nothing changes.
    const canTake = ({ serial, ip, out }) => {
        const bySerial = [...live.values()].find((c) => c.serial === serial)
        if (bySerial) {
            const held = heldByOther(bySerial.id, out)
            if (held) return held
            if (bySerial.armed && bySerial.ip !== ip) return `${bySerial.id} (serial ${serial}) is ON at ${bySerial.ip}: switch it OFF before moving it to ${ip}`
        }
        const atIp = [...live.values()].find((c) => c.ip === ip && c !== bySerial)
        if (atIp?.armed) return `${atIp.id} at ${ip} is ON: switch it OFF first`
        if (atIp) { const held = heldByOther(atIp.id, out); if (held) return held }
        return null
    }

    /**
     * Add or move a cube found at a Laser Out's address, keyed by serial, without a reload: the other
     * cubes keep running. `cube` is the entry laserConfig.upsertCube wrote; `info` the 0x77 answer
     * that was just read from that address. Call canTake first. Returns the cube's id.
     */
    const upsertCube = (cube, info, out) => {
        const fresh = cubeFrom(cube, live.size, config.guards)
        if (!fresh.ip) return { ok: false, error: fresh.addressRefused || 'no address' }
        const t = now()
        // Whoever else had this address does not any more: that box is this cube now.
        for (const c of live.values()) {
            if (c.id !== fresh.id && c.ip === fresh.ip) { c.ip = null; c.info = null; c.heardAt = null; c.armed = false }
        }
        let c = live.get(fresh.id)
        if (!c) { c = liveEntry(fresh); live.set(fresh.id, c) }
        if (c.ip !== fresh.ip) { c.info = null; c.infoAt = null; c.heardAt = null; c.stop = null }
        Object.assign(c, { name: fresh.name, ip: fresh.ip, serial: fresh.serial, stillBeams: fresh.stillBeams })
        if (infoUsable(info)) { c.info = info; c.infoAt = t; c.heardAt = t }
        touchClaim(c.id, out)
        openSocket()
        send(c, proto.getFullInfo(), proto.PORT.CMD)
        return { ok: true, id: c.id }
    }
    // The live cube at an address that answered within the link window, with its info: a Laser Out's
    // 3-second check needs no new question for a cube the engine already hears.
    const heardAt = (ip) => {
        const t = now()
        return [...live.values()].find((c) => c.ip === ip && c.info?.serial && c.heardAt !== null && t - c.heardAt <= GUARD.LINK_LOST_MS) || null
    }

    /** What the room's laser view and the editor read: the kept frames, armed or not, and which cubes are stopped. */
    const framesView = () => ({
        armed,
        blackouts,
        sim: sim(),
        all: frames.all ? frames.all.points : null,
        byCube: Object.fromEntries([...frames.byCube.entries()].map(([id, f]) => [id, f.points])),
        cubes: [...live.keys()],
        stopped: Object.fromEntries([...live.values()].filter((c) => c.stop).map((c) => [c.id, c.stop.reason]))
    })

    /**
     * Going down: disarm, then every addressed cube gets output-off twice and buffer answers off, and
     * the socket closes once those have left (or after SHUTDOWN_WAIT_MS). Resolves when done.
     */
    const shutdown = () => new Promise((resolve) => {
        if (timer) { stopEvery(timer); timer = null }
        if (infoTimer) { stopEvery(infoTimer); infoTimer = null }
        const wasArmed = armedIds()
        armed = false
        for (const c of live.values()) c.armed = false
        if (!socket) { resolve(); return }
        let finished = false
        const finish = () => {
            if (finished) return
            finished = true
            if (socket) { try { socket.close() } catch { /* already closed */ } socket = null }
            resolve()
        }
        if (![...live.values()].some((c) => c.ip)) { finish(); return }
        let sent = 0
        let total = Infinity
        total = offAll(wasArmed, () => { sent += 1; if (sent >= total) finish() })
        if (sent >= total) finish()
        later(finish, SHUTDOWN_WAIT_MS)
    })

    // Built on first use (laserRoutes.js): with cube addresses, the socket opens now and the info
    // question starts, so the cubes' info is there by the time anyone arms.
    openSocket()

    return { state, setFrame, alive, blackout, dark, arm, frames: framesView, close: shutdown, shutdown, tick, canTake, upsertCube, heardAt }
}

module.exports = { createLaserEngine, applyZone, normaliseZone, stillBeams, dwellSpots, ARM_PHRASE, DEFAULT_ZONE, TICK_MS, GUARD, STOP, OFF, CLAIM_TTL_MS }
