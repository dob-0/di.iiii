// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { generateShape, LASER_SHAPES } from '../../../src/project/nodes/laser.shape/laserShapes.js'

const require = createRequire(import.meta.url)
const proto = require('./lasercubeProtocol')
const { createLaserEngine, applyZone, normaliseZone, stillBeams, dwellSpots, ARM_PHRASE, GUARD } = require('./laserEngine')

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
    it('none of the Laser node\'s eight shapes is still at size 0.05 or more; every one is at 0 (collapsed)', () => {
        for (const shape of LASER_SHAPES) {
            for (const points of [120, 500]) {
                for (const size of [0.5, 0.1, 0.05]) {
                    const frame = applyZone(generateShape({ shape, size, height: 0.5, points }), normaliseZone()).points
                    expect(stillBeams(frame), `${shape} size ${size} × ${points}`).toEqual([])
                }
                const collapsed = applyZone(generateShape({ shape, size: 0, height: 0.5, points }), normaliseZone()).points
                expect(stillBeams(collapsed).length, `${shape} collapsed`).toBeGreaterThan(0)
            }
        }
    })
    it('keeps the measured headroom the dwell share was chosen on (5.9 % / 21.0 % / 39.7 %)', () => {
        const worst = (size) => Math.max(...LASER_SHAPES.flatMap((shape) => [120, 500].map((points) => dwellSpots(applyZone(generateShape({ shape, size, height: 0.5, points }), normaliseZone()).points, { minShare: 0 })[0].share)))
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
        for (const s of socket.sent) expect({ port: s.port, bytes: [...s.buf] }).toEqual({ port: proto.PORT.CMD, bytes: [0x77] })
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

        const { engine, socket, answer } = engineWith(CUBES)
        answer('10.0.0.51')
        socket.sent.length = 0
        expect(engine.arm({ armed: true, confirm: ARM_PHRASE })).toMatchObject({ ok: true, armed: true, refused: ['cube-2'] })
        expect(socket.sent.filter((s) => s.ip === '10.0.0.52' && s.buf[0] === 0x80)).toEqual([])
        expect(engine.state().cubes[1]).toMatchObject({ armed: false, stop: { reason: 'no-info' } })
        engine.setFrame('all', circle)
        engine.tick()
        expect(dataTo(socket, '10.0.0.52')).toEqual([])
        expect(dataTo(socket, '10.0.0.51').length).toBeGreaterThan(0)
        // Its info arrives; arming again brings it in.
        answer('10.0.0.52', { ip: [10, 0, 0, 52] })
        engine.arm({ armed: true, confirm: ARM_PHRASE })
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
            rig.engine.setFrame('all', circle)
            rig.socket.sent.length = 0
            rig.engine.tick()
            return pointsIn(dataTo(rig.socket))
        }
        expect(run({ dac: 20000, max: 40000 })).toBe(400) // 20 ms of 20 kpps
        expect(run({ dac: 60000, max: 35000 })).toBe(700) // the maximum is the ceiling
        expect(run({ dac: 30000, max: 35000 }, { ...ONE, dacRate: 25000 })).toBe(500) // laser.json may cap it lower
    })
    it('sends no more than a cube says it has room for', () => {
        const { engine, socket, hear } = armedWith(ONE)
        engine.setFrame('all', [[0, 0.5, 1, 1, 1], [0.3, 0.5, 1, 1, 1]])
        hear('10.0.0.51', [0x8a, 0, 250, 0])
        socket.sent.length = 0
        engine.tick()
        expect(pointsIn(dataTo(socket))).toBe(50) // 250 free − the 200-sample margin
    })
    it('counts what the cube has played since its last answer, at its DAC rate', () => {
        const { engine, socket, hear, at } = armedWith(ONE)
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
    it('starts a new frame where the playing one ends, so a figure is never torn', () => {
        const { engine, socket } = armedWith(ONE)
        const long = Array.from({ length: 1000 }, (_, i) => [Math.cos(i / 100), 0.5, 1, 0, 0])
        engine.setFrame('all', long)
        engine.tick() // one tick at 30 kpps: points 0…599
        engine.setFrame('all', circle)
        socket.sent.length = 0
        engine.tick() // the long frame goes on (600…999), then the circle starts
        const msgs = dataTo(socket)
        expect(pointsIn(msgs)).toBe(600)
        expect(msgs[0].buf.readUInt16LE(4)).toBe(proto.toDeviceCoord(long[600][0]))
        const at400 = msgs.flatMap((s) => Array.from({ length: (s.buf.length - 4) / 10 }, (_, i) => s.buf.readUInt16LE(4 + i * 10)))[400]
        expect(at400).toBe(proto.toDeviceCoord(circle[0][0]))
        expect([msgs[0].buf[3], msgs.at(-1).buf[3]]).toEqual([0, 2]) // the long one, the circle, the circle again
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
        expect(cmds(socket)).toEqual([[0x80, 0], [0x80, 0]])
        expect(socket.sent.map((s) => s.port)).toEqual([proto.PORT.DATA, proto.PORT.CMD, proto.PORT.CMD]) // blank first, then off
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
        expect(cmds(socket)).toEqual([[0x80, 1]])
        expect(litIn(dataTo(socket))).toBeGreaterThan(0)
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
    it('going down: every cube output-off twice and buffer answers off, then the socket closes', async () => {
        const { engine, socket } = armedWith()
        socket.sent.length = 0
        await engine.shutdown()
        expect(socket.sent.map((s) => [s.ip, ...s.buf])).toEqual([
            ['10.0.0.51', 0x80, 0], ['10.0.0.51', 0x80, 0], ['10.0.0.51', 0x78, 0],
            ['10.0.0.52', 0x80, 0], ['10.0.0.52', 0x80, 0], ['10.0.0.52', 0x78, 0]
        ])
        expect(socket.closed).toBe(true)
        expect(engine.state().armed).toBe(false)
    })
})

describe('the still-beam guard', () => {
    const holdStill = (rig, frame, ms) => {
        rig.engine.setFrame('all', frame)
        for (let t = 0; t < ms; t += 20) { rig.at(20); rig.hear('10.0.0.51', [0x80]); rig.engine.alive('all'); rig.engine.tick() }
    }
    it('a still beam held 200 ms blanks the cube; a moving frame then switches it back on', () => {
        const rig = armedWith(ONE)
        holdStill(rig, dot(), GUARD.STILL_HOLD_MS) // ten ticks: 180 ms since the first saw it
        expect(rig.engine.state().cubes[0].stop).toBe(null)
        rig.socket.sent.length = 0
        holdStill(rig, dot(), 20)
        expect(rig.engine.state().cubes[0].stop).toMatchObject({ reason: 'still-beam' })
        expect(cmds(rig.socket)).toEqual([[0x80, 0], [0x80, 0]])
        // The same still frame kept alive: stays off.
        rig.socket.sent.length = 0
        holdStill(rig, dot(), 100)
        expect(rig.socket.sent).toEqual([])
        // A circle: back on.
        holdStill(rig, circle, 20)
        expect(rig.engine.state().cubes[0].stop).toBe(null)
        expect(cmds(rig.socket)).toEqual([[0x80, 1]])
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
