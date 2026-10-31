// @vitest-environment node
// "Check why the laser does not work" (ledger N1585, 2026-10-31 15:1x). The stage Mac's log: cube-1 ON at 15:08:56, then
// "dark and unrefreshed for 5000 ms: switching it OFF" at 15:09:01, while the desk page said "Nothing on the laser".
// Each sequence below drives the real desk and the real engine on a fake cube (fake clock, fake socket) and says
// whether the cube plays or is switched off, and why. The look is the one live on the Mac at 15:25 (muth-05-catacomb:
// lines, size 0.3, height 0.85, level 0.8, nothing moving) on the Mac's cube setup (Up -1, size 2).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createLaserDesk, OUT } from './laserDesk.js'

const require = createRequire(import.meta.url)
const proto = require('./lasercubeProtocol')
const { createLaserEngine, OFF } = require('./laserEngine')

const dirs = []
const tmp = (cfg) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lon-')); dirs.push(d)
    if (cfg) fs.writeFileSync(path.join(d, 'laser.json'), JSON.stringify(cfg))
    return d
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

const IP = '10.0.0.51'
const info = (ip) => {
    const b = Buffer.alloc(64)
    b[0] = 0x77; b[3] = 1; b[4] = 7; b.writeUInt32LE(30000, 10); b.writeUInt32LE(35000, 14)
    b.writeUInt16LE(5800, 19); b.writeUInt16LE(6000, 21); b[24] = 31; b[25] = 2
    Buffer.from([0xde, 0xad, 0xbe, 0xef, 0, 0x42]).copy(b, 26); Buffer.from(ip.split('.').map(Number)).copy(b, 32); b[37] = 1
    return b
}
// One cube that answers like a LaserCube: its info every second, its free buffer every engine tick. Nothing armed.
const rigOf = () => {
    const sent = []; const handlers = {}; const clock = { t: 1000000 }; const logs = []
    const log = { warn: (m) => logs.push(m), info: (m) => logs.push(m) }
    const socket = { send: (buf, port, ip, done) => { sent.push({ buf: Buffer.from(buf), port, ip, at: clock.t }); done?.() }, on: (ev, fn) => { handlers[ev] = fn }, bind: () => {}, close: () => {} }
    const dataDir = tmp({ cubes: [{ id: 'cube-1', ip: IP }] })
    const make = () => createLaserEngine({ dataDir, createSocket: () => socket, log, now: () => clock.t, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0, signOff: 'click' })
    const rig = { sent, clock, logs, engine: make() }
    rig.answerInfo = () => handlers.message?.(info(IP), { address: IP })
    rig.answerInfo()
    rig.renew = () => { rig.engine = make(); rig.answerInfo(); return rig.engine }
    // Lit points the cube was sent at or after `since`.
    rig.litSince = (since) => sent.filter((s) => s.port === proto.PORT.DATA && s.at >= since).reduce((n, s) => {
        for (let o = 4; o < s.buf.length; o += 10) if (s.buf.readUInt16LE(o + 4) || s.buf.readUInt16LE(o + 6) || s.buf.readUInt16LE(o + 8)) n += 1
        return n
    }, 0)
    rig.on = () => rig.engine.arm({ armed: true, cube: 'cube-1', out: OUT })
    rig.off = () => rig.engine.arm({ armed: false, cube: 'cube-1', out: OUT })
    rig.cube = () => rig.engine.state().cubes[0]
    rig.switchedOffDark = () => logs.some((m) => /dark and unrefreshed/.test(m))
    return rig
}
// Time runs in 10 ms steps: the engine ticks every 20 ms (the cube answers its free buffer), the desk every 50 ms,
// the cube's info every second. `deskTicks: false` is a desk whose timer is not running (nothing live).
const run = (rig, d, ms, { deskTicks = true } = {}) => {
    for (let e = 0; e < ms; e += 10) {
        rig.clock.t += 10
        if (rig.clock.t % 1000 === 0) rig.answerInfo()
        if (deskTicks && d && rig.clock.t % 50 === 0) d.tick()
        if (rig.clock.t % 20 === 0) { rig.answerFree?.(); rig.engine.tick() }
    }
}
const deskOf = (rig, dataDir = tmp()) => {
    const d = createLaserDesk({ dataDir, getEngine: () => rig.engine, now: () => rig.clock.t, setInterval: () => 1, clearInterval: () => {}, log: null })
    d.setCube('cube-1', { y: -1, size: 2 })
    return d
}
const STILL = { name: 'Catacomb', shape: 'lines', size: 0.3, height: 0.85, level: 0.8, colour: '#e0001a', spin: 0, sweep: 0, pulse: 0, cycle: 0 }
const OFF_FIELD = { name: 'Below', shape: 'circle', size: 0.3, height: -0.6, level: 1, colour: '#ffffff' }
const lookIn = (d, look) => d.store({ name: look.name, look }).id
// The desk only ticks while something is live (its own timer); a released desk does not.
const deskLive = (d) => d.state().live !== null

const rows = []
const outcome = (name, rig, d, since) => {
    const c = rig.cube()
    const row = { sequence: name, armed: c.armed, litAfterOn: rig.litSince(since), stop: c.stop?.reason ?? null, switchedOffBy5s: rig.switchedOffDark(), deskLive: d ? deskLive(d) : null }
    rows.push(row)
    return row
}
afterAll(() => { console.log('\n' + rows.map((r) => JSON.stringify(r)).join('\n')) })

describe('laser On: does the cube play, or go dark and switch itself off (N1585)', () => {
    it('(a) On with nothing live: switched off after 5 s by the dark rule (by design, R2)', () => {
        const rig = rigOf(); const d = deskOf(rig)
        const t0 = rig.clock.t; expect(rig.on().ok).toBe(true)
        run(rig, d, 6000, { deskTicks: false })
        const r = outcome('a: On, nothing live', rig, d, t0)
        expect(r).toMatchObject({ armed: false, litAfterOn: 0, switchedOffBy5s: true })
    })
    it('(b) a still look live, then On: plays and stays on', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, STILL)); run(rig, d, 500)
        const t0 = rig.clock.t; expect(rig.on().ok).toBe(true)
        run(rig, d, 6000)
        const r = outcome('b: still look live, then On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(b2) a moving seed look live, then On: plays and stays on', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go('star'); run(rig, d, 500)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('b2: moving look live, then On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(c) a still look, On, Off, On again: plays', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, STILL)); rig.on(); run(rig, d, 1000)
        rig.off(); run(rig, d, 1000)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('c: still look, On, Off, On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(c2) a still look, On, Off, 12 s (the hold lapses), On again: plays', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, STILL)); rig.on(); run(rig, d, 1000)
        rig.off(); run(rig, d, 12000)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('c2: still look, Off 12 s, On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(d) Blackout, Release, On: nothing live, switched off after 5 s (by design)', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, STILL)); rig.on(); run(rig, d, 1000)
        d.setBlackout(true); run(rig, d, 500)
        d.release()
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000, { deskTicks: false })
        const r = outcome('d: Blackout, Release, On', rig, d, t0)
        expect(r).toMatchObject({ armed: false, litAfterOn: 0, switchedOffBy5s: true, deskLive: false })
    })
    it('(d2) Blackout, Release, a look pressed, On: plays', () => {
        const rig = rigOf(); const d = deskOf(rig)
        const id = lookIn(d, STILL)
        d.go(id); rig.on(); run(rig, d, 1000)
        d.setBlackout(true); run(rig, d, 500)
        d.release(); run(rig, d, 500, { deskTicks: false })
        d.go(id); run(rig, d, 200)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('d2: Blackout, Release, Go, On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(d3) Blackout, Blackout lifted (not released), On: plays', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, STILL)); rig.on(); run(rig, d, 1000)
        d.setBlackout(true); run(rig, d, 500)
        d.setBlackout(false); run(rig, d, 200)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('d3: Blackout, lifted, On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(e) Disarm all, On: plays', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, STILL)); rig.on(); run(rig, d, 1000)
        rig.engine.arm({ armed: false }); run(rig, d, 1000)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('e: Disarm all, On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(f1) the server restarts with a look live before: the desk comes back with nothing live, On is switched off (by design)', () => {
        const rig = rigOf(); const dir = tmp()
        const a = deskOf(rig, dir); a.go(lookIn(a, STILL)); run(rig, a, 500); a.close()
        rig.renew()
        const b = deskOf(rig, dir)
        const t0 = rig.clock.t; rig.on(); run(rig, b, 6000, { deskTicks: false })
        const r = outcome('f1: restart, then On', rig, b, t0)
        expect(r).toMatchObject({ armed: false, litAfterOn: 0, switchedOffBy5s: true, deskLive: false })
    })
    it('(f2) the engine is rebuilt (Use these) under a live still look, then On: plays', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, STILL)); run(rig, d, 500)
        rig.renew(); run(rig, d, 200)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('f2: engine rebuilt, then On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, stop: null, switchedOffBy5s: false })
        expect(r.litAfterOn).toBeGreaterThan(0)
    })
    it('(g) every point pushed off the field by the cube\'s Up: on and dark, never lit (the desk refreshes its dark picture)', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, OFF_FIELD)); run(rig, d, 500)
        expect(d.state().cubes[0]).toMatchObject({ lit: 0, dark: true, offPercent: 100 })
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('g: all off the field, On', rig, d, t0)
        expect(r).toMatchObject({ armed: true, litAfterOn: 0, switchedOffBy5s: false })
    })
    it('(h) a Blackout from another page while the desk\'s picture is dark, lifted, then a lit look: plays', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, OFF_FIELD)); run(rig, d, 500)
        rig.engine.blackout(); run(rig, d, 500)
        d.setBlackout(false); run(rig, d, 500)
        const t0 = rig.clock.t; rig.on(); run(rig, d, 6000)
        const r = outcome('h: dark picture, Blackout elsewhere, lifted, On', rig, d, t0)
        // Same as (g): on and dark while the desk keeps posting its dark picture.
        expect(r).toMatchObject({ armed: true, litAfterOn: 0, switchedOffBy5s: false })
        d.setCube('cube-1', { y: 0 }); run(rig, d, 1000)
        expect(rig.litSince(rig.clock.t - 800)).toBeGreaterThan(0)
    })
})

describe('the dark rule is said on the cube (N1585): the countdown, and why the engine switched it off', () => {
    it('On with nothing to draw counts down from 5 s; the Off by the rule is kept on the cube until the next On', () => {
        const rig = rigOf()
        rig.on()
        expect(rig.engine.state().guard.darkIdleMs).toBe(5000)
        expect(rig.cube()).toMatchObject({ armed: true, darkOffInMs: 5000, offBy: null })
        run(rig, null, 3000)
        expect(rig.cube().darkOffInMs).toBe(2000)
        run(rig, null, 2100)
        expect(rig.cube()).toMatchObject({ armed: false, darkOffInMs: null, offBy: { reason: OFF.DARK_IDLE, text: 'Off: it had nothing to draw for 5 s' } })
        run(rig, null, 3000)
        expect(rig.cube().offBy.reason).toBe(OFF.DARK_IDLE)
        rig.on()
        expect(rig.cube()).toMatchObject({ armed: true, offBy: null })
    })
    it('no countdown while a lit look plays, nor while the desk keeps posting a dark picture (it is not switched off)', () => {
        const lit = rigOf(); const d1 = deskOf(lit)
        d1.go(lookIn(d1, STILL)); lit.on(); run(lit, d1, 1000)
        expect(lit.cube()).toMatchObject({ armed: true, darkOffInMs: null })
        const dark = rigOf(); const d2 = deskOf(dark)
        d2.go(lookIn(d2, OFF_FIELD)); dark.on(); run(dark, d2, 1000)
        expect(dark.cube()).toMatchObject({ armed: true, darkOffInMs: null })
    })
    it('a sender that stops refreshing its dark picture: the countdown starts, then the cube is switched off', () => {
        const rig = rigOf(); const d = deskOf(rig)
        d.go(lookIn(d, OFF_FIELD)); rig.on(); run(rig, d, 1000)
        run(rig, d, 1000, { deskTicks: false })
        expect(rig.cube().darkOffInMs).toBe(4000)
        run(rig, d, 4100, { deskTicks: false })
        expect(rig.cube()).toMatchObject({ armed: false, offBy: { reason: OFF.DARK_IDLE } })
    })
})
