// @vitest-environment node
// Review follow-up for #1233: (1) the desk UI's placement sliders match the server's CUBE_RANGE; (2) the engine dark latch.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const proto = require('./lasercubeProtocol')
const { createLaserEngine, ARM_PHRASE } = require('./laserEngine')
const { CUBE_RANGE, normaliseCube } = require('./laserDesk')

describe('slider bounds in ui/desk.js equal CUBE_RANGE in laserDesk.js', () => {
    const src = fs.readFileSync(path.join(__dirname, 'ui/desk.js'), 'utf8')
    for (const key of ['size', 'x', 'y']) {
        it(`${key}: slider min/max are the range the server accepts`, () => {
            const m = src.match(new RegExp(`slider\\('${key}',\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),`))
            expect(m, `no slider('${key}', min, max, step) in desk.js`).toBeTruthy()
            expect([Number(m[1]), Number(m[2])]).toEqual(CUBE_RANGE[key])
            // the ends of the slider are accepted by the strict (person's) path, one step past is refused
            expect(() => normaliseCube({ [key]: CUBE_RANGE[key][0] }, undefined, { strict: true })).not.toThrow()
            expect(() => normaliseCube({ [key]: CUBE_RANGE[key][1] }, undefined, { strict: true })).not.toThrow()
            expect(() => normaliseCube({ [key]: CUBE_RANGE[key][1] + 0.01 }, undefined, { strict: true })).toThrow(RangeError)
        })
    }
    it('order has no slider (arrow buttons only) and its range is the one the server clamps to', () => {
        expect(src).not.toMatch(/slider\('order'/)
        expect(CUBE_RANGE.order).toEqual([-999, 999])
        expect(normaliseCube({ order: 5000 }).order).toBe(999)
    })
})

const dirs = []
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
const infoOf = (ip, last) => {
    const b = Buffer.alloc(64)
    b[0] = 0x77; b[3] = 1; b[4] = 7; b.writeUInt32LE(30000, 10); b.writeUInt32LE(35000, 14)
    b.writeUInt16LE(5800, 19); b.writeUInt16LE(6000, 21); b[24] = 31; b[25] = 2
    Buffer.from([0xde, 0xad, 0xbe, 0xef, 0, last]).copy(b, 26); Buffer.from(ip.split('.').map(Number)).copy(b, 32); b[37] = 1
    return b
}
const IPS = ['10.0.0.51', '10.0.0.52']
const line = Array.from({ length: 100 }, (_, i) => [-0.9 + (1.8 * i) / 99, 0.5, 1, 1, 1])

describe('engine dark latch: dark(true) overrides every sender on every cube, dark(false) clears it', () => {
    it('two cubes, two senders: 0 lit points while latched, both stay armed, lit again after dark(false)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-')); dirs.push(dir)
        fs.writeFileSync(path.join(dir, 'laser.json'), JSON.stringify({ cubes: IPS.map((ip, i) => ({ id: `cube-${i + 1}`, ip })) }))
        const sent = []; const handlers = {}; const clock = { t: 1000000 }
        const socket = { send: (buf, port, ip, done) => { sent.push({ buf: Buffer.from(buf), ip, port }); done?.() }, on: (ev, fn) => { handlers[ev] = fn }, bind: () => {}, close: () => {} }
        const engine = createLaserEngine({ dataDir: dir, createSocket: () => socket, log: null, now: () => clock.t, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0 })
        IPS.forEach((ip, i) => handlers.message(infoOf(ip, 0x40 + i), { address: ip }))
        expect(engine.arm({ armed: true, confirm: ARM_PHRASE }).ok).toBe(true)
        const step = () => {
            clock.t += 20
            engine.setFrame('cube-1', line, 'sender-a'); engine.setFrame('cube-2', line, 'sender-b')
            for (const ip of IPS) handlers.message(Buffer.from([0x80]), { address: ip })
            engine.tick()
        }
        const lit = (ip) => sent.filter((s) => s.ip === ip && s.port === proto.PORT.DATA).reduce((n, s) => {
            for (let o = 4; o < s.buf.length; o += 10) if (s.buf.readUInt16LE(o + 4) || s.buf.readUInt16LE(o + 6) || s.buf.readUInt16LE(o + 8)) n += 1
            return n
        }, 0)
        for (const ip of IPS) handlers.message(Buffer.from([0x8a, 0, 0x70, 0x17]), { address: ip })
        for (let i = 0; i < 10; i++) step()
        expect(IPS.every((ip) => lit(ip) > 0)).toBe(true)

        expect(engine.dark(true)).toMatchObject({ ok: true, dark: true })
        expect(engine.state().dark).toBe(true)
        sent.length = 0
        for (let i = 0; i < 50; i++) step()
        expect(IPS.map(lit)).toEqual([0, 0])
        expect(engine.state().cubes.every((c) => c.armed)).toBe(true)

        expect(engine.dark(false)).toMatchObject({ ok: true, dark: false })
        expect(engine.state().dark).toBe(false)
        sent.length = 0
        for (let i = 0; i < 10; i++) step()
        expect(IPS.every((ip) => lit(ip) > 0)).toBe(true)
    })
    it('only an exact true latches (dark("yes") and dark() do not)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-')); dirs.push(dir)
        const engine = createLaserEngine({ dataDir: dir, log: null, setInterval: () => 1, clearInterval: () => {} })
        expect(engine.dark('yes').dark).toBe(false)
        expect(engine.dark().dark).toBe(false)
        expect(engine.dark(true).dark).toBe(true)
    })
})
