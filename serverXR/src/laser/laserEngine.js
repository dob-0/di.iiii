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
//      view and the editor's preview still show them.
//
// Config (optional): <dataDir>/laser/laser.json
//   { "cubes": [{ "id": "cube-1", "name": "Cut 1", "ip": "192.168.1.51" }, …],
//     "zone": { "xMin": -1, "xMax": 1, "yMin": 0, "yMax": 1 }, "dacRate": 30000 }
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

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

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

const readConfig = (dir) => {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, 'laser.json'), 'utf8'))
        const cubes = Array.isArray(raw.cubes) && raw.cubes.length
            ? raw.cubes.map((c, i) => ({ id: String(c.id || `cube-${i + 1}`), name: String(c.name || c.id || `Cube ${i + 1}`), ip: typeof c.ip === 'string' && c.ip ? c.ip : null }))
            : DEFAULT_CUBES.map((c) => ({ ...c }))
        return { cubes, zone: normaliseZone(raw.zone), dacRate: Number(raw.dacRate) > 0 ? Number(raw.dacRate) : 30000 }
    } catch {
        return { cubes: DEFAULT_CUBES.map((c) => ({ ...c })), zone: normaliseZone(), dacRate: 30000 }
    }
}

/**
 * @param {{ dataDir: string, createSocket?: () => object, now?: () => number, log?: object, setInterval?: Function, clearInterval?: Function }} opts
 */
const createLaserEngine = ({ dataDir, createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }), now = Date.now, log = console, setInterval: every = setInterval, clearInterval: stopEvery = clearInterval } = {}) => {
    const config = readConfig(dataDir)
    const live = new Map(config.cubes.map((c) => [c.id, { ...c, lastFrameAt: null, bufferFree: null, index: 0, message: 0, frameNum: 0, connected: false }]))
    const frames = { all: null, byCube: new Map() }
    let armed = false
    let socket = null
    let timer = null
    const sim = () => !config.cubes.some((c) => c.ip)

    const send = (cube, buf, port) => {
        if (!socket || !cube.ip) return
        try { socket.send(buf, port, cube.ip) } catch (error) { log?.warn?.(`[laser] send to ${cube.ip}: ${error.message}`) }
    }
    const openSocket = () => {
        if (socket || sim()) return
        socket = createSocket()
        socket.on?.('message', (msg, rinfo) => {
            const free = proto.parseBufferFree(msg)
            if (free === null) return
            for (const c of live.values()) if (c.ip === rinfo?.address) { c.bufferFree = free; c.connected = true }
        })
        socket.on?.('error', (error) => log?.warn?.(`[laser] socket: ${error.message}`))
        socket.bind?.(0)
    }
    const framesFor = (id) => frames.byCube.get(id) || frames.all

    // Every tick, while armed: each addressed cube gets the next stretch of its frame, as much as its
    // ring buffer says it has room for (no answer yet: one tick's worth), in ≤140-point messages.
    const tick = () => {
        if (!armed) return
        const perTick = Math.ceil((config.dacRate * TICK_MS) / 1000)
        for (const c of live.values()) {
            if (!c.ip) continue
            const frame = framesFor(c.id)
            const points = frame?.points?.length ? frame.points : [[0, 0, 0, 0, 0]]
            let room = c.bufferFree === null ? perTick : Math.min(perTick, Math.max(0, c.bufferFree - BUFFER_MARGIN))
            while (room > 0) {
                const chunk = []
                while (chunk.length < Math.min(room, proto.MAX_POINTS_PER_MESSAGE)) {
                    chunk.push(points[c.index])
                    c.index += 1
                    if (c.index >= points.length) { c.index = 0; c.frameNum = (c.frameNum + 1) & 0xff }
                }
                send(c, proto.encodeSampleData(chunk, c.message, c.frameNum), proto.PORT.DATA)
                c.message = (c.message + 1) & 0xff
                room -= chunk.length
            }
        }
    }

    const state = () => ({
        armed,
        sim: sim(),
        zone: { ...config.zone },
        armPhrase: ARM_PHRASE,
        cubes: [...live.values()].map((c) => ({ id: c.id, name: c.name, ip: c.ip, connected: c.connected, lastFrameAt: c.lastFrameAt }))
    })

    /** Keep a frame for every cube ('all') or one; the zone applied. Never sends by itself. */
    const setFrame = (cube, points) => {
        const target = cube == null || cube === '' ? ALL_CUBES : String(cube)
        if (target !== ALL_CUBES && !live.has(target)) return { ok: false, error: `no cube "${target}" (cubes: ${[...live.keys()].join(', ')})` }
        const clean = normaliseFramePoints(points)
        const zoned = applyZone(clean.points, config.zone)
        const frame = { points: zoned.points, at: now() }
        if (target === ALL_CUBES) { frames.all = frame; frames.byCube.clear() } else frames.byCube.set(target, frame)
        for (const c of live.values()) if (target === ALL_CUBES || c.id === target) { c.lastFrameAt = frame.at; c.index = 0 }
        return { ok: true, armed, dropped: clean.dropped, blanked: zoned.blanked, cubes: state().cubes }
    }

    const blackout = () => {
        frames.all = null
        frames.byCube.clear()
        for (const c of live.values()) c.index = 0
        return { ok: true, armed }
    }

    const arm = ({ armed: want, confirm } = {}) => {
        if (want !== true) {
            if (armed) for (const c of live.values()) send(c, proto.setOutput(false), proto.PORT.CMD)
            armed = false
            if (timer) { stopEvery(timer); timer = null }
            return { ok: true, armed }
        }
        if (confirm !== ARM_PHRASE) return { ok: false, armed, error: `arming needs the sign-off phrase exactly: "${ARM_PHRASE}"` }
        armed = true
        openSocket()
        for (const c of live.values()) {
            send(c, proto.enableBufferSizeResponse(true), proto.PORT.CMD)
            send(c, proto.setOutput(true), proto.PORT.CMD)
        }
        if (!timer && !sim()) timer = every(tick, TICK_MS)
        log?.warn?.(`[laser] ARMED (${sim() ? 'sim: no cube addresses, nothing is sent' : `${config.cubes.filter((c) => c.ip).length} cubes`})`)
        return { ok: true, armed }
    }

    /** What the room's laser view and the editor read: the kept frames, armed or not. */
    const framesView = () => ({
        armed,
        sim: sim(),
        all: frames.all ? frames.all.points : null,
        byCube: Object.fromEntries([...frames.byCube.entries()].map(([id, f]) => [id, f.points])),
        cubes: [...live.keys()]
    })

    const close = () => {
        arm({ armed: false })
        if (socket) { try { socket.close() } catch { /* already closed */ } socket = null }
    }

    return { state, setFrame, blackout, arm, frames: framesView, close, tick }
}

module.exports = { createLaserEngine, applyZone, normaliseZone, ARM_PHRASE, DEFAULT_ZONE, TICK_MS }
