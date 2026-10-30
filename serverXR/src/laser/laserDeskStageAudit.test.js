// @vitest-environment node
// The stage audit of 2026-10-30, desk side: rows 10, 19/23/24, 25, 29, 30. Each test fails on the code before the fix.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createLaserDesk, normaliseCube } = require('./laserDesk')
const { createLaserEngine } = require('./laserEngine')

const dirs = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-audit-')); dirs.push(d); return d }
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }) })
const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0

// A recording engine; `zone` is the keep-in zone; `broken` makes state() throw.
const fake = ({ zone = { xMin: -1, xMax: 1, yMin: 0, yMax: 1 } } = {}) => {
    const e = { broken: null, blackouts: 0, sent: {} }
    e.state = () => { if (e.broken) throw new Error(e.broken); return { zone, cubes: [{ id: 'cube-1', name: 'cube-1', path: null, info: null }] } }
    e.setFrame = (cube, points) => { e.sent[cube] = points; return { ok: true } }
    e.alive = () => ({ ok: true })
    e.blackout = () => { e.blackouts += 1; e.sent = {}; return { ok: true } }
    e.frames = () => ({ armed: false, sim: true, all: null, byCube: { ...e.sent }, cubes: ['cube-1'], stopped: {}, blackouts: e.blackouts })
    return e
}
const deskOn = (engine, extra = {}) => {
    const t = { now: 1000 }
    const warns = []
    const desk = createLaserDesk({ dataDir: tmp(), getEngine: () => engine, now: () => t.now, setInterval: () => 1, clearInterval: () => {}, log: { warn: (m) => warns.push(m) }, ...extra })
    return { desk, t, warns }
}
const cube = (desk) => desk.state().cubes.find((c) => c.id === 'cube-1')

describe('row 10: the desk Blackout reaches the engine', () => {
    it('a released desk (nothing live) still blacks the engine out', () => {
        const engine = fake()
        const { desk } = deskOn(engine)
        expect(desk.setBlackout(true)).toMatchObject({ ok: true, blackout: true })
        expect(engine.blackouts).toBe(1)
    })
    it('a cube another Out drives goes dark on the real engine', () => {
        const dir = tmp()
        const engine = createLaserEngine({ dataDir: dir, log: null, now: () => 5000, setInterval: () => 0, clearInterval: () => {} })
        const { desk } = deskOn(engine)
        engine.setFrame('cube-1', [[0, 0.5, 1, 1, 1], [0.2, 0.5, 1, 1, 1]], 'nodes')
        expect(engine.frames().byCube['cube-1'].some(isLit)).toBe(true)
        desk.setBlackout(true)
        expect((engine.frames().byCube['cube-1'] || []).some(isLit)).toBe(false)
        engine.shutdown()
    })
    it('lifting does not call the engine', () => {
        const engine = fake()
        const { desk } = deskOn(engine)
        desk.setBlackout(true)
        desk.setBlackout(false)
        expect(engine.blackouts).toBe(1)
    })
})

describe('row 30: Release lifts the blackout', () => {
    it('Release ends a blackout, so the page needs no toggling button', () => {
        const { desk } = deskOn(fake())
        desk.go('ring')
        desk.setBlackout(true)
        expect(desk.state().blackout).toBe(true)
        desk.release()
        expect(desk.state().blackout).toBe(false)
    })
})

describe('row 25: a placement out of range is refused, not clamped', () => {
    it('setCube refuses y -5, a word and a size under the floor, and changes nothing', () => {
        const { desk } = deskOn(fake())
        expect(desk.setCube('cube-1', { y: -5 })).toMatchObject({ ok: false, status: 400 })
        expect(desk.setCube('cube-1', { x: 'abc' })).toMatchObject({ ok: false, status: 400 })
        expect(desk.setCube('cube-1', { size: 0.1 }).error).toMatch(/size: 0.1 is outside 0.3 to 2/)
        expect(cube(desk)).toMatchObject({ y: 0, x: 0, size: 1 })
    })
    it('a value in range is kept, the edges included', () => {
        const { desk } = deskOn(fake())
        expect(desk.setCube('cube-1', { y: -1 })).toMatchObject({ ok: true })
        expect(cube(desk).y).toBe(-1)
    })
    it('normaliseCube strict throws a RangeError', () => {
        expect(() => normaliseCube({ y: 3 }, undefined, { strict: true })).toThrow(RangeError)
        expect(normaliseCube({ y: 3 }).y).toBe(1) // the file's own values are still read, clamped
    })
    it('a desk.json value out of range is said at load', () => {
        const dir = tmp()
        fs.writeFileSync(path.join(dir, 'desk.json'), JSON.stringify({ v: 1, looks: [], cubes: { 'cube-1': { y: -4 } } }))
        const { desk } = deskOn(fake(), {})
        const again = createLaserDesk({ dataDir: dir, getEngine: () => fake(), setInterval: () => 1, clearInterval: () => {}, log: null })
        expect(again.state().loadMessage).toMatch(/cube-1 placement y: -4/)
        expect(desk).toBeTruthy()
    })
})

describe('rows 19, 23, 24: a cut picture is counted, and a dark cube is not "driving"', () => {
    it('half the picture off the top: lit, off-field and a percentage; still driving', () => {
        const { desk } = deskOn(fake())
        desk.setCube('cube-1', { y: 0.5 }) // ring height 0.5 + 0.5 puts its centre on the top edge
        desk.go('ring')
        const c = cube(desk)
        expect(c.offField).toBeGreaterThan(0)
        expect(c.lit).toBeGreaterThan(0)
        expect(c.offPercent).toBeGreaterThan(20)
        expect(c.offPercent).toBeLessThan(80)
        expect(c).toMatchObject({ driving: true, dark: false })
    })
    it('a picture wholly off the field is dark, not driving, 100 %', () => {
        const { desk } = deskOn(fake())
        desk.setCube('cube-1', { y: 1, size: 0.3 })
        desk.go('ring')
        desk.editLive({ height: 1 })
        expect(cube(desk)).toMatchObject({ driving: false, dark: true, lit: 0, offPercent: 100 })
    })
    it('points the keep-in zone will blank are counted as blanked', () => {
        const { desk } = deskOn(fake()) // zone y 0…1; the ring at height 0.5 with the cube Up at -1 sits in y -0.95…-0.05
        desk.setCube('cube-1', { y: -1 })
        desk.go('ring')
        const c = cube(desk)
        expect(c.blanked).toBeGreaterThan(0)
        expect(c.offPercent).toBe(100)
        expect(c.offField).toBe(0)
    })
    it('a whole picture on the field reads 0 %', () => {
        const { desk } = deskOn(fake())
        desk.go('ring')
        expect(cube(desk)).toMatchObject({ driving: true, dark: false, offPercent: 0, offField: 0, blanked: 0 })
    })
})

describe('row 29: the tick catches its own errors', () => {
    it('logs one line per distinct error and the next tick runs', () => {
        const engine = fake()
        const { desk, warns } = deskOn(engine)
        desk.go('ring')
        engine.broken = 'engine gone'
        for (let i = 0; i < 4; i += 1) expect(() => desk.tick()).not.toThrow()
        expect(warns.filter((w) => /tick failed: engine gone/.test(w))).toHaveLength(1)
        engine.broken = 'a different error'
        desk.tick()
        expect(warns.filter((w) => /tick failed/.test(w))).toHaveLength(2)
        engine.broken = null
        desk.editLive({ size: 0.4 })
        expect(engine.sent['cube-1'].some(isLit)).toBe(true)
    })
})
