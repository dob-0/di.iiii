// @vitest-environment node
// Fix round 2 for #1233 (re-review R5, R7): each test fails on the PR head 95c2d30ec before this change.
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
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lfx2-')); dirs.push(d)
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
    const step = () => { clock.t += 20; handlers.message(Buffer.from([0x80]), { address: '10.0.0.51' }); engine.tick() }
    const lit = () => sent.filter((s) => s.port === proto.PORT.DATA).reduce((n, s) => {
        for (let o = 4; o < s.buf.length; o += 10) if (s.buf.readUInt16LE(o + 4) || s.buf.readUInt16LE(o + 6) || s.buf.readUInt16LE(o + 8)) n += 1
        return n
    }, 0)
    return { engine, clock, step, lit, sent }
}
const line = Array.from({ length: 100 }, (_, i) => [-0.9 + (1.8 * i) / 99, 0.5, 1, 1, 1])
const deskOn = (rig, keep) => {
    const d = createLaserDesk({ dataDir: tmp(), getEngine: () => rig.engine, now: () => rig.clock.t, setInterval: () => 1, clearInterval: () => {} })
    d.setBlackoutKeepsArm(keep)
    return d
}
// Another Out keeps posting its lit frame, as Laser Out does every 50 ms.
const run = (rig, d, n) => { for (let i = 0; i < n; i++) { rig.engine.setFrame('cube-1', line, 'laser-out-1'); d.tick(); rig.step() } }

describe('R5 desk Blackout in keep-arm mode darkens every cube, the arm kept', () => {
    it('P4: another Out lit, desk released, Blackout: 0 lit points, still armed', () => {
        const rig = rigOf(); const d = deskOn(rig, true)
        run(rig, d, 5); expect(rig.lit()).toBeGreaterThan(0)
        rig.sent.length = 0
        d.setBlackout(true)
        run(rig, d, 10)
        expect(rig.lit()).toBe(0)
        expect(rig.engine.state().cubes[0].armed).toBe(true)
    })
    it('the dark holds while the other Out keeps sending, 7 s, and lifting it lights the cube again without a new arm', () => {
        const rig = rigOf(); const d = deskOn(rig, true)
        run(rig, d, 5); d.setBlackout(true); rig.sent.length = 0
        run(rig, d, 350)
        expect(rig.lit()).toBe(0); expect(rig.engine.state().cubes[0].armed).toBe(true)
        d.setBlackout(false); run(rig, d, 10)
        expect(rig.lit()).toBeGreaterThan(0)
    })
    it('releasing the desk lifts its dark latch (the engine is not left dark for the next Out)', () => {
        const rig = rigOf(); const d = deskOn(rig, true)
        run(rig, d, 3); d.setBlackout(true)
        expect(rig.engine.state().dark).toBe(true)
        d.release()
        expect(rig.engine.state().dark).toBe(false)
    })
    it('default mode is unchanged: Blackout goes to the engine blackout (frames cleared), no latch', () => {
        const rig = rigOf(); const d = deskOn(rig, false)
        run(rig, d, 5); rig.sent.length = 0
        d.setBlackout(true)
        expect(rig.engine.state().dark).toBe(false); expect(rig.engine.frames().blackouts).toBe(1)
    })
})
describe('R7 a look that is itself a still beam says so', () => {
    const src = fs.readFileSync(path.join(__dirname, 'ui/desk.js'), 'utf8')
    it('after a Go on a stopped still-beam look the button says to pick another look', () => {
        expect(src).toMatch(/This look holds a still beam: pick another look/)
        expect(src).toMatch(/stillGone\.add\(stillKey\)/)
    })
})
