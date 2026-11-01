// @vitest-environment node
// Probe P6: the DEFAULT desk Blackout ("Blackout keeps the arm" OFF) disarms every cube and leaves nothing lit,
// whatever another Out (Nodes Laser Out) keeps posting every 50 ms. Fake cube only; no real cube is armed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { createLaserDesk } from './laserDesk.js'

const require = createRequire(import.meta.url)
const proto = require('./lasercubeProtocol')
const { createLaserEngine, ARM_PHRASE } = require('./laserEngine')

const dirs = []
const tmp = (cfg) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lbo-')); dirs.push(d)
    if (cfg) fs.writeFileSync(path.join(d, 'laser.json'), JSON.stringify(cfg))
    return d
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

const info = (ip) => {
    const b = Buffer.alloc(64)
    b[0] = 0x77; b[3] = 1; b[4] = 7; b.writeUInt32LE(30000, 10); b.writeUInt32LE(35000, 14)
    b.writeUInt16LE(5800, 19); b.writeUInt16LE(6000, 21); b[24] = 31; b[25] = 2
    Buffer.from([0xde, 0xad, 0xbe, 0xef, 0, 0x42]).copy(b, 26); Buffer.from(ip.split('.').map(Number)).copy(b, 32); b[37] = 1
    return b
}
const rigOf = () => {
    const sent = []; const handlers = {}; const clock = { t: 1000000 }
    const socket = { send: (buf, port, ip, done) => { sent.push({ buf: Buffer.from(buf), port, ip }); done?.() }, on: (ev, fn) => { handlers[ev] = fn }, bind: () => {}, close: () => {} }
    const engine = createLaserEngine({ dataDir: tmp({ cubes: [{ id: 'cube-1', ip: '10.0.0.51' }] }), createSocket: () => socket, log: null, now: () => clock.t, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0 })
    handlers.message(info('10.0.0.51'), { address: '10.0.0.51' })
    expect(engine.arm({ armed: true, confirm: ARM_PHRASE }).ok).toBe(true)
    handlers.message(Buffer.from([0x8a, 0, 0x70, 0x17]), { address: '10.0.0.51' })
    const step = () => { clock.t += 10; handlers.message(Buffer.from([0x80]), { address: '10.0.0.51' }); engine.tick() }
    const lit = () => sent.filter((s) => s.port === proto.PORT.DATA).reduce((n, s) => {
        for (let o = 4; o < s.buf.length; o += 10) if (s.buf.readUInt16LE(o + 4) || s.buf.readUInt16LE(o + 6) || s.buf.readUInt16LE(o + 8)) n += 1
        return n
    }, 0)
    return { engine, clock, step, lit, sent }
}
const line = Array.from({ length: 100 }, (_, i) => [-0.9 + (1.8 * i) / 99, 0.5, 1, 1, 1])

describe('P6 desk Blackout, default mode, another Out keeps posting lit frames every 50 ms', () => {
    it.each([['desk drawing', false], ['desk released', true]])('leaves 0 lit points over the next 2 s and every cube disarmed (%s)', (_name, released) => {
        const rig = rigOf()
        const d = createLaserDesk({ dataDir: tmp(), getEngine: () => rig.engine, now: () => rig.clock.t, setInterval: () => 1, clearInterval: () => {} })
        d.setBlackoutKeepsArm(false)
        if (released) d.release()
        // 10 ms steps; the Out posts every 5th step (50 ms)
        const run = (ms) => { for (let i = 0; i < ms / 10; i++) { if (i % 5 === 0) rig.engine.setFrame('cube-1', line, 'laser-out-1'); d.tick(); rig.step() } }
        run(500)
        expect(rig.lit()).toBeGreaterThan(0)
        expect(rig.engine.state().cubes[0].armed).toBe(true)
        rig.sent.length = 0
        d.setBlackout(true)
        run(2000)
        const armed = rig.engine.state().cubes.map((c) => c.armed)
        console.log(`P6 (${_name}) lit points after Blackout: ${rig.lit()}; armed flags: ${JSON.stringify(armed)}`)
        expect(rig.lit()).toBe(0)
        expect(armed.every((a) => a === false)).toBe(true)
    })
})
