// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createLaserDesk, normaliseLook, lookPointsAt, capOf, SEED_LOOKS, LOOK_DEFAULTS, OUT } = require('./laserDesk')
const { createLaserEngine } = require('./laserEngine')
const { FRAME_MAX_POINTS } = require('../../../shared/laserFrame.cjs')

const dirs = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-desk-')); dirs.push(d); return d }
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }) })

const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0
const clock = (bpm = 120, zero = 0) => ({ bpm, zero })

// An engine that records what the desk asks of it; `refuse(cube)` returns an error for a cube another Out holds.
const fakeEngine = (ids = ['cube-1', 'cube-2', 'cube-3'], { refuse = () => null } = {}) => {
    const calls = []
    const byCube = {}
    return {
        calls,
        state: () => ({ zone: { xMin: -1, xMax: 1, yMin: 0, yMax: 1 }, cubes: ids.map((id) => ({ id, name: id, path: null, info: null })) }),
        setFrame: (cube, points, out) => {
            calls.push({ kind: 'frame', cube, points, out })
            const e = refuse(cube)
            if (e) return { ok: false, error: e }
            byCube[cube] = points
            return { ok: true }
        },
        alive: (cube, out) => { calls.push({ kind: 'alive', cube, out }); const e = refuse(cube); return e ? { ok: false, error: e } : { ok: true } },
        frames: () => ({ armed: false, sim: true, all: null, byCube: { ...byCube }, cubes: ids, stopped: {} })
    }
}
// A desk whose clock and ticks the test drives: no timers run.
const deskWith = (engine, { dir = tmp(), t = { now: 1000 } } = {}) => {
    const desk = createLaserDesk({ dataDir: dir, getEngine: () => engine, now: () => t.now, setInterval: () => 1, clearInterval: () => {}, log: null })
    return { desk, t, dir }
}

describe('a look, in range', () => {
    it('clamps every field and drops what it does not know', () => {
        const look = normaliseLook({ id: 'x y!', name: '  ', shape: 'star,bogus,GRID', colour: 'f00', size: 9, spin: -99, points: 1e6, cubes: ['cube-1', 'cube-1', '', 7], evil: '<script>' })
        expect(look).toMatchObject({ id: 'xy', name: 'Look', shape: 'star,grid', colour: '#ff0000', size: 1, spin: -4, points: FRAME_MAX_POINTS - 8, cubes: ['cube-1', '7'] })
        expect(look).not.toHaveProperty('evil')
        expect(normaliseLook({ shape: 'nothing' }).shape).toBe(LOOK_DEFAULTS.shape)
        expect(normaliseLook({ colour: 'red' }).colour).toBe(LOOK_DEFAULTS.colour)
    })
    it('the first bank is the node\'s shapes and the owner\'s four TouchDesigner scenes, every one a frame', () => {
        expect(SEED_LOOKS.map((l) => l.shape)).toEqual(expect.arrayContaining(['galaxy', 'sunflower', 'noisy', 'grid', 'galaxy,sunflower,noisy,grid']))
        for (const look of SEED_LOOKS) {
            const points = lookPointsAt(look, { t: 1234, clock: clock() })
            expect(points.some(isLit), look.id).toBe(true)
            expect(points.length, look.id).toBeLessThanOrEqual(FRAME_MAX_POINTS)
            for (const p of points) { expect(Math.abs(p[0])).toBeLessThanOrEqual(1); expect(Math.abs(p[1])).toBeLessThanOrEqual(1) }
        }
    })
})

describe('a look drawn on the beat', () => {
    const ring = normaliseLook({ shape: 'line', size: 0.3, height: 0.5, x: 0.2, colour: '#ffffff' })
    it('mirror flips every second cube, and a cube\'s own mirror flips it back', () => {
        const look = { ...ring, mirror: true }
        const a = lookPointsAt(look, { t: 0, clock: clock(), index: 0 })
        const b = lookPointsAt(look, { t: 0, clock: clock(), index: 1 })
        const c = lookPointsAt(look, { t: 0, clock: clock(), index: 1, cube: { on: true, flipX: true, size: 1, x: 0, y: 0 } })
        expect(b.map((p) => p[0])).toEqual(a.map((p) => -p[0]))
        expect(c).toEqual(a)
    })
    it('chase: each cube runs `phase` beats behind the one before', () => {
        const look = { ...ring, spin: 0.25, phase: 1 }
        const second = lookPointsAt(look, { t: 1500, clock: clock(120), index: 1 }) // 3 beats, minus 1
        const firstEarlier = lookPointsAt(look, { t: 1000, clock: clock(120), index: 0 }) // 2 beats
        expect(second.map((p) => p.map((v) => +v.toFixed(9)))).toEqual(firstEarlier.map((p) => p.map((v) => +v.toFixed(9))))
    })
    it('the sparkles change on the desk\'s half beats, whatever the BPM', () => {
        const look = normaliseLook({ shape: 'sparkle', size: 0.5, colour: '#ffffff' })
        for (const bpm of [60, 128]) {
            const half = 30000 / bpm
            const at = (ms) => lookPointsAt(look, { t: ms, clock: clock(bpm) })
            expect(at(half * 3 + 1), `${bpm} BPM, within a half beat`).toEqual(at(half * 4 - 1))
            expect(at(half * 4 + 1), `${bpm} BPM, the next half beat`).not.toEqual(at(half * 4 - 1))
        }
    })
    it('spin is turns per beat: a quarter turn a beat is a half turn at the second beat', () => {
        const look = { ...ring, x: 0, height: 0, spin: 0.25 }
        const p = lookPointsAt(look, { t: 1000, clock: clock(120) }) // 2 beats at 120 → half a turn
        const q = lookPointsAt({ ...look, spin: 0 }, { t: 0, clock: clock(120) })
        expect(p[0][0]).toBeCloseTo(-q[0][0], 6)
    })
    it('master 0 and level 0 are a blank frame; a point the moves push out of the field is blanked, not dragged', () => {
        expect(lookPointsAt(ring, { t: 0, clock: clock(), master: 0 })).toEqual([[0, 0, 0, 0, 0]])
        expect(lookPointsAt({ ...ring, level: 0 }, { t: 0, clock: clock() })).toEqual([[0, 0, 0, 0, 0]])
        const pushed = lookPointsAt({ ...ring, x: 0.9 }, { t: 0, clock: clock() })
        expect(pushed.filter((p) => p[0] >= 1).every((p) => !isLit(p))).toBe(true)
        expect(pushed.some(isLit)).toBe(true)
    })
    it('reads a cube\'s frame cap the way Laser Out does', () => {
        expect(capOf({ path: { budget: 2333, pointsIn: 300, pointsOut: 400 } })).toBe(1749)
        expect(capOf({ info: { dacRate: 35000 } })).toBe(1758)
        expect(capOf({})).toBeNull()
    })
})

describe('the desk on the engine', () => {
    it('starts released: nothing reaches the engine until a look is pressed', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        desk.tick()
        expect(engine.calls).toEqual([])
        expect(desk.state()).toMatchObject({ live: null, liveId: null, blackout: false })
    })
    it('Go: every cube gets the look as the Out `desk`; a still picture is then only kept alive', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        expect(desk.go('grid')).toMatchObject({ ok: true, live: 'grid' })
        const first = engine.calls.splice(0)
        expect(first.map((c) => [c.kind, c.cube, c.out])).toEqual([['frame', 'cube-1', OUT], ['frame', 'cube-2', OUT], ['frame', 'cube-3', OUT]])
        expect(first.every((c) => c.points.some(isLit))).toBe(true)
        desk.tick()
        expect(engine.calls.map((c) => c.kind)).toEqual(['alive', 'alive', 'alive'])
    })
    it('a moving look is a new frame every tick', () => {
        const engine = fakeEngine()
        const { desk, t } = deskWith(engine)
        desk.go('star')
        engine.calls.length = 0
        t.now += 50
        desk.tick()
        expect(engine.calls.map((c) => c.kind)).toEqual(['frame', 'frame', 'frame'])
    })
    it('a cube another Out holds is reported and skipped; the others keep the look', () => {
        const engine = fakeEngine(undefined, { refuse: (cube) => (cube === 'cube-2' ? 'cube-2 is held by the Laser Out "node-7"' : null) })
        const { desk } = deskWith(engine)
        desk.go('ring')
        const cubes = desk.state().cubes
        expect(cubes.find((c) => c.id === 'cube-2')).toMatchObject({ driving: false, held: expect.stringContaining('node-7') })
        expect(cubes.find((c) => c.id === 'cube-1')).toMatchObject({ driving: true, held: null })
    })
    it('Release blanks the cubes it drew on and stops sending', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        desk.go('ring')
        engine.calls.length = 0
        desk.release()
        expect(engine.calls.map((c) => [c.kind, c.points.length, c.points.some(isLit)])).toEqual([['frame', 1, false], ['frame', 1, false], ['frame', 1, false]])
        engine.calls.length = 0
        desk.tick()
        expect(engine.calls).toEqual([])
    })
    it('Blackout holds every cube dark and keeps the look', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        desk.go('ring')
        engine.calls.length = 0
        desk.setBlackout(true)
        expect(engine.calls.every((c) => c.kind === 'frame' && !c.points.some(isLit))).toBe(true)
        expect(desk.state()).toMatchObject({ blackout: true, liveId: 'ring' })
    })
    it('a look on some cubes holds the rest dark; a cube off the desk is let go', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        desk.go('ring')
        engine.calls.length = 0
        desk.editLive({ cubes: ['cube-1'] })
        // cube-1's picture did not change (kept alive); the other two get a dark frame.
        expect(engine.calls.map((c) => [c.cube, c.kind, c.points ? c.points.some(isLit) : null])).toEqual([['cube-1', 'alive', null], ['cube-2', 'frame', false], ['cube-3', 'frame', false]])
        desk.setCube('cube-3', { on: false })
        engine.calls.length = 0
        desk.tick()
        expect(engine.calls.map((c) => c.cube)).toEqual(['cube-1', 'cube-2'])
    })
    it('a new engine (Use these reloads it) gets the still picture again, not a keep-alive', () => {
        let engine = fakeEngine()
        const desk = createLaserDesk({ dataDir: tmp(), getEngine: () => engine, now: () => 1000, setInterval: () => 1, clearInterval: () => {}, log: null })
        desk.go('grid')
        engine = fakeEngine()
        desk.tick()
        expect(engine.calls.map((c) => c.kind)).toEqual(['frame', 'frame', 'frame'])
    })
    it('the engine\'s Blackout from any page is kept: the desk goes to its own blackout, not back to the picture', () => {
        const dir = tmp()
        const t = { now: 5000 }
        const engine = createLaserEngine({ dataDir: dir, log: null, now: () => t.now, setInterval: () => 0, clearInterval: () => {} })
        const { desk } = deskWith(engine, { dir, t })
        desk.go('star')
        expect(engine.frames().byCube['cube-1'].some(isLit)).toBe(true)
        engine.blackout()
        t.now += 50
        desk.tick()
        expect(desk.state().blackout).toBe(true)
        expect(engine.frames().byCube['cube-1'].some(isLit)).toBe(false)
        desk.setBlackout(false)
        expect(engine.frames().byCube['cube-1'].some(isLit)).toBe(true)
        desk.close()
        engine.shutdown()
    })
    it('the desk\'s order sets which cube is first (mirror and chase follow it)', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        desk.setCube('cube-3', { order: -1 })
        expect(desk.state().cubes.map((c) => c.id)).toEqual(['cube-3', 'cube-1', 'cube-2'])
    })
})

describe('the clock', () => {
    it('two taps half a second apart are 120 BPM, and the beat lands on the tap', () => {
        const { desk, t } = deskWith(fakeEngine())
        desk.tap()
        t.now += 500
        expect(desk.tap()).toMatchObject({ bpm: 120 })
        expect(desk.state().beat).toBeCloseTo(0, 6)
    })
    it('a new tempo keeps the beat where it is (no jump in the picture)', () => {
        const { desk, t } = deskWith(fakeEngine())
        t.now += 1500
        const before = desk.state().beat
        desk.setBpm(90)
        expect(desk.state().beat).toBeCloseTo(before, 6)
        expect(desk.state().bpm).toBe(90)
    })
})

describe('the bank on disk', () => {
    it('Store keeps the live look as a tile, and a restart finds the bank — released', () => {
        const dir = tmp()
        const { desk } = deskWith(fakeEngine(), { dir })
        desk.go('star')
        desk.editLive({ colour: '#3050ff', spin: 0.5 })
        expect(desk.store({ name: 'Blue star' })).toMatchObject({ ok: true, id: 'blue-star' })
        desk.setMaster(0.4)
        desk.close()
        const again = deskWith(fakeEngine(), { dir }).desk.state()
        expect(again.looks.find((l) => l.id === 'blue-star')).toMatchObject({ name: 'Blue star', shape: 'star', colour: '#3050ff', spin: 0.5 })
        expect(again).toMatchObject({ live: null, master: 0.4 })
    })
    it('a bank saved before new seed looks gets them once, at its end; one deleted after is not offered again', () => {
        const dir = tmp()
        const first = SEED_LOOKS.slice(0, 14)
        fs.writeFileSync(path.join(dir, 'desk.json'), JSON.stringify({ v: 1, bpm: 100, master: 1, looks: [first[3], first[0]], cubes: {} }))
        const { desk } = deskWith(fakeEngine(), { dir })
        const ids = desk.state().looks.map((l) => l.id)
        expect(ids).toEqual([first[3].id, first[0].id, ...SEED_LOOKS.slice(14).map((l) => l.id)])
        expect(desk.remove('spots')).toMatchObject({ ok: true })
        desk.close()
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'desk.json'), 'utf8')).seeded).toEqual(expect.arrayContaining(['spots', 'lines', 'ring']))
        expect(deskWith(fakeEngine(), { dir }).desk.state().looks.map((l) => l.id)).not.toContain('spots')
    })
    it('a file that does not read is kept beside, and the desk starts from the first bank', () => {
        const dir = tmp()
        fs.writeFileSync(path.join(dir, 'desk.json'), '{ not json')
        const { desk } = deskWith(fakeEngine(), { dir })
        expect(desk.state().loadMessage).toMatch(/did not read/)
        expect(fs.readFileSync(path.join(dir, 'desk.json.bad'), 'utf8')).toBe('{ not json')
        expect(desk.state().looks.length).toBe(SEED_LOOKS.length)
    })
    it('store, rename, reorder and delete answer for unknown looks', () => {
        const { desk } = deskWith(fakeEngine())
        expect(desk.store({})).toMatchObject({ ok: false, status: 400 })
        expect(desk.go('nope')).toMatchObject({ ok: false, status: 404 })
        expect(desk.rename('nope', 'x')).toMatchObject({ ok: false, status: 404 })
        expect(desk.remove('nope')).toMatchObject({ ok: false, status: 404 })
        desk.reorder(['grid', 'ring'])
        expect(desk.state().looks.slice(0, 2).map((l) => l.id)).toEqual(['grid', 'ring'])
    })
})

describe('the desk on the real engine (sim: no addresses, nothing sent)', () => {
    it('every first-bank look reaches the engine through its keep-in zone, and nothing arms', () => {
        const dir = tmp()
        const t = { now: 5000 }
        const engine = createLaserEngine({ dataDir: dir, log: null, now: () => t.now, setInterval: () => 0, clearInterval: () => {} })
        const { desk } = deskWith(engine, { dir, t })
        for (const look of SEED_LOOKS) {
            desk.go(look.id)
            const frames = engine.frames()
            expect(frames.armed).toBe(false)
            const pts = frames.byCube['cube-1']
            expect(pts?.some(isLit), look.id).toBe(true)
            for (const p of pts) if (isLit(p)) expect(p[1], look.id).toBeGreaterThanOrEqual(0)
            expect(engine.state().cubes.find((c) => c.id === 'cube-1').claimedBy).toBe(OUT)
            t.now += 300
        }
        desk.close()
        engine.shutdown()
    })
})
