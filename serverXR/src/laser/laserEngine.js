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
//      UNVALIDATED until a real cube has been tested (docs/ai/sessions/feat-laser-drive-finish-2026-10-09.md).
//   8. Server going down (SIGTERM, SIGINT, close): every addressed cube is blanked and sent
//      output-off twice before the socket closes (shutdown()).
// What software cannot do, said plainly: a galvo that stalls while a figure is being sent is a
// still beam the server never sees (it only knows what it commanded); a server killed with -9, or a
// cable pulled, leaves the cube to its own firmware, whose behaviour when the stream stops is not
// documented. The key switch, the interlock loop and the E-stops are the stops that always work.
//
// Config (optional): <dataDir>/laser/laser.json
//   { "cubes": [{ "id": "cube-1", "name": "Cut 1", "ip": "192.168.1.51",
//                 "stillBeams": [{ "x": -0.2, "y": 0.4, "within": 0.01 }] }, …],
//     "zone": { "xMin": -1, "xMax": 1, "yMin": 0, "yMax": 1 }, "dacRate": 30000 }
//   stillBeams  the still beams the officer approved for this cube, in the cube's field (x, y -1…1),
//               each allowed to wander `within` (field units, default 0.01) of its point
//   dacRate     optional cap on the points per second; without it the cube's own current DAC rate
//               (from its info) is used, never more than its maximum
// No file: six cubes cube-1…cube-6 without addresses (the rig's six), sim.
'use strict'

const fs = require('fs')
const path = require('path')
const dgram = require('dgram')
const { ALL_CUBES, normaliseFramePoints } = require('../../../shared/laserFrame.cjs')
const proto = require('./lasercubeProtocol')

const ARM_PHRASE = 'the laser safety officer has signed off'
const DEFAULT_ZONE = Object.freeze({ xMin: -1, xMax: 1, yMin: 0, yMax: 1 })
const DEFAULT_CUBES = Object.freeze(Array.from({ length: 6 }, (_, i) => ({ id: `cube-${i + 1}`, name: `Cube ${i + 1}`, ip: null })))
const TICK_MS = 20
const BUFFER_MARGIN = 200
const INFO_POLL_MS = 1000
const SHUTDOWN_WAIT_MS = 250

// THE GUARDS' NUMBERS — chosen 2026-10-09 against ~/work/agent-reports-2026-10-09/devices/lasers-exact.md.
// All UNVALIDATED until tested on a real cube (the checklist in the session note).
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
const STOP = Object.freeze({ NO_INFO: 'no-info', NO_FRAME: 'no-frame', STILL_BEAM: 'still-beam', LINK_LOST: 'link-lost' })
const STOP_TEXT = Object.freeze({
    [STOP.NO_INFO]: 'not armed: the cube never answered the info question',
    [STOP.NO_FRAME]: `stopped: no frame for ${GUARD.FRAME_TIMEOUT_MS} ms`,
    [STOP.STILL_BEAM]: `stopped: a still beam held ${GUARD.STILL_HOLD_MS} ms`,
    [STOP.LINK_LOST]: `stopped: the cube went silent for ${GUARD.LINK_LOST_MS / 1000} s — arm again`
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

const cubeFrom = (c, i) => ({
    id: String(c?.id || `cube-${i + 1}`),
    name: String(c?.name || c?.id || `Cube ${i + 1}`),
    ip: typeof c?.ip === 'string' && c.ip ? c.ip : null,
    stillBeams: normaliseStillBeams(c?.stillBeams)
})

const readConfig = (dir) => {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, 'laser.json'), 'utf8'))
        const cubes = Array.isArray(raw.cubes) && raw.cubes.length ? raw.cubes.map(cubeFrom) : DEFAULT_CUBES.map(cubeFrom)
        return { cubes, zone: normaliseZone(raw.zone), dacRate: Number(raw.dacRate) > 0 ? Number(raw.dacRate) : null }
    } catch {
        return { cubes: DEFAULT_CUBES.map(cubeFrom), zone: normaliseZone(), dacRate: null }
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
    setTimeout: later = setTimeout
} = {}) => {
    const config = readConfig(dataDir)
    const live = new Map(config.cubes.map((c) => [c.id, {
        ...c,
        lastFrameAt: null,
        info: null, infoAt: null, heardAt: null,
        bufferFree: null, bufferAt: null, sentSince: 0,
        playing: null, index: 0, message: 0, frameNum: 0, lastPoint: [0, 0],
        armed: false, stop: null, stillSince: null,
        stops: { [STOP.NO_FRAME]: 0, [STOP.STILL_BEAM]: 0, [STOP.LINK_LOST]: 0 }
    }]))
    const frames = { all: null, byCube: new Map() }
    let armed = false
    let socket = null
    let timer = null
    let infoTimer = null
    const sim = () => !config.cubes.some((c) => c.ip)

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
        }
    }
    const askInfo = () => { for (const c of live.values()) send(c, proto.getFullInfo(), proto.PORT.CMD) }
    const openSocket = () => {
        if (socket || sim()) return
        socket = createSocket()
        socket.on?.('message', onMessage)
        socket.on?.('error', (error) => log?.warn?.(`[laser] socket: ${error.message}`))
        socket.bind?.(0)
        // The one thing sent while disarmed: the info question, now and every second.
        askInfo()
        infoTimer = every(askInfo, INFO_POLL_MS)
        infoTimer?.unref?.()
    }
    const framesFor = (id) => frames.byCube.get(id) || frames.all

    const rateOf = (c) => {
        if (!infoUsable(c.info)) return null
        const want = config.dacRate || c.info.dacRate || c.info.maxDacRate
        return Math.min(want, c.info.maxDacRate)
    }
    const allowed = (c, spot) => c.stillBeams.some((b) => Math.hypot(spot.x - b.x, spot.y - b.y) <= b.within)
    const stillOf = (c, frame) => (frame?.still || []).filter((s) => !allowed(c, s))

    // A stop: blank, then output off twice (the spec: send critical commands twice, they are idempotent).
    const stopCube = (c, reason, t, detail = null) => {
        c.stop = { reason, at: t, detail }
        c.stops[reason] = (c.stops[reason] || 0) + 1
        c.stillSince = null
        c.playing = null
        c.index = 0
        const blank = Array.from({ length: 10 }, () => [c.lastPoint[0], c.lastPoint[1], 0, 0, 0])
        send(c, proto.encodeSampleData(blank, c.message, c.frameNum), proto.PORT.DATA)
        c.message = (c.message + 1) & 0xff
        send(c, proto.setOutput(false), proto.PORT.CMD)
        send(c, proto.setOutput(false), proto.PORT.CMD)
        log?.warn?.(`[laser] ${c.id} ${STOP_TEXT[reason]}${detail ? ` (${detail})` : ''}`)
    }
    const resumeCube = (c) => {
        c.stop = null
        c.stillSince = null
        send(c, proto.setOutput(true), proto.PORT.CMD)
        log?.warn?.(`[laser] ${c.id} resumed on a new frame`)
    }

    // The next stretch of the cube's frame, as much as its ring buffer has room for, in ≤140-point
    // messages. Room is estimated as the spec advises: the last free count the cube reported, plus
    // what it has played since at its DAC rate, minus what was sent since. A new frame starts at the
    // end of the one playing (no torn figures); blackout and stops cut at once.
    const stream = (c, frame, t) => {
        if (!c.ip) return
        const rate = rateOf(c)
        if (!rate) return
        const perTick = Math.ceil((rate * TICK_MS) / 1000)
        let room = perTick
        if (c.bufferFree !== null) {
            let free = c.bufferFree + (rate * (t - (c.bufferAt ?? t))) / 1000 - c.sentSince
            if (c.info?.rxBufferSize) free = Math.min(free, c.info.rxBufferSize)
            room = Math.min(perTick, Math.max(0, Math.floor(free - BUFFER_MARGIN)))
        }
        const next = () => (frame?.points?.length ? frame.points : [[c.lastPoint[0], c.lastPoint[1], 0, 0, 0]])
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
            send(c, proto.encodeSampleData(chunk, c.message, c.frameNum), proto.PORT.DATA)
            c.message = (c.message + 1) & 0xff
            c.sentSince += chunk.length
            room -= chunk.length
        }
    }

    // Every tick, while armed, per armed cube: the link, the signal-loss stop, the still-beam guard,
    // then the stream. In sim the guards run and nothing is sent.
    const tick = () => {
        if (!armed) return
        const t = now()
        for (const c of live.values()) {
            if (!c.armed) continue
            if (c.ip && t - (c.heardAt ?? 0) > GUARD.LINK_LOST_MS) {
                stopCube(c, STOP.LINK_LOST, t)
                c.armed = false
                continue
            }
            const frame = framesFor(c.id)
            const still = stillOf(c, frame)
            if (c.stop) {
                // Back on only on a frame newer than the stop that would not stop it again.
                const fresh = frame && frame.at > c.stop.at && t - frame.at <= GUARD.FRAME_TIMEOUT_MS
                if (!fresh || (c.stop.reason === STOP.STILL_BEAM && still.length)) continue
                resumeCube(c)
            }
            if (frame?.lit && t - frame.at > GUARD.FRAME_TIMEOUT_MS) { stopCube(c, STOP.NO_FRAME, t); continue }
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
    const state = () => {
        const t = now()
        return {
            armed,
            sim: sim(),
            zone: { ...config.zone },
            armPhrase: ARM_PHRASE,
            guard: {
                frameTimeoutMs: GUARD.FRAME_TIMEOUT_MS,
                linkLostMs: GUARD.LINK_LOST_MS,
                stillWindowDeg: GUARD.STILL_WINDOW_DEG,
                stillDwellShare: GUARD.STILL_DWELL_SHARE,
                stillHoldMs: GUARD.STILL_HOLD_MS,
                validated: GUARD.VALIDATED
            },
            cubes: [...live.values()].map((c) => ({
                id: c.id,
                name: c.name,
                ip: c.ip,
                connected: Boolean(c.ip) && c.heardAt !== null && t - c.heardAt <= GUARD.LINK_LOST_MS,
                armed: armed && c.armed,
                stop: c.stop ? { reason: c.stop.reason, text: STOP_TEXT[c.stop.reason], detail: c.stop.detail, at: c.stop.at } : null,
                stops: { ...c.stops },
                info: infoView(c, t),
                rate: rateOf(c),
                stillBeams: c.stillBeams.length,
                lastFrameAt: c.lastFrameAt
            }))
        }
    }

    const keep = (target, frame) => {
        if (target === ALL_CUBES) { frames.all = frame; frames.byCube.clear() } else frames.byCube.set(target, frame)
        for (const c of live.values()) if (target === ALL_CUBES || c.id === target) c.lastFrameAt = frame.at
    }
    const targetOf = (cube) => (cube == null || cube === '' ? ALL_CUBES : String(cube))
    const unknown = (target) => (target !== ALL_CUBES && !live.has(target) ? `no cube "${target}" (cubes: ${[...live.keys()].join(', ')})` : null)

    /** Keep a frame for every cube ('all') or one; the zone applied. Never sends by itself. */
    const setFrame = (cube, points) => {
        const target = targetOf(cube)
        const error = unknown(target)
        if (error) return { ok: false, error }
        const clean = normaliseFramePoints(points)
        const zoned = applyZone(clean.points, config.zone)
        keep(target, {
            points: zoned.points,
            at: now(),
            lit: zoned.points.some(isLit),
            still: stillBeams(zoned.points)
        })
        return { ok: true, armed, dropped: clean.dropped, blanked: zoned.blanked, cubes: state().cubes }
    }

    /** The editor's keep-alive: the frame it holds is still wanted. Refreshes the frame's time only. */
    const alive = (cube) => {
        const target = targetOf(cube)
        const error = unknown(target)
        if (error) return { ok: false, error }
        const frame = target === ALL_CUBES ? frames.all : frames.byCube.get(target)
        if (!frame) return { ok: true, armed, kept: false }
        frame.at = now()
        for (const c of live.values()) if (target === ALL_CUBES || c.id === target) c.lastFrameAt = frame.at
        return { ok: true, armed, kept: true }
    }

    const blackout = () => {
        frames.all = null
        frames.byCube.clear()
        for (const c of live.values()) { c.playing = null; c.index = 0 }
        return { ok: true, armed }
    }

    const offAll = (done) => {
        for (const c of live.values()) {
            if (!c.ip) continue
            send(c, proto.setOutput(false), proto.PORT.CMD, done)
            send(c, proto.setOutput(false), proto.PORT.CMD, done)
            send(c, proto.enableBufferSizeResponse(false), proto.PORT.CMD, done)
        }
    }

    const armCube = (c, t) => {
        if (c.armed) return
        if (c.ip && !infoUsable(c.info)) { c.stop = { reason: STOP.NO_INFO, at: t, detail: null }; return }
        c.armed = true
        c.stop = null
        c.stillSince = null
        c.playing = null
        c.index = 0
        send(c, proto.enableBufferSizeResponse(true), proto.PORT.CMD)
        send(c, proto.setOutput(true), proto.PORT.CMD)
    }

    const arm = ({ armed: want, confirm } = {}) => {
        if (want !== true) {
            if (armed) offAll()
            armed = false
            for (const c of live.values()) { c.armed = false; c.stillSince = null; if (c.stop?.reason !== STOP.NO_INFO) c.stop = null }
            if (timer) { stopEvery(timer); timer = null }
            return { ok: true, armed }
        }
        if (confirm !== ARM_PHRASE) return { ok: false, armed, error: `arming needs the sign-off phrase exactly: "${ARM_PHRASE}"` }
        openSocket()
        const t = now()
        for (const c of live.values()) armCube(c, t)
        const ready = [...live.values()].filter((c) => c.armed)
        const refused = [...live.values()].filter((c) => !c.armed).map((c) => c.id)
        if (!sim() && !ready.some((c) => c.ip)) {
            for (const c of ready) c.armed = false
            return { ok: false, armed, error: `no cube has answered its info question yet (${refused.join(', ')}): nothing armed. Check the cubes are on and on this network, then arm again.`, cubes: state().cubes }
        }
        armed = true
        if (!timer) { timer = every(tick, TICK_MS); timer?.unref?.() }
        log?.warn?.(`[laser] ARMED (${sim() ? 'sim: no cube addresses, nothing is sent' : `${ready.filter((c) => c.ip).length} cubes`}${refused.length ? `; not armed, no info: ${refused.join(', ')}` : ''})`)
        return { ok: true, armed, refused, cubes: state().cubes }
    }

    /** What the room's laser view and the editor read: the kept frames, armed or not, and which cubes are stopped. */
    const framesView = () => ({
        armed,
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
        let pending = [...live.values()].filter((c) => c.ip).length * 3
        if (!pending) { finish(); return }
        offAll(() => { pending -= 1; if (pending <= 0) finish() })
        later(finish, SHUTDOWN_WAIT_MS)
    })

    // Built on first use (laserRoutes.js): with cube addresses, the socket opens now and the info
    // question starts, so the cubes' info is there by the time anyone arms.
    openSocket()

    return { state, setFrame, alive, blackout, arm, frames: framesView, close: shutdown, shutdown, tick }
}

module.exports = { createLaserEngine, applyZone, normaliseZone, stillBeams, dwellSpots, ARM_PHRASE, DEFAULT_ZONE, TICK_MS, GUARD, STOP }
