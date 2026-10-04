// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const proto = require('./lasercubeProtocol')
const { createLaserEngine, applyZone, normaliseZone, ARM_PHRASE } = require('./laserEngine')

const fakeSocket = () => {
    const sent = []
    const handlers = {}
    return { sent, handlers, send: (buf, port, ip) => sent.push({ buf: Buffer.from(buf), port, ip }), on: (ev, fn) => { handlers[ev] = fn }, bind: () => {}, close: () => {} }
}
const withConfig = (config) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-'))
    if (config) fs.writeFileSync(path.join(dir, 'laser.json'), JSON.stringify(config))
    return dir
}
const engineWith = (config) => {
    const socket = fakeSocket()
    const timers = []
    const engine = createLaserEngine({ dataDir: withConfig(config), createSocket: () => socket, log: null, setInterval: (fn) => { timers.push(fn); return timers.length }, clearInterval: () => {} })
    return { engine, socket, timers }
}
const CUBES = { cubes: [{ id: 'cube-1', ip: '10.0.0.51' }, { id: 'cube-2', ip: '10.0.0.52' }] }

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

describe('the laser engine', () => {
    it('starts DISARMED and sends nothing — not a byte — while disarmed, whatever frames arrive', () => {
        const { engine, socket, timers } = engineWith(CUBES)
        expect(engine.state().armed).toBe(false)
        engine.setFrame('all', [[0, 0.5, 1, 1, 1]])
        engine.tick()
        for (const t of timers) t()
        expect(socket.sent).toEqual([])
    })
    it('arms only with the exact sign-off phrase', () => {
        const { engine } = engineWith(CUBES)
        expect(engine.arm({ armed: true }).ok).toBe(false)
        expect(engine.arm({ armed: true, confirm: 'yes' }).armed).toBe(false)
        expect(engine.arm({ armed: true, confirm: ARM_PHRASE })).toMatchObject({ ok: true, armed: true })
    })
    it('armed: switches the cubes on, then streams the frame in ≤140-point messages to the data port', () => {
        const { engine, socket } = engineWith(CUBES)
        engine.setFrame('all', Array.from({ length: 300 }, (_, i) => [Math.cos(i), 0.5, 0, 1, 0]))
        engine.arm({ armed: true, confirm: ARM_PHRASE })
        const cmds = socket.sent.filter((s) => s.port === proto.PORT.CMD).map((s) => [...s.buf])
        expect(cmds).toContainEqual([0x80, 1])
        engine.tick()
        const data = socket.sent.filter((s) => s.port === proto.PORT.DATA)
        expect(data.length).toBeGreaterThan(0)
        expect(new Set(data.map((s) => s.ip))).toEqual(new Set(['10.0.0.51', '10.0.0.52']))
        for (const s of data) { expect(s.buf[0]).toBe(0xa9); expect((s.buf.length - 4) / 10).toBeLessThanOrEqual(140) }
    })
    it('sends no more than a cube says it has room for', () => {
        const { engine, socket } = engineWith({ cubes: [{ id: 'cube-1', ip: '10.0.0.51' }] })
        engine.setFrame('all', [[0, 0.5, 1, 1, 1]])
        engine.arm({ armed: true, confirm: ARM_PHRASE })
        socket.handlers.message(Buffer.from([0x8a, 0, 250, 0]), { address: '10.0.0.51' })
        socket.sent.length = 0
        engine.tick()
        const points = socket.sent.filter((s) => s.port === proto.PORT.DATA).reduce((n, s) => n + (s.buf.length - 4) / 10, 0)
        expect(points).toBe(50) // 250 free − the 200-sample margin
    })
    it('disarming switches every cube off and stops the stream', () => {
        const { engine, socket } = engineWith(CUBES)
        engine.arm({ armed: true, confirm: ARM_PHRASE })
        socket.sent.length = 0
        engine.arm({ armed: false })
        expect(socket.sent.map((s) => [...s.buf])).toEqual([[0x80, 0], [0x80, 0]])
        socket.sent.length = 0
        engine.setFrame('all', [[0, 0.5, 1, 1, 1]])
        engine.tick()
        expect(socket.sent).toEqual([])
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
    })
    it('without cube addresses: six sim cubes, frames kept for the room, no socket ever opened', () => {
        let opened = false
        const engine = createLaserEngine({ dataDir: withConfig(null), createSocket: () => { opened = true; return fakeSocket() }, log: null })
        expect(engine.state()).toMatchObject({ sim: true, armed: false })
        expect(engine.state().cubes.map((c) => c.id)).toEqual(['cube-1', 'cube-2', 'cube-3', 'cube-4', 'cube-5', 'cube-6'])
        engine.setFrame('all', [[0, 0.5, 1, 1, 1]])
        engine.arm({ armed: true, confirm: ARM_PHRASE })
        engine.tick()
        expect(opened).toBe(false)
        expect(engine.frames().all).toEqual([[0, 0.5, 1, 1, 1]])
    })
})
