// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { generateShape, LASER_SHAPES, MARK_SHAPES, MARK_MIN_SIZE } from '../../../src/project/nodes/laser.shape/laserShapes.js'

const require = createRequire(import.meta.url)
const proto = require('./lasercubeProtocol')
const { createLaserEngine, applyZone, normaliseZone, stillBeams, dwellSpots, ARM_PHRASE, GUARD } = require('./laserEngine')
const guards = require('./laserGuards')

const fakeSocket = () => {
    const sent = []
    const handlers = {}
    let closed = false
    return {
        sent,
        handlers,
        get closed() { return closed },
        send: (buf, port, ip, done) => { sent.push({ buf: Buffer.from(buf), port, ip }); done?.() },
        on: (ev, fn) => { handlers[ev] = fn },
        bind: () => {},
        close: () => { closed = true }
    }
}
const withConfig = (config) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-'))
    if (config) fs.writeFileSync(path.join(dir, 'laser.json'), JSON.stringify(config))
    return dir
}

// A GET_FULL_INFO answer laid out as the spec's table says (64 bytes).
const infoAnswer = ({ major = 1, minor = 7, out = 0, dac = 30000, max = 35000, free = 5800, size = 6000, battery = 0, temp = 31, conn = 2, serial = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x42], ip = [10, 0, 0, 51], model = 3, name = 'LaserCube 2W' } = {}) => {
    const b = Buffer.alloc(64)
    b[0] = 0x77
    b[3] = major
    b[4] = minor
    b[5] = out
    b.writeUInt32LE(dac, 10)
    b.writeUInt32LE(max, 14)
    b.writeUInt16LE(free, 19)
    b.writeUInt16LE(size, 21)
    b[23] = battery
    b[24] = temp
    b[25] = conn
    Buffer.from(serial).copy(b, 26)
    Buffer.from(ip).copy(b, 32)
    b[37] = model
    b.write(name, 38, 'latin1')
    return b
}

const engineWith = (config) => {
    const socket = fakeSocket()
    const timers = []
    const clock = { t: 1000000 }
    const engine = createLaserEngine({
        dataDir: withConfig(config),
        createSocket: () => socket,
        log: null,
        now: () => clock.t,
        setInterval: (fn) => { timers.push(fn); return timers.length },
        clearInterval: () => {},
        setTimeout: () => 0
    })
    const answer = (ip, opts) => socket.handlers.message(infoAnswer(opts), { address: ip })
    const hear = (ip, bytes) => socket.handlers.message(Buffer.from(bytes), { address: ip })
    const at = (ms) => { clock.t += ms }
    return { engine, socket, timers, clock, answer, hear, at }
}
const CUBES = { cubes: [{ id: 'cube-1', ip: '10.0.0.51' }, { id: 'cube-2', ip: '10.0.0.52' }] }
const ONE = { cubes: [{ id: 'cube-1', ip: '10.0.0.51' }] }
const cmds = (socket) => socket.sent.filter((s) => s.port === proto.PORT.CMD).map((s) => [...s.buf])
const dataTo = (socket, ip) => socket.sent.filter((s) => s.port === proto.PORT.DATA && (!ip || s.ip === ip))
const pointsIn = (msgs) => msgs.reduce((n, s) => n + (s.buf.length - 4) / 10, 0)
const litIn = (msgs) => msgs.reduce((n, s) => {
    for (let o = 4; o < s.buf.length; o += 10) if (s.buf.readUInt16LE(o + 4) || s.buf.readUInt16LE(o + 6) || s.buf.readUInt16LE(o + 8)) n += 1
    return n
}, 0)
const circle = generateShape({ shape: 'circle', size: 0.5, height: 0.5, points: 120 })
const dot = (x = 0.2, y = 0.5, n = 60) => Array.from({ length: n }, () => [x, y, 0, 1, 0])
// Armed and streaming: both cubes answered, then armed.
const armedWith = (config = CUBES) => {
    const rig = engineWith(config)
    for (const c of config.cubes) rig.answer(c.ip)
    expect(rig.engine.arm({ armed: true, confirm: ARM_PHRASE }).ok).toBe(true)
    for (const c of config.cubes) rig.hear(c.ip, [0x8a, 0, 0x70, 0x17]) // the clear is confirmed: 6000 free
    return rig
}

// A cube with a small ring buffer, so the free count (not the LEAD_MS cushion) is what limits a send.
const armedSmallBuffer = () => {
    const rig = engineWith(ONE)
    rig.answer('10.0.0.51', { size: 1000 })
    expect(rig.engine.arm({ armed: true, confirm: ARM_PHRASE }).ok).toBe(true)
    rig.hear('10.0.0.51', [0x8a, 0, 0xe8, 0x03]) // the clear is confirmed: 1000 free
    return rig
}

describe('the LaserCube protocol', () => {
    it('writes a sample-data message: header, then 10 bytes a point, little-endian, centre 0x800', () => {
        const buf = proto.encodeSampleData([[0, 0, 1, 0, 0.5], [-1, 1, 0, 0, 0]], 7, 3)
        expect([...buf.subarray(0, 4)]).toEqual([0xa9, 0, 7, 3])
        expect(buf.length).toBe(4 + 2 * 10)
        expect(buf.readUInt16LE(4)).toBe(0x800)
        expect(buf.readUInt16LE(8)).toBe(0xfff)
        expect(buf.readUInt16LE(12)).toBe(Math.round(0.5 * 0xfff))
        expect(buf.readUInt16LE(14)).toBe(0)
        expect(buf.readUInt16LE(16)).toBe(0xfff)
    })
    it('never puts more than 140 points in one message', () => {
        const buf = proto.encodeSampleData(Array.from({ length: 300 }, () => [0, 0, 0, 0, 0]), 0, 0)
        expect(buf.length).toBe(4 + 140 * 10)
    })
    it('reads the free buffer from both answers, and nothing from anything else', () => {
        expect(proto.parseBufferFree(Buffer.from([0x8a, 0, 0x34, 0x12]))).toBe(0x1234)
        expect(proto.parseBufferFree(Buffer.from([0xa9, 0x10, 0x02]))).toBe(0x0210)
        expect(proto.parseBufferFree(Buffer.from([0x77, 1, 2, 3]))).toBe(null)
    })
    it('reads every field of the GET_FULL_INFO answer at the spec\'s offsets', () => {
        expect(proto.parseFullInfo(infoAnswer({ out: 1, dac: 30000, max: 40000, free: 5800, size: 6000, battery: 77, temp: 31, conn: 2 }))).toEqual({
            firmware: '1.7',
            outputEnabled: true,
            statusFlags: 1,
            interlockEnabled: false,
            temperatureWarning: false,
            overTemperature: false,
            packetErrors: 0,
            dacRate: 30000,
            maxDacRate: 40000,
            rxBufferFree: 5800,
            rxBufferSize: 6000,
            batteryPercent: 77,
            temperature: 31,
            connectionType: 'Ethernet',
            serial: 'deadbeef0042',
            ip: '10.0.0.51',
            modelNumber: 3,
            modelName: 'LaserCube 2W'
        })
    })
    it('reads a model name that fills the answer to its last byte, and refuses what is not an info answer', () => {
        const full = infoAnswer({ name: 'X'.repeat(26), conn: 9 })
        expect(proto.parseFullInfo(full)).toMatchObject({ modelName: 'X'.repeat(26), connectionType: 'unknown (9)' })
        expect(proto.parseFullInfo(Buffer.from([0x8a, 0, 1, 2]))).toBe(null)
        expect(proto.parseFullInfo(infoAnswer().subarray(0, 37))).toBe(null)
        expect(proto.parseFullInfo('0x77')).toBe(null)
    })
})

describe('the keep-in zone', () => {
    it('blanks and pulls in every point outside, keeps the rest', () => {
        const zone = normaliseZone({ yMin: 0 })
        const { points, blanked } = applyZone([[0.5, 0.5, 1, 0, 0], [0.5, -0.5, 1, 1, 1], [0, -1, 0, 0, 0]], zone)
        expect(points).toEqual([[0.5, 0.5, 1, 0, 0], [0.5, 0, 0, 0, 0], [0, 0, 0, 0, 0]])
        expect(blanked).toBe(1)
    })
    it('defaults to the upper half of the field, and refuses a zone that is inside out', () => {
        expect(normaliseZone()).toEqual({ xMin: -1, xMax: 1, yMin: 0, yMax: 1 })
        expect(normaliseZone({ yMin: 0.8, yMax: 0.2 })).toMatchObject({ yMin: 0, yMax: 1 })
        expect(normaliseZone({ xMin: -5 }).xMin).toBe(-1)
    })
})

describe('still beams in a frame', () => {
    it('a dot is a still beam; so are two dots with blank moves between (two static beams)', () => {
        const [one, ...more] = stillBeams(dot())
        expect(more).toEqual([])
        expect(one).toMatchObject({ share: 1, kind: 'dot' })
        expect(one.x).toBeCloseTo(0.2, 9)
        expect(one.y).toBeCloseTo(0.5, 9)
        const two = [...dot(-0.3, 0.4, 40), [0, 0.4, 0, 0, 0], ...dot(0.3, 0.4, 40), [0, 0.4, 0, 0, 0]]
        const found = stillBeams(two)
        expect(found.map((s) => s.kind)).toEqual(['dot', 'dot'])
        expect(found.map((s) => Number(s.x.toFixed(9)))).toEqual([-0.3, 0.3])
    })
    it('a figure that parks half its time in one spot is a still beam; a dark frame is not', () => {
        const parked = [...dot(0.1, 0.5, 60), ...generateShape({ shape: 'line', size: 0.5, height: 0.5, points: 59 })]
        const found = stillBeams(parked)
        expect(found).toHaveLength(1)
        expect(found[0].kind).toBe('dwell')
        expect(found[0].share).toBeGreaterThanOrEqual(0.5)
        expect(found[0].x).toBeCloseTo(0.1, 2)
        expect(stillBeams(dot().map(([x, y]) => [x, y, 0, 0, 0]))).toEqual([])
    })
    it('no Laser shape is still at size 0.05 or more (the sparkles from MARK_MIN_SIZE); every one is at 0 (collapsed)', () => {
        for (const shape of LASER_SHAPES) {
            for (const points of [120, 500]) {
                for (const size of MARK_SHAPES.includes(shape) ? [0.5, MARK_MIN_SIZE] : [0.5, 0.1, 0.05]) {
                    const frame = applyZone(generateShape({ shape, size, height: 0.5, points }), normaliseZone()).points
                    expect(stillBeams(frame), `${shape} size ${size} × ${points}`).toEqual([])
                }
                const collapsed = applyZone(generateShape({ shape, size: 0, height: 0.5, points }), normaliseZone()).points
                expect(stillBeams(collapsed).length, `${shape} collapsed`).toBeGreaterThan(0)
            }
        }
    })
    // The share was chosen on the first twelve shapes (circle … grid); the shapes added on 2026-10-29 are held in
    // laserGuards.test.js, as the engine judges them (optimised).
    it('keeps the measured headroom the dwell share was chosen on (5.9 % / 21.0 % / 39.7 %)', () => {
        const worst = (size) => Math.max(...LASER_SHAPES.slice(0, 12).flatMap((shape) => [120, 500].map((points) => dwellSpots(applyZone(generateShape({ shape, size, height: 0.5, points }), normaliseZone()).points, { minShare: 0 })[0].share)))
        expect(worst(0.5)).toBeCloseTo(0.059, 2)
        expect(worst(0.1)).toBeCloseTo(0.21, 2)
        expect(worst(0.05)).toBeCloseTo(0.397, 2)
        expect(worst(0.05)).toBeLessThan(GUARD.STILL_DWELL_SHARE)
    })
})

describe('the laser engine', () => {
    it('starts DISARMED and sends nothing but the info question while disarmed, whatever frames arrive', () => {
        const { engine, socket, timers } = engineWith(CUBES)
        expect(engine.state().armed).toBe(false)
        engine.setFrame('all', [[0, 0.5, 1, 1, 1]])
        engine.tick()
        for (const t of timers) t()
        expect(socket.sent.length).toBeGreaterThan(0)
        // Only the info question, and output-off (always allowed, sent when the socket opens: row 8).
        for (const s of socket.sent) expect([[0x77], [0x80, 0]]).toContainEqual([...s.buf])
        for (const s of socket.sent) expect(s.port).toBe(proto.PORT.CMD)
        expect(new Set(socket.sent.map((s) => s.ip))).toEqual(new Set(['10.0.0.51', '10.0.0.52']))
    })
    it('shows each cube\'s info in the state once it has answered', () => {
        const { engine, answer, at } = engineWith(CUBES)
        expect(engine.state().cubes[0].info).toBe(null)
        answer('10.0.0.51', { temp: 28, max: 40000 })
        at(500)
        const [one, two] = engine.state().cubes
        expect(one).toMatchObject({ connected: true, rate: 30000, info: { firmware: '1.7', temperature: 28, maxDacRate: 40000, serial: 'deadbeef0042', modelName: 'LaserCube 2W', connectionType: 'Ethernet', ageMs: 500 } })
        expect(two).toMatchObject({ connected: false, info: null, rate: null })
    })
    it('arms only with the exact sign-off phrase', () => {
        const { engine, answer } = engineWith(CUBES)
        answer('10.0.0.51')
        expect(engine.arm({ armed: true }).ok).toBe(false)
        expect(engine.arm({ armed: true, confirm: 'yes' }).armed).toBe(false)
        expect(engine.arm({ armed: true, confirm: ARM_PHRASE })).toMatchObject({ ok: true, armed: true })
    })
    it('refuses to arm a cube whose info never arrived — and refuses to arm at all when none did', () => {
        const none = engineWith(CUBES)
        none.socket.sent.length = 0
        expect(none.engine.arm({ armed: true, confirm: ARM_PHRASE })).toMatchObject({ ok: false, armed: false })
        expect(cmds(none.socket)).not.toContainEqual([0x80, 1])

        const { engine, socket, answer, hear } = engineWith(CUBES)
        answer('10.0.0.51')
        socket.sent.length = 0
        expect(engine.arm({ armed: true, confirm: ARM_PHRASE })).toMatchObject({ ok: true, armed: true, refused: ['cube-2'] })
        hear('10.0.0.51', [0x8a, 0, 0x70, 0x17])
        expect(socket.sent.filter((s) => s.ip === '10.0.0.52' && s.buf[0] === 0x80)).toEqual([])
        expect(engine.state().cubes[1]).toMatchObject({ armed: false, stop: { reason: 'no-info' } })
        engine.setFrame('all', circle)
        engine.tick()
        expect(dataTo(socket, '10.0.0.52')).toEqual([])
        expect(dataTo(socket, '10.0.0.51').length).toBeGreaterThan(0)
        // Its info arrives; arming again brings it in.
        answer('10.0.0.52', { ip: [10, 0, 0, 52] })
        engine.arm({ armed: true, confirm: ARM_PHRASE })
        hear('10.0.0.52', [0x8a, 0, 0x70, 0x17])
        expect(engine.state().cubes[1]).toMatchObject({ armed: true, stop: null })
    })
    it('armed: switches the cubes on, then streams the frame in ≤140-point messages to the data port', () => {
        const { socket } = armedWith()
        expect(cmds(socket)).toContainEqual([0x80, 1])
    })
    it('streams to both cubes in ≤140-point messages', () => {
        const { engine, socket } = armedWith()
        engine.setFrame('all', Array.from({ length: 300 }, (_, i) => [Math.cos(i), 0.5, 0, 1, 0]))
        engine.tick()
        const data = dataTo(socket)
        expect(data.length).toBeGreaterThan(0)
        expect(new Set(data.map((s) => s.ip))).toEqual(new Set(['10.0.0.51', '10.0.0.52']))
        for (const s of data) { expect(s.buf[0]).toBe(0xa9); expect((s.buf.length - 4) / 10).toBeLessThanOrEqual(140) }
    })
    it('paces each cube to its own DAC rate, never above its maximum', () => {
        const run = (info, config = ONE) => {
            const rig = engineWith(config)
            rig.answer('10.0.0.51', info)
            rig.engine.arm({ armed: true, confirm: ARM_PHRASE })
            rig.hear('10.0.0.51', [0x8a, 0, 0x70, 0x17])
            rig.engine.setFrame('all', circle)
            rig.socket.sent.length = 0
            rig.engine.tick()
            return pointsIn(dataTo(rig.socket))
        }
        expect(run({ dac: 20000, max: 40000 })).toBe(1200) // the priming: LEAD_MS (60 ms) of 20 kpps
        expect(run({ dac: 60000, max: 35000 })).toBe(2100) // the maximum is the ceiling
        expect(run({ dac: 30000, max: 35000 }, { ...ONE, dacRate: 25000 })).toBe(1800) // laser.json's dacRate is only a request: the cube plays 30 kpps
    })
    it('sends no more than a cube says it has room for', () => {
        const { engine, socket, hear } = armedSmallBuffer()
        engine.setFrame('all', [[0, 0.5, 1, 1, 1], [0.3, 0.5, 1, 1, 1]])
        hear('10.0.0.51', [0x8a, 0, 250, 0])
        socket.sent.length = 0
        engine.tick()
        expect(pointsIn(dataTo(socket))).toBe(50) // 250 free − the 200-sample margin
    })
    it('counts what the cube has played since its last answer, at its DAC rate', () => {
        const { engine, socket, hear, at } = armedSmallBuffer()
        engine.setFrame('all', circle)
        hear('10.0.0.51', [0x8a, 0, 250, 0])
        at(10) // 10 ms at 30 kpps: 300 more played
        socket.sent.length = 0
        engine.tick()
        expect(pointsIn(dataTo(socket))).toBe(350)
    })
    it('disarming switches every cube off twice and stops the stream', () => {
        const { engine, socket } = armedWith()
        socket.sent.length = 0
        engine.arm({ armed: false })
        expect(cmds(socket).filter((b) => b[0] === 0x80)).toEqual([[0x80, 0], [0x80, 0], [0x80, 0], [0x80, 0]])
        socket.sent.length = 0
        engine.setFrame('all', [[0, 0.5, 1, 1, 1]])
        engine.tick()
        expect(dataTo(socket)).toEqual([])
    })
    it('applies the zone to every frame it keeps, and blackout drops them all', () => {
        const { engine } = engineWith(CUBES)
        const out = engine.setFrame('cube-2', [[0, -0.5, 1, 1, 1]])
        expect(out).toMatchObject({ ok: true, blanked: 1 })
        expect(engine.frames().byCube['cube-2']).toEqual([[0, 0, 0, 0, 0]])
        engine.blackout()
        expect(engine.frames()).toMatchObject({ all: null, byCube: {} })
    })
    it('refuses a cube it does not know', () => {
        const { engine } = engineWith(CUBES)
        expect(engine.setFrame('cube-9', [[0, 0.5, 1, 1, 1]]).ok).toBe(false)
        expect(engine.alive('cube-9').ok).toBe(false)
    })
    it('without cube addresses: six sim cubes, frames kept for the room, no socket ever opened', () => {
        let opened = false
        const engine = createLaserEngine({ dataDir: withConfig(null), createSocket: () => { opened = true; return fakeSocket() }, log: null, setInterval: () => 0, clearInterval: () => {} })
        expect(engine.state()).toMatchObject({ sim: true, armed: false })
        expect(engine.state().cubes.map((c) => c.id)).toEqual(['cube-1', 'cube-2', 'cube-3', 'cube-4', 'cube-5', 'cube-6'])
        engine.setFrame('all', [[0, 0.5, 1, 1, 1]])
        expect(engine.arm({ armed: true, confirm: ARM_PHRASE })).toMatchObject({ ok: true, armed: true })
        engine.tick()
        expect(opened).toBe(false)
        expect(engine.frames().all).toEqual([[0, 0.5, 1, 1, 1]])
    })
    it('starts a new frame where the playing one ends, so a figure is never torn (both as the guards draw them)', () => {
        const { engine, socket, at } = armedWith(ONE)
        const long = Array.from({ length: 1000 }, (_, i) => [Math.cos(i / 100), 0.5, 1, 0, 0])
        const plan = guards.pathPlan(guards.DEFAULT_GUARDS, 30000)
        const longOut = guards.optimisePath(long, plan).points
        const circleOut = guards.optimisePath(circle, plan).points
        engine.setFrame('all', long)
        engine.tick() // the first stream primes LEAD_MS (60 ms = 1800 points at 30 kpps): the long frame from the centre, wrapping if it is shorter
        const first = dataTo(socket).flatMap((s) => Array.from({ length: (s.buf.length - 4) / 10 }, (_, i) => s.buf.readUInt16LE(4 + i * 10)))
        const bridgeIn = guards.bridgePath([0, 0], longOut[0], plan).length
        engine.setFrame('all', circle)
        socket.sent.length = 0
        at(20) // the next 20 ms tick: pacing sends what the elapsed time makes due
        engine.tick() // the long frame goes on to its end, then a bridge, then the circle
        const msgs = dataTo(socket)
        expect(pointsIn(msgs)).toBe(600)
        const xs = msgs.flatMap((s) => Array.from({ length: (s.buf.length - 4) / 10 }, (_, i) => s.buf.readUInt16LE(4 + i * 10)))
        const rest = longOut.slice((first.length - bridgeIn) % longOut.length)
        const bridge = guards.bridgePath(longOut.at(-1), circleOut[0], plan)
        const want = [...rest, ...bridge, ...circleOut, ...circleOut].slice(0, 600).map((p) => proto.toDeviceCoord(p[0]))
        expect(first.length).toBe(1800)
        expect(xs).toEqual(want)
    })
})

describe('the signal-loss stop', () => {
    it('a lit frame not refreshed for 200 ms: the cube is blanked and sent output-off twice, then nothing', () => {
        const { engine, socket, at } = armedWith(ONE)
        engine.setFrame('all', circle)
        at(GUARD.FRAME_TIMEOUT_MS)
        engine.tick()
        expect(litIn(dataTo(socket))).toBeGreaterThan(0)
        socket.sent.length = 0
        at(1)
        engine.tick()
        const blank = dataTo(socket)
        expect(blank).toHaveLength(1)
        expect(litIn(blank)).toBe(0)
        expect(cmds(socket)).toEqual([[0x8d], [0x8d], [0x8a], [0x80, 0], [0x80, 0]])
        expect(socket.sent.map((s) => s.port)).toEqual([proto.PORT.CMD, proto.PORT.CMD, proto.PORT.CMD, proto.PORT.DATA, proto.PORT.CMD, proto.PORT.CMD]) // clear ×2, ask free, park, then off ×2
        expect(engine.state().cubes[0]).toMatchObject({ armed: true, stop: { reason: 'no-frame' } })
        expect(engine.frames().stopped).toEqual({ 'cube-1': 'no-frame' })
        socket.sent.length = 0
        at(20)
        engine.tick()
        expect(socket.sent).toEqual([])
    })
    it('the editor\'s keep-alive holds a frame up; a fresh frame after a stop switches the cube back on', () => {
        const { engine, socket, at, hear } = armedWith(ONE)
        engine.setFrame('all', circle)
        for (let i = 0; i < 10; i += 1) { at(50); hear('10.0.0.51', [0x80]); expect(engine.alive('all')).toMatchObject({ ok: true, kept: true }); engine.tick() }
        expect(engine.state().cubes[0].stop).toBe(null)
        at(250)
        engine.tick()
        expect(engine.state().cubes[0].stop).toMatchObject({ reason: 'no-frame' })
        socket.sent.length = 0
        at(10)
        engine.alive('all')
        engine.tick()
        // R2-1: the clear is sent, but NOTHING streams until the cube confirms it (0x8a)
        expect(cmds(socket)).toEqual([[0x8d], [0x8d], [0x8a], [0x80, 1]])
        expect(dataTo(socket)).toEqual([])
        hear('10.0.0.51', [0x8a, 0, 0x70, 0x17])
        engine.alive('all')
        engine.tick()
        expect(litIn(dataTo(socket))).toBeGreaterThan(0)
        // the first data after a clear starts blank at the park (the bridge from the park point)
        const first = dataTo(socket)[0].buf
        expect([first.readUInt16LE(4), first.readUInt16LE(6), first.readUInt16LE(8), first.readUInt16LE(10), first.readUInt16LE(12)]).toEqual([0x800, 0x800, 0, 0, 0])
        expect(engine.state().cubes[0].stop).toBe(null)
    })
    it('a blackout is not a signal loss: nothing lit, nothing to stop', () => {
        const { engine, socket, at } = armedWith(ONE)
        engine.setFrame('all', circle)
        engine.blackout()
        at(1000)
        socket.sent.length = 0
        engine.tick()
        expect(engine.state().cubes[0].stop).toBe(null)
        expect(cmds(socket)).toEqual([])
        expect(litIn(dataTo(socket))).toBe(0)
    })
    it('a cube silent for 3 s is stopped and stays stopped until armed again', () => {
        const { engine, socket, at, answer } = armedWith(ONE)
        engine.setFrame('all', circle)
        for (let i = 0; i < 16; i += 1) { at(190); engine.alive('all'); engine.tick() } // 3.04 s, never heard
        expect(engine.state().cubes[0]).toMatchObject({ armed: false, connected: false, stop: { reason: 'link-lost' } })
        expect(cmds(socket).filter((b) => b[0] === 0x80).slice(-2)).toEqual([[0x80, 0], [0x80, 0]])
        answer('10.0.0.51')
        socket.sent.length = 0
        engine.alive('all')
        engine.tick()
        expect(dataTo(socket)).toEqual([])
        engine.arm({ armed: true, confirm: ARM_PHRASE })
        expect(engine.state().cubes[0]).toMatchObject({ armed: true, stop: null })
    })
    it('going down: every armed cube clears its buffer, parks blank at the centre, then output-off twice and buffer answers off, then the socket closes', async () => {
        const { engine, socket } = armedWith()
        socket.sent.length = 0
        await engine.shutdown()
        expect(socket.sent.map((s) => [s.ip, s.port === proto.PORT.DATA ? 'park' : s.buf[0], s.port === proto.PORT.DATA ? litIn([s]) : s.buf[1]])).toEqual([
            ['10.0.0.51', 0x8d, undefined], ['10.0.0.51', 0x8d, undefined], ['10.0.0.51', 'park', 0], ['10.0.0.51', 0x80, 0], ['10.0.0.51', 0x80, 0], ['10.0.0.51', 0x78, 0],
            ['10.0.0.52', 0x8d, undefined], ['10.0.0.52', 0x8d, undefined], ['10.0.0.52', 'park', 0], ['10.0.0.52', 0x80, 0], ['10.0.0.52', 0x80, 0], ['10.0.0.52', 0x78, 0]
        ])
        const park = dataTo(socket, '10.0.0.51')[0].buf
        expect([park.readUInt16LE(park.length - 10), park.readUInt16LE(park.length - 8)]).toEqual([0x800, 0x800])
        expect(socket.closed).toBe(true)
        expect(engine.state().armed).toBe(false)
    })
})

describe('the still-beam guard', () => {
    // `go`: a new Go from the desk, the person who brings a cube back after a still-beam stop (stage audit row 34).
    const holdStill = (rig, frame, ms, go = false) => {
        rig.engine.setFrame('all', frame, null, { go })
        for (let t = 0; t < ms; t += 20) { rig.at(20); rig.hear('10.0.0.51', [0x80]); rig.engine.alive('all'); rig.engine.tick() }
    }
    it('a still beam held 200 ms blanks the cube; a moving frame then switches it back on', () => {
        const rig = armedWith(ONE)
        holdStill(rig, dot(), GUARD.STILL_HOLD_MS) // ten ticks: 180 ms since the first saw it
        expect(rig.engine.state().cubes[0].stop).toBe(null)
        rig.socket.sent.length = 0
        holdStill(rig, dot(), 20)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
        expect(cmds(rig.socket)).toEqual([[0x8d], [0x8d], [0x8a], [0x80, 0], [0x80, 0]])
        // The same still frame kept alive: stays off.
        rig.socket.sent.length = 0
        holdStill(rig, dot(), 100)
        expect(rig.socket.sent).toEqual([])
        // A circle: a moving frame alone leaves it dark; a new Go brings it back.
        holdStill(rig, circle, 20)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam', needsPerson: true })
        holdStill(rig, circle, 20, true)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
        expect(cmds(rig.socket)).toEqual([[0x8d], [0x8d], [0x8a], [0x80, 1]])
        expect(dataTo(rig.socket)).toEqual([])
    })
    it('a moving figure is never stopped, however long it is held', () => {
        const rig = armedWith(ONE)
        holdStill(rig, circle, 2000)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
        expect(rig.engine.state().cubes[0].stops).toMatchObject({ 'still-beam': 0, 'no-frame': 0 })
    })
    it('a still beam the officer approved for that cube in laser.json is allowed; one elsewhere is not', () => {
        const config = { cubes: [{ id: 'cube-1', ip: '10.0.0.51', stillBeams: [{ x: 0.2, y: 0.5 }] }] }
        const ok = armedWith(config)
        holdStill(ok, dot(0.205, 0.5), 1000)
        expect(ok.engine.state().cubes[0].stop).toBe(null)
        const elsewhere = armedWith(config)
        holdStill(elsewhere, dot(0.4, 0.5), 400)
        expect(elsewhere.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
    })
    it('runs in sim too, so a rehearsal without cubes shows the stop', () => {
        const clock = { t: 0 }
        const engine = createLaserEngine({ dataDir: withConfig(null), log: null, now: () => clock.t, setInterval: () => 0, clearInterval: () => {} })
        engine.arm({ armed: true, confirm: ARM_PHRASE })
        engine.setFrame('cube-3', dot())
        for (let i = 0; i < 12; i += 1) { clock.t += 20; engine.alive('cube-3'); engine.tick() }
        expect(engine.state().cubes[2].stop).toMatchObject({ reason: 'still-beam' })
        expect(engine.frames().stopped).toEqual({ 'cube-3': 'still-beam' })
    })
})

// A cube's ring buffer played at its DAC rate, to count what the engine's pacing does to it (ledger N1501.18).
describe('the engine sends every point on time (catch-up pacing)', () => {
    const RATE = 30000
    const SIZE = 6000
    const run = ({ gaps, frame = circle }) => {
        const { engine, socket, clock, hear } = armedWith(ONE)
        engine.setFrame('all', frame)
        socket.sent.length = 0
        let buffered = 0
        let sent = 0
        let underruns = 0
        let overflow = 0
        let elapsed = 0
        let seen = 0
        for (const gap of gaps) {
            clock.t += gap
            elapsed += gap
            const played = (RATE * gap) / 1000
            if (buffered < played && sent > 0) underruns += 1
            buffered = Math.max(0, buffered - played)
            engine.setFrame('all', frame) // the sender keeps the frame fresh (signal-loss guard)
            engine.tick()
            const total = pointsIn(dataTo(socket))
            buffered += total - seen
            sent += total - seen
            seen = total
            if (buffered > SIZE) overflow += 1
            hear('10.0.0.51', [0x8a, 0, Math.max(0, Math.floor(SIZE - buffered)) & 0xff, Math.max(0, Math.floor(SIZE - buffered)) >> 8])
        }
        return { sent, elapsed, underruns, overflow, socket }
    }
    it('ticks 5 ms late still deliver the due points over 1 s within 1 %', () => {
        const gaps = Array.from({ length: 40 }, () => 25) // a 20 ms timer firing 5 ms late, every time
        const r = run({ gaps })
        const due = (RATE * (r.elapsed - gaps[0] + 60)) / 1000 // the first tick sends the priming, LEAD_MS ahead, not its gap
        expect(Math.abs(r.sent - due) / due).toBeLessThan(0.01)
        expect(r.overflow).toBe(0)
    })
    it('a 20 ms blocked loop is caught up without overflowing the buffer; only the blocked tick can starve the cube', () => {
        const gaps = [20, 20, 20, 20, 40, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]
        const r = run({ gaps })
        expect(r.overflow).toBe(0)
        expect(r.underruns).toBe(0) // the priming holds 60 ms: a 40 ms tick eats the cushion, it does not starve the cube
        const due = (RATE * (r.elapsed - gaps[0] + 60)) / 1000
        expect(Math.abs(r.sent - due) / due).toBeLessThan(0.02)
    })
    it('a long stall is not banked: the catch-up is capped and the buffer free count still caps the send', () => {
        const r = run({ gaps: [20, 20, 2000, 20] })
        expect(r.overflow).toBe(0)
    })
    // The lit points still queued in the cube after a stall, when the show goes dark (blackout or a dark frame).
    const litQueuedAfterStall = (goDark) => {
        const { engine, socket, clock, hear } = armedWith(ONE)
        engine.setFrame('all', circle)
        socket.sent.length = 0
        const queue = [] // one flag per queued point: lit or not
        let seen = 0
        let owed = 0
        const tick = (gap, refresh = true) => {
            clock.t += gap
            owed += (RATE * gap) / 1000
            const played = Math.min(queue.length, Math.floor(owed))
            owed -= Math.floor(owed)
            queue.splice(0, played)
            if (refresh) engine.setFrame('all', circle)
            engine.tick()
            for (const s of dataTo(socket).slice(seen)) {
                for (let o = 4; o < s.buf.length; o += 10) queue.push(Boolean(s.buf.readUInt16LE(o + 4) || s.buf.readUInt16LE(o + 6) || s.buf.readUInt16LE(o + 8)))
            }
            seen = dataTo(socket).length
            const free = Math.max(0, SIZE - queue.length)
            hear('10.0.0.51', [0x8a, 0, free & 0xff, free >> 8])
        }
        for (let i = 0; i < 10; i += 1) tick(20)
        tick(100) // one stall
        for (let i = 0; i < 50; i += 1) tick(20) // then a second of steady ticks
        goDark(engine)
        tick(20, false) // the tick after: the engine feeds nothing lit; what is queued plays on
        return queue.filter(Boolean).length
    }
    it('a blackout after a 100 ms stall clears the cube at once: no lit point queued, output-off within the same tick', () => {
        const { engine, socket, clock, hear } = armedWith(ONE)
        engine.setFrame('all', circle)
        for (let i = 0; i < 10; i += 1) { clock.t += 20; engine.setFrame('all', circle); engine.tick() }
        clock.t += 100 // the stall; the next tick queues LEAD_MS ahead
        engine.setFrame('all', circle)
        engine.tick()
        socket.sent.length = 0
        engine.blackout()
        const sent = cmds(socket)
        expect(sent.filter((b) => b[0] === 0x8d).length).toBeGreaterThanOrEqual(1) // ring buffer cleared
        expect(sent.filter((b) => b[0] === 0x80)).toEqual([[0x80, 0], [0x80, 0]]) // output off, before any tick
        expect(engine.state().armed).toBe(false)
        socket.sent.length = 0
        for (let i = 0; i < 5; i += 1) { clock.t += 20; hear('10.0.0.51', [0x8a, 0, 0, 0]); engine.tick() }
        expect(litIn(dataTo(socket))).toBe(0)
    })
    it('lifting a blackout never turns output on by itself: only the sign-off arms again', () => {
        const { engine, socket, clock } = armedWith(ONE)
        engine.setFrame('all', circle)
        engine.blackout()
        socket.sent.length = 0
        for (let i = 0; i < 5; i += 1) { clock.t += 20; engine.setFrame('all', circle); engine.tick() }
        expect(cmds(socket).filter((b) => b[0] === 0x80 && b[1] === 1)).toEqual([])
        expect(litIn(dataTo(socket))).toBe(0)
        expect(engine.state().armed).toBe(false)
        // the sign-off is forgotten: a cube cannot be turned on again without the phrase
        expect(engine.arm({ armed: true, cube: 'cube-1' })).toMatchObject({ ok: false, needsPhrase: true })
        expect(engine.arm({ armed: true, cube: 'cube-1', confirm: ARM_PHRASE })).toMatchObject({ ok: true, cubeArmed: true })
    })
    it('after a 100 ms stall, a dark frame finds at most LEAD_MS (60 ms) of lit points queued', () => {
        const dark = Array.from({ length: 60 }, () => [0.2, 0.5, 0, 0, 0])
        expect(litQueuedAfterStall((engine) => engine.setFrame('all', dark))).toBeLessThanOrEqual((RATE * 60) / 1000)
    })
    it('every guard still applies to every point sent: a point outside the zone goes out blank', () => {
        const { engine, socket, clock } = armedWith({ zone: { xMin: -0.2, xMax: 0.2, yMin: 0, yMax: 1 }, cubes: ONE.cubes })
        engine.setFrame('all', circle)
        socket.sent.length = 0
        for (let i = 0; i < 10; i += 1) { clock.t += 25; engine.setFrame('all', circle); engine.tick() }
        expect(pointsIn(dataTo(socket))).toBeGreaterThan(1000)
        for (const s of dataTo(socket)) {
            for (let o = 4; o < s.buf.length; o += 10) {
                const lit = s.buf.readUInt16LE(o + 4) || s.buf.readUInt16LE(o + 6) || s.buf.readUInt16LE(o + 8)
                const x = (s.buf.readUInt16LE(o) - 0x800) / 0x800
                if (lit) expect(Math.abs(x)).toBeLessThanOrEqual(0.2 + 1 / 0x800)
            }
        }
    })
})

// Stage audit 2026-10-30 (rows 8, 33, 34, 36): what a stop does to a cube, what a restart leaves lit,
// what an off-field point does, and what the engine says about the points it blanked.
describe('stage audit fixes', () => {
    const OFF = [0x80, 0]
    const cmdsTo = (rig, ip) => rig.socket.sent.filter((s) => s.ip === ip && s.port === proto.PORT.CMD).map((s) => [...s.buf])
    // 100 points along a sweep: a moving beam (two points would be a dwell, hence a still beam)
    const line = Array.from({ length: 100 }, (_, i) => [-0.9 + (1.8 * i) / 99, 0.5, 1, 1, 1])
    // One 20 ms step: the cube is heard, the frame kept alive (or not), the engine ticks.
    const step = (rig, alive = true) => { rig.at(20); rig.hear('10.0.0.51', [0x80]); if (alive) rig.engine.alive('all'); rig.engine.tick() }

    it('row 8: Disarm-all and Blackout send output-off to every addressed cube even when the engine thinks it is disarmed', () => {
        for (const stop of [(e) => e.arm({ armed: false }), (e) => e.blackout()]) {
            const rig = engineWith(CUBES)
            expect(rig.engine.state().armed).toBe(false)
            rig.socket.sent.length = 0
            stop(rig.engine)
            for (const ip of ['10.0.0.51', '10.0.0.52']) expect(cmdsTo(rig, ip).filter((b) => b[0] === 0x80 && b[1] === 0)).toHaveLength(2)
        }
    })
    it('row 8: when the socket opens, every addressed cube gets output-off twice before anything else', () => {
        const rig = engineWith(CUBES)
        for (const ip of ['10.0.0.51', '10.0.0.52']) {
            const mine = cmdsTo(rig, ip)
            expect(mine.slice(0, 2)).toEqual([OFF, OFF])
            expect(mine[2]).toEqual([0x77])
        }
    })

    it('row 33: a raw point outside -1..1 is blanked and counted, not clamped lit onto the field edge', () => {
        const rig = engineWith({ ...ONE, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 } })
        const out = rig.engine.setFrame('all', [[0, 0, 1, 1, 1], [2, 0.5, 1, 1, 1], { x: 0.5, y: -3, r: 1, g: 0, b: 0 }, [-1.5, 0, 0, 0, 0]])
        expect(out).toMatchObject({ ok: true, blanked: 2 })
        const pts = rig.engine.frames().all
        expect(pts[0].slice(2)).toEqual([1, 1, 1])
        expect(pts[1].slice(2)).toEqual([0, 0, 0])
        expect(pts[2].slice(2)).toEqual([0, 0, 0])
        expect(pts.filter((p) => p[2] + p[3] + p[4] > 0)).toHaveLength(1)
    })

    it('row 36: the blanked and dropped counts are kept per cube and shown in the state', () => {
        const rig = engineWith(CUBES)
        rig.engine.setFrame('cube-1', [[0, 0.5, 1, 1, 1], [3, 0.5, 1, 1, 1], [0.1, 2, 1, 1, 1], ['x', 0, 1, 1, 1]])
        let [one, two] = rig.engine.state().cubes
        expect(one.pointLoss).toEqual({ blanked: 2, dropped: 1, blankedTotal: 2, droppedTotal: 1, frames: 1 })
        expect(two.pointLoss).toEqual({ blanked: 0, dropped: 0, blankedTotal: 0, droppedTotal: 0, frames: 0 })
        rig.engine.setFrame('cube-1', [[0, 0.5, 1, 1, 1], [3, 0.5, 1, 1, 1]])
        ;[one] = rig.engine.state().cubes
        expect(one.pointLoss).toMatchObject({ blanked: 1, dropped: 0, blankedTotal: 3, droppedTotal: 1, frames: 2 })
    })

    describe('row 34: a stopped cube stays dark until a person, or comes back by itself only for a moment', () => {
        const stillStop = (config = ONE) => {
            const rig = armedWith(config)
            rig.engine.setFrame('all', dot())
            for (let i = 0; i < 20; i++) step(rig)
            expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
            return rig
        }
        it('a still-beam stop is not undone by a later moving frame from any sender', () => {
            const rig = stillStop()
            rig.engine.setFrame('all', line)
            for (let i = 0; i < 10; i++) step(rig)
            expect(rig.engine.state().cubes[0]).toMatchObject({ armed: true, stop: { reason: 'still-beam', needsPerson: true } })
            rig.socket.sent.length = 0
            rig.at(60000) // minutes later, a keep-alive and a frame: still dark
            rig.engine.setFrame('all', line)
            step(rig)
            expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
            expect(rig.socket.sent.filter((s) => s.port === proto.PORT.CMD && s.buf[0] === 0x80 && s.buf[1] === 1)).toEqual([])
        })
        it('a new Go, On, or Release brings it back; each is a person', () => {
            const go = stillStop()
            step(go)
            go.engine.setFrame('all', line, null, { go: true })
            step(go)
            expect(go.engine.state().cubes[0].stop).toBe(null)
            const on = stillStop()
            expect(on.engine.arm({ armed: true, cube: 'cube-1' }).ok).toBe(true)
            // On is a yes, not a relight: it stays dark until a NEW frame that passes the guards (review E1).
            expect(on.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
            on.engine.setFrame('all', line)
            step(on)
            expect(on.engine.state().cubes[0].stop).toBe(null)
            const release = stillStop()
            release.engine.arm({ armed: false, cube: 'cube-1' })
            expect(release.engine.state().cubes[0]).toMatchObject({ armed: false, stop: null })
        })
        it('laser.json stopResume "legacy" keeps the old rule: any fresh moving frame resumes', () => {
            const rig = stillStop({ ...ONE, stopResume: 'legacy' })
            expect(rig.engine.state()).toMatchObject({ stopResume: 'legacy' })
            expect(rig.engine.state().cubes[0].stop.needsPerson).toBe(false)
            step(rig)
            rig.engine.setFrame('all', line)
            step(rig)
            expect(rig.engine.state().cubes[0].stop).toBe(null)
        })
        it('over-temperature stays off: the cube is disarmed and a new Go does not light it', () => {
            const rig = armedWith(ONE)
            rig.answer('10.0.0.51', { out: 8, temp: 70 })
            rig.engine.setFrame('all', line)
            step(rig)
            expect(rig.engine.state().cubes[0]).toMatchObject({ armed: false, stop: { reason: 'over-temperature' } })
            rig.engine.setFrame('all', line, null, { go: true })
            step(rig)
            expect(rig.engine.state().cubes[0].armed).toBe(false)
        })
        it('a no-frame stop resumes by itself within 2 s for the same Out only', () => {
            const rig = armedWith(ONE)
            rig.engine.setFrame('cube-1', line, 'out-a')
            for (let i = 0; i < 4; i++) step(rig, false)
            for (let i = 0; i < 12 && !rig.engine.state().cubes[0].stop; i++) step(rig, false)
            expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'no-frame' })
            rig.at(500)
            rig.engine.setFrame('cube-1', line, 'out-a')
            step(rig)
            expect(rig.engine.state().cubes[0].stop).toBe(null)
        })
        it('a no-frame stop does not resume for another Out, nor after 2 s: the cube is disarmed', () => {
            const stopped = () => {
                const rig = armedWith(ONE)
                rig.engine.setFrame('all', line)
                for (let i = 0; i < 14 && !rig.engine.state().cubes[0].stop; i++) step(rig, false)
                expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'no-frame' })
                return rig
            }
            const other = stopped()
            other.at(300)
            other.engine.setFrame('cube-1', line, 'out-b')
            step(other)
            expect(other.engine.state().cubes[0].stop).toMatchObject({ reason: 'no-frame' })
            const late = stopped()
            for (let i = 0; i < 120; i++) step(late, false) // 2.4 s
            late.engine.setFrame('all', line)
            step(late)
            expect(late.engine.state().cubes[0]).toMatchObject({ armed: false, stop: { reason: 'no-frame' } })
        })
    })
})

// Review fixes E1, E2, E4 (2026-10-30, fix round on the Opus review of #1232).
describe('stage audit review fixes: a stopped cube is never relit by the frame that stopped it', () => {
    const line = Array.from({ length: 100 }, (_, i) => [-0.9 + (1.8 * i) / 99, 0.5, 1, 1, 1])
    const step = (rig) => { rig.at(20); rig.hear('10.0.0.51', [0x80]); rig.engine.alive('all'); rig.engine.tick() }
    const stillStop = () => {
        const rig = armedWith(ONE)
        rig.engine.setFrame('all', dot())
        for (let i = 0; i < 20; i++) step(rig)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
        return rig
    }
    it('E1: On on a cube stopped for a still beam does not send the still dot again; a new passing frame lights it', () => {
        const rig = stillStop()
        rig.socket.sent.length = 0
        expect(rig.engine.arm({ armed: true, cube: 'cube-1' }).ok).toBe(true)
        for (let i = 0; i < 5; i++) step(rig)
        expect(litIn(dataTo(rig.socket))).toBe(0)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
        rig.engine.setFrame('all', line)
        for (let i = 0; i < 5; i++) step(rig)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
        expect(litIn(dataTo(rig.socket))).toBeGreaterThan(0)
    })
    it('E1: a new Go on the same still dot does not light it either', () => {
        const rig = stillStop()
        rig.socket.sent.length = 0
        rig.engine.setFrame('all', dot(), null, { go: true })
        for (let i = 0; i < 5; i++) step(rig)
        expect(litIn(dataTo(rig.socket))).toBe(0)
    })
    it('E2: a cube whose Out let go (claim lapsed) is switched OFF, not left armed', () => {
        const rig = armedWith(ONE)
        rig.engine.setFrame('cube-1', line, 'out-a')
        step(rig)
        rig.socket.sent.length = 0
        rig.at(11000) // CLAIM_TTL_MS is 10 s
        rig.hear('10.0.0.51', [0x80])
        rig.engine.tick()
        expect(rig.engine.state().cubes[0].armed).toBe(false)
        expect(cmds(rig.socket).filter((b) => b[0] === 0x80 && b[1] === 0)).toHaveLength(2)
        rig.engine.setFrame('cube-1', line, 'out-b')
        rig.at(20); rig.hear('10.0.0.51', [0x80]); rig.engine.tick()
        expect(litIn(dataTo(rig.socket))).toBe(0)
    })
    it('E2: a dark frame nobody refreshes switches the cube OFF; a later Out cannot light it', () => {
        const rig = armedWith(ONE)
        rig.engine.setFrame('all', [[0, 0, 0, 0, 0]])
        step(rig)
        expect(rig.engine.state().cubes[0].armed).toBe(true)
        rig.at(6000)
        rig.hear('10.0.0.51', [0x80])
        rig.engine.tick()
        expect(rig.engine.state().cubes[0].armed).toBe(false)
        rig.socket.sent.length = 0
        rig.engine.setFrame('all', line)
        step(rig)
        expect(litIn(dataTo(rig.socket))).toBe(0)
    })
    it('E4: go counts only on a rising edge; a sender that sets it on every frame cannot resume a stopped cube', () => {
        const rig = armedWith(ONE)
        rig.engine.setFrame('all', dot(), 'o1', { go: true })
        for (let i = 0; i < 20; i++) step(rig)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
        rig.engine.setFrame('all', line, 'o1', { go: true })
        step(rig)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
        // a real Go: go off for a frame, then on, and 500 ms apart
        rig.engine.setFrame('all', line, 'o1', { go: false })
        rig.at(600)
        rig.engine.setFrame('all', line, 'o1', { go: true })
        step(rig)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
    })
    it('R1: Off then On does not relight the tripping frame, even while it is refreshed; a different frame lights it', () => {
        const rig = stillStop()
        expect(rig.engine.arm({ armed: false, cube: 'cube-1' }).ok).toBe(true)
        rig.socket.sent.length = 0
        expect(rig.engine.arm({ armed: true, cube: 'cube-1' }).ok).toBe(true)
        for (let i = 0; i < 20; i++) step(rig)
        expect(litIn(dataTo(rig.socket))).toBe(0)
        rig.engine.setFrame('all', line)
        for (let i = 0; i < 5; i++) step(rig)
        expect(litIn(dataTo(rig.socket))).toBeGreaterThan(0)
    })
    it('R2: a cube switched On that never gets a frame is switched OFF after the dark idle time', () => {
        const rig = armedWith(ONE)
        step(rig)
        expect(rig.engine.state().cubes[0].armed).toBe(true)
        rig.at(6000)
        rig.hear('10.0.0.51', [0x80])
        rig.engine.tick()
        expect(rig.engine.state().cubes[0].armed).toBe(false)
        rig.socket.sent.length = 0
        rig.engine.setFrame('all', line)
        step(rig)
        expect(litIn(dataTo(rig.socket))).toBe(0)
    })
})
