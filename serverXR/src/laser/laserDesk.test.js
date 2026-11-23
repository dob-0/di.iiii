// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

// the seed-look sweeps (every seed x 32 beats x guards) take 5-8 s on a loaded CI runner; the default 5 s is not a bound on them
vi.setConfig({ testTimeout: 60000 })

const require = createRequire(import.meta.url)
const { createLaserDesk, normaliseLook, lookPointsAt, capOf, SEED_LOOKS, LOOK_DEFAULTS, CUBE_DEFAULTS, OUT } = require('./laserDesk')
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
    let blackouts = 0
    return {
        calls,
        dark: () => ({ ok: true }),
        blackout: () => { blackouts += 1; for (const k of Object.keys(byCube)) delete byCube[k]; return { ok: true } },
        arm: () => ({ ok: true }),
        state: () => ({ sim: true, zone: { xMin: -1, xMax: 1, yMin: 0, yMax: 1 }, cubes: ids.map((id) => ({ id, name: id, path: null, info: null })) }),
        setFrame: (cube, points, out) => {
            calls.push({ kind: 'frame', cube, points, out })
            const e = refuse(cube)
            if (e) return { ok: false, error: e }
            byCube[cube] = points
            return { ok: true }
        },
        alive: (cube, out) => { calls.push({ kind: 'alive', cube, out }); const e = refuse(cube); return e ? { ok: false, error: e } : { ok: true } },
        frames: () => ({ armed: false, sim: true, all: null, byCube: { ...byCube }, cubes: ids, stopped: {}, blackouts })
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
    it('Blackout needs a true or false: nothing, or anything else, is refused and never toggles (review 1218 M1)', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        desk.go('ring')
        desk.setBlackout(true)
        for (const bad of [undefined, null, 'false', 0, 1, 'on']) {
            expect(desk.setBlackout(bad)).toMatchObject({ ok: false, status: 400 })
            expect(desk.state().blackout).toBe(true)
        }
        desk.setBlackout(true) // pressing "dark" twice stays dark
        expect(desk.state().blackout).toBe(true)
        expect(desk.setBlackout(false)).toMatchObject({ ok: true, blackout: false })
    })
    it('an engine Blackout met within the desk\'s next 50 ms is still latched when a look is pressed (review 1218 S1)', () => {
        const dir = tmp()
        const t = { now: 5000 }
        const engine = createLaserEngine({ dataDir: dir, log: null, now: () => t.now, setInterval: () => 0, clearInterval: () => {} })
        const { desk } = deskWith(engine, { dir, t })
        desk.go('star')
        engine.blackout()
        desk.go('ring') // pressed before any tick saw the blackout: every key was reset by go()
        expect(desk.state().blackout).toBe(true)
        expect(engine.frames().byCube['cube-1'].some(isLit)).toBe(false)
        desk.close()
        engine.shutdown()
    })
    it('an engine Blackout while the desk is released is not drawn over by the next Go (review 1218 S1)', () => {
        const dir = tmp()
        const t = { now: 5000 }
        const engine = createLaserEngine({ dataDir: dir, log: null, now: () => t.now, setInterval: () => 0, clearInterval: () => {} })
        const { desk } = deskWith(engine, { dir, t })
        desk.go('star')
        desk.release()
        engine.blackout()
        desk.go('ring')
        expect(desk.state().blackout).toBe(true)
        expect(engine.frames().byCube['cube-1']?.some(isLit) ?? false).toBe(false)
        desk.close()
        engine.shutdown()
    })
    describe('a Blackout taken by an engine the desk has not seen yet (review 1224 F1)', () => {
        const mk = (dir, t) => createLaserEngine({ dataDir: dir, log: null, now: () => t.now, setInterval: () => 0, clearInterval: () => {} })
        const lit = (engine) => engine.frames().byCube['cube-1']?.some(isLit) ?? false
        it('A: a Blackout before the desk\'s first Go is not drawn over', () => {
            const dir = tmp(), t = { now: 5000 }
            const engine = mk(dir, t)
            const { desk } = deskWith(engine, { dir, t })
            engine.blackout()
            desk.go('star')
            expect(desk.state().blackout).toBe(true)
            expect(lit(engine)).toBe(false)
            desk.close(); engine.shutdown()
        })
        it('B: release, a new engine (Use these), its Blackout, then Go stays dark', () => {
            const dir = tmp(), t = { now: 5000 }
            let engine = mk(dir, t)
            const desk = createLaserDesk({ dataDir: dir, getEngine: () => engine, now: () => t.now, setInterval: () => 1, clearInterval: () => {}, log: null })
            desk.go('star')
            desk.release()
            const old = engine
            engine = mk(dir, t)
            engine.blackout()
            desk.go('ring')
            expect(desk.state().blackout).toBe(true)
            expect(lit(engine)).toBe(false)
            desk.close(); engine.shutdown(); old.shutdown()
        })
        it('C: live desk, a reload, the new engine\'s Blackout, then Go stays dark', () => {
            const dir = tmp(), t = { now: 5000 }
            let engine = mk(dir, t)
            const desk = createLaserDesk({ dataDir: dir, getEngine: () => engine, now: () => t.now, setInterval: () => 1, clearInterval: () => {}, log: null })
            desk.go('star')
            const old = engine
            engine = mk(dir, t)
            engine.blackout()
            desk.go('ring')
            expect(desk.state().blackout).toBe(true)
            expect(lit(engine)).toBe(false)
            desk.close(); engine.shutdown(); old.shutdown()
        })
    })
    it('a live edit with nothing live is refused (409) and puts nothing on the cubes (review 1218 S2)', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        expect(desk.editLive({ size: 0.3 })).toMatchObject({ ok: false, status: 409 })
        expect(engine.calls).toEqual([])
        expect(desk.state().live).toBe(null)
        desk.go('ring')
        desk.release()
        engine.calls.length = 0
        expect(desk.editLive({ size: 0.3 })).toMatchObject({ ok: false, status: 409 })
        expect(engine.calls.some((c) => c.points?.some(isLit))).toBe(false)
    })
    it('a cube cannot be set smaller than 0.3, where no seed look is stopped as a still beam (review 1218 S3)', () => {
        const engine = fakeEngine()
        const { desk } = deskWith(engine)
        expect(desk.setCube('cube-1', { size: 0.1 })).toMatchObject({ ok: false, status: 400 })
        expect(desk.state().cubes.find((c) => c.id === 'cube-1').size).toBe(1)
        expect(desk.setCube('cube-1', { size: 0 })).toMatchObject({ ok: false, status: 400 })
        expect(desk.state().cubes.find((c) => c.id === 'cube-1').size).toBe(1)
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

describe('each look keeps its own changes, and Save writes them (2026-10-29, "like in resolume")', () => {
    it('an edit changes the look in the bank; the cubes follow only when it is the one on them', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk } = deskWith(engine)
        expect(desk.editLook('star', { colour: '#3050ff', spin: 0.5, evil: 1 })).toMatchObject({ ok: true })
        expect(desk.state().looks.find((l) => l.id === 'star')).toMatchObject({ id: 'star', colour: '#3050ff', spin: 0.5 })
        expect(desk.state().looks.find((l) => l.id === 'star')).not.toHaveProperty('evil')
        expect(engine.calls).toEqual([]) // a look not on the cubes: nothing sent
        desk.go('star')
        expect(desk.state().live).toMatchObject({ colour: '#3050ff', spin: 0.5 }) // the kept changes go with it
        const frames = () => engine.calls.filter((c) => c.kind === 'frame' && c.points.some(isLit)).length
        const before = frames()
        desk.editLook('star', { shape: 'spots' })
        expect(desk.state().live.shape).toBe('spots')
        expect(frames()).toBe(before + 1) // the cubes showed it at once
        desk.editLook('ring', { colour: '#ffffff' })
        expect(desk.state().live.shape).toBe('spots') // another look: the cubes keep theirs
        expect(desk.editLook('nope', {})).toMatchObject({ ok: false, status: 404 })
    })
    // 2026-10-30, the owner: "it will be saved like new scene" — Save never overwrites a saved look.
    it('Save makes a changed look a new scene at the end and puts the look back as it was saved', () => {
        const dir = tmp()
        const { desk } = deskWith(fakeEngine(), { dir })
        const wave = desk.state().looks.find((l) => l.id === 'wave')
        expect(desk.state()).toMatchObject({ unsaved: false, changed: [] })
        desk.editLook('wave', { colour: '#ffffff', spin: 0.25 })
        expect(desk.state()).toMatchObject({ unsaved: true, changed: ['wave'] })
        expect(fs.existsSync(path.join(dir, 'desk.json'))).toBe(false)
        expect(desk.saveBank()).toMatchObject({ ok: true, created: [{ from: 'wave', id: 'wave-2' }] })
        const looks = desk.state().looks
        expect(looks.find((l) => l.id === 'wave')).toEqual(wave) // the saved look, as it was
        expect(looks[looks.length - 1]).toMatchObject({ id: 'wave-2', name: 'Wave 2', shape: 'wave', colour: '#ffffff', spin: 0.25 })
        expect(desk.state()).toMatchObject({ unsaved: false, changed: [] })
        const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'desk.json'), 'utf8'))
        expect(onDisk.looks.map((l) => l.id)).toEqual(looks.map((l) => l.id))
        // Changed again: the next number. A new name alone renames in place.
        desk.editLook('wave', { colour: '#ff2030' })
        desk.editLook('ring', { name: 'Red ring' })
        expect(desk.state().changed).toEqual(['wave'])
        expect(desk.saveBank().created).toEqual([{ from: 'wave', id: 'wave-3' }])
        expect(desk.state().looks.find((l) => l.id === 'wave-3').name).toBe('Wave 3')
        expect(desk.state().looks.find((l) => l.id === 'ring').name).toBe('Red ring')
        // A new name with the change names the new scene; the look keeps its old name.
        desk.editLook('star', { name: 'Blue star', colour: '#3050ff' })
        expect(desk.saveBank().created).toEqual([{ from: 'star', id: 'blue-star' }])
        expect(desk.state().looks.find((l) => l.id === 'star').name).toBe('Star')
    })
    it('the look on the laser plays on as its new scene; a copy is kept as it is; a clean stop saves the same way', () => {
        const dir = tmp()
        const { desk } = deskWith(fakeEngine(['cube-1']), { dir })
        desk.go('triangle')
        desk.editLook('triangle', { spin: 1 })
        expect(desk.copyLook('square')).toMatchObject({ ok: true, id: 'square-2' })
        expect(desk.state().looks.map((l) => l.id).indexOf('square-2')).toBe(desk.state().looks.map((l) => l.id).indexOf('square') + 1)
        expect(desk.state()).toMatchObject({ changed: ['triangle'], added: ['square-2'] })
        const { created } = desk.saveBank()
        expect(created).toEqual([{ from: 'triangle', id: 'triangle-2' }])
        expect(desk.state()).toMatchObject({ liveId: 'triangle-2', live: { spin: 1 } })
        expect(desk.state().looks.find((l) => l.id === 'triangle').spin).toBe(SEED_LOOKS.find((l) => l.id === 'triangle').spin)
        expect(desk.state().looks.find((l) => l.id === 'square-2').name).toBe('Square 2')
        // Unsaved at a clean stop: written as Save would, and BPM on the way writes only what was saved.
        desk.editLook('fan', { colour: '#ff30c0' })
        desk.setBpm(90)
        desk.close()
        const again = deskWith(fakeEngine(), { dir }).desk.state()
        expect(again.bpm).toBe(90)
        expect(again.looks.find((l) => l.id === 'fan').colour).toBe('#ffffff')
        expect(again.looks.find((l) => l.id === 'fan-2').colour).toBe('#ff30c0')
    })
    it('a write for the clock or the setup never carries an edit Save has not seen', async () => {
        const dir = tmp()
        const { desk } = deskWith(fakeEngine(), { dir })
        desk.editLook('ring', { colour: '#ffffff' })
        desk.setMaster(0.5)
        await new Promise((r) => setTimeout(r, 450)) // the debounced write
        const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'desk.json'), 'utf8'))
        expect(onDisk.master).toBe(0.5)
        expect(onDisk.looks.find((l) => l.id === 'ring').colour).toBe('#ff2030')
        expect(desk.state().unsaved).toBe(true)
    })
    it('store keeps a look the page sends in a tile or a new one, and leaves the cubes as they were', () => {
        const { desk } = deskWith(fakeEngine())
        desk.go('ring')
        const before = desk.state().live
        expect(desk.store({ id: 'star', look: { ...SEED_LOOKS.find((l) => l.id === 'star'), colour: '#ffb020' } })).toMatchObject({ ok: true, id: 'star' })
        expect(desk.state().looks.find((l) => l.id === 'star').colour).toBe('#ffb020')
        expect(desk.store({ name: 'Amber spots', look: { shape: 'spots', colour: '#ffb020' } })).toMatchObject({ ok: true, id: 'amber-spots' })
        expect(desk.state()).toMatchObject({ live: before, liveId: 'ring' })
        // Nothing live and no look: nothing to store.
        expect(deskWith(fakeEngine()).desk.store({})).toMatchObject({ ok: false, status: 400 })
    })
})

describe('undo, redo and paste (2026-10-30, the owner: "add delete ctl z ctrl v ctrl c and other shortkeys")', () => {
    const lookOf = (desk, id) => desk.state().looks.find((l) => l.id === id)
    it('undo takes an edit back and redo puts it again; a slider dragged is one step', () => {
        const { desk, t } = deskWith(fakeEngine())
        const ring = lookOf(desk, 'ring')
        expect(desk.state()).toMatchObject({ canUndo: false, canRedo: false })
        desk.editLook('ring', { size: 0.5 }); t.now += 200
        desk.editLook('ring', { size: 0.6 }); t.now += 200
        desk.editLook('ring', { size: 0.7 })
        expect(desk.undo()).toMatchObject({ ok: true, undone: true })
        expect(lookOf(desk, 'ring')).toEqual(ring)
        expect(desk.state()).toMatchObject({ canUndo: false, canRedo: true, unsaved: false })
        expect(desk.redo()).toMatchObject({ ok: true, redone: true })
        expect(lookOf(desk, 'ring').size).toBe(0.7)
        expect(desk.undo().undone && desk.undo().undone).toBe(false) // one step back, then nothing left
    })
    it('a pause, another look or another kind of change starts a new step; a new change ends redo', () => {
        const { desk, t } = deskWith(fakeEngine())
        desk.editLook('ring', { size: 0.5 }); t.now += 5000
        desk.editLook('ring', { size: 0.6 })
        desk.editLook('star', { spin: 0.5 })
        desk.undo()
        expect(lookOf(desk, 'star').spin).toBe(SEED_LOOKS.find((l) => l.id === 'star').spin)
        expect(lookOf(desk, 'ring').size).toBe(0.6)
        desk.undo()
        expect(lookOf(desk, 'ring').size).toBe(0.5)
        expect(desk.state().canRedo).toBe(true)
        desk.editLook('fan', { level: 0.5 })
        expect(desk.state().canRedo).toBe(false)
    })
    it('undo brings a deleted look back in its place, with its id; the look on the laser plays on through the delete', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk } = deskWith(engine)
        const ids = desk.state().looks.map((l) => l.id)
        desk.go('wave')
        desk.remove('wave')
        expect(desk.state()).toMatchObject({ liveId: null, live: { shape: 'wave' } })
        desk.undo()
        expect(desk.state().looks.map((l) => l.id)).toEqual(ids)
        expect(desk.state().liveId).toBe('wave')
    })
    it('the look on the laser follows an undo, as it follows an edit', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk } = deskWith(engine)
        desk.go('ring')
        desk.editLook('ring', { colour: '#ffffff' })
        expect(desk.state().live.colour).toBe('#ffffff')
        const frames = engine.calls.filter((c) => c.kind === 'frame').length
        desk.undo()
        expect(desk.state().live.colour).toBe('#ff2030')
        expect(engine.calls.filter((c) => c.kind === 'frame').length).toBe(frames + 1)
    })
    it('paste puts a copied look after the one given, under a free name; undo takes it away', () => {
        const { desk } = deskWith(fakeEngine())
        const star = lookOf(desk, 'star')
        expect(desk.pasteLook({ ...star, colour: '#ffb020' }, 'ring')).toMatchObject({ ok: true, id: 'star-2' })
        const ids = desk.state().looks.map((l) => l.id)
        expect(ids[ids.indexOf('ring') + 1]).toBe('star-2')
        expect(lookOf(desk, 'star-2')).toMatchObject({ name: 'Star 2', shape: 'star', colour: '#ffb020' })
        expect(desk.pasteLook({ name: 'From another desk', shape: 'spots' })).toMatchObject({ ok: true, id: 'from-another-desk' })
        expect(desk.state().looks[desk.state().looks.length - 1].id).toBe('from-another-desk')
        expect(desk.pasteLook('star')).toMatchObject({ ok: false, status: 400 })
        desk.undo()
        desk.undo()
        expect(desk.state().looks.map((l) => l.id)).not.toContain('star-2')
    })
    it('copy, order and Save are steps too: undoing a Save puts the edit back in its look and lights Save', () => {
        const dir = tmp()
        const { desk } = deskWith(fakeEngine(), { dir })
        const before = desk.state().looks.map((l) => l.id)
        desk.copyLook('fan')
        desk.reorder(['grid', 'ring'])
        desk.undo()
        desk.undo()
        expect(desk.state().looks.map((l) => l.id)).toEqual(before)
        desk.editLook('star', { colour: '#ffffff' })
        desk.saveBank()
        expect(lookOf(desk, 'star-2')).toBeTruthy()
        desk.undo()
        expect(lookOf(desk, 'star-2')).toBeUndefined()
        expect(lookOf(desk, 'star').colour).toBe('#ffffff')
        expect(desk.state().unsaved).toBe(true)
    })
})

describe('My colours (2026-10-31, the owner: "on colos add color paleete and have new colors there as well")', () => {
    it('keeps the colours the page sends, each once, as #rrggbb, at most 24, and finds them after a restart', async () => {
        const dir = tmp()
        const { desk } = deskWith(fakeEngine(), { dir })
        expect(desk.state().palette).toEqual([])
        expect(desk.setPalette(['#FF8800', 'f80', '#123456', 'red', null, '#12345'])).toMatchObject({ ok: true, palette: ['#ff8800', '#123456'] })
        expect(desk.setPalette('nope')).toMatchObject({ ok: false, status: 400 })
        expect(desk.setPalette(Array.from({ length: 40 }, (_, i) => '#0000' + i.toString(16).padStart(2, '0'))).palette).toHaveLength(24)
        desk.setPalette(['#ff8800', '#00ffb0'])
        desk.close()
        expect(deskWith(fakeEngine(), { dir }).desk.state().palette).toEqual(['#ff8800', '#00ffb0'])
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

describe('mapping a cube (2026-10-31, the owner: "i need to mapp laser")', () => {
    const { cornerPin, normaliseCorners, FULL_CORNERS } = require('../../../shared/laserLook.cjs')
    const QUAD = [[-0.8, -0.6], [0.9, -0.9], [0.7, 0.8], [-0.6, 0.5]]
    const extent = (points) => {
        const lit = points.filter(isLit)
        const xs = lit.map((p) => p[0])
        const ys = lit.map((p) => p[1])
        return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    }

    it('the corner pin puts the field\'s corners on the four corners and keeps straight lines straight', () => {
        expect(cornerPin(FULL_CORNERS)).toBe(null)
        const pin = cornerPin(QUAD)
        FULL_CORNERS.forEach(([x, y], i) => {
            expect(pin(x, y)[0]).toBeCloseTo(QUAD[i][0], 9)
            expect(pin(x, y)[1]).toBeCloseTo(QUAD[i][1], 9)
        })
        const [a, b, m] = [pin(-1, -1), pin(1, -1), pin(0.3, -1)]
        expect((b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0])).toBeCloseTo(0, 9)
    })
    it('corners that cross or line up keep the whole field; anything but four pairs is the whole field', () => {
        expect(cornerPin([[-1, -1], [1, 1], [1, -1], [-1, 1]])).toBe(null)
        expect(cornerPin([[-1, -1], [0, 0], [1, 1], [-1, 1]])).toBe(null)
        expect(normaliseCorners('x')).toBe(FULL_CORNERS)
        expect(normaliseCorners([[0, 0], [1, 1]])).toBe(FULL_CORNERS)
        expect(normaliseCorners([[2, -3], [0, 0], [1, 1], [0, 1]])).toEqual([[1, -1], [0, 0], [1, 1], [0, 1]])
    })
    it('a look is placed in the cube\'s field first, then the field is pinned; upside down mirrors it top to bottom', () => {
        const look = normaliseLook({ shape: 'square', size: 1, height: 0, x: 0, points: 400, pulse: 0 })
        const plain = lookPointsAt(look, { t: 0, clock: clock(), cube: { ...CUBE_DEFAULTS } })
        expect(extent(plain)).toEqual([-1, 1, -1, 1])
        const [x0, x1, y0, y1] = extent(lookPointsAt(look, { t: 0, clock: clock(), cube: { ...CUBE_DEFAULTS, corners: QUAD } }))
        expect(x0).toBeCloseTo(-0.8, 2); expect(x1).toBeCloseTo(0.9, 2); expect(y0).toBeCloseTo(-0.9, 2); expect(y1).toBeCloseTo(0.8, 2)
        const tri = normaliseLook({ shape: 'triangle', size: 0.5, height: 0.2, points: 200, pulse: 0 })
        const up = lookPointsAt(tri, { t: 0, clock: clock(), cube: { ...CUBE_DEFAULTS } })
        const down = lookPointsAt(tri, { t: 0, clock: clock(), cube: { ...CUBE_DEFAULTS, flipY: true } })
        down.forEach((p, i) => { expect(p[0]).toBeCloseTo(up[i][0], 9); expect(p[1]).toBeCloseTo(-up[i][1], 9) })
    })
    it('a cube keeps its corners and upside down in desk.json, in range', () => {
        const dir = tmp()
        const engine = fakeEngine(['cube-1'])
        const { desk } = deskWith(engine, { dir })
        expect(desk.setCube('cube-1', { corners: [[-2, -1], [1, -1], [0.5, 0.9], [-0.5, 0.9]], flipY: true })).toMatchObject({ ok: true })
        expect(desk.state().cubes[0]).toMatchObject({ flipY: true, corners: [[-1, -1], [1, -1], [0.5, 0.9], [-0.5, 0.9]] })
        desk.setCube('cube-1', { size: 0.5 })
        expect(desk.state().cubes[0].corners).toEqual([[-1, -1], [1, -1], [0.5, 0.9], [-0.5, 0.9]])
        desk.close()
        const again = deskWith(fakeEngine(['cube-1']), { dir }).desk
        expect(again.state().cubes[0]).toMatchObject({ flipY: true, size: 0.5, corners: [[-1, -1], [1, -1], [0.5, 0.9], [-0.5, 0.9]] })
        again.close()
    })
    it('Test picture: the cube shows the alignment picture through its map, then goes back to the look or dark', () => {
        const engine = fakeEngine(['cube-1', 'cube-2'])
        const { desk } = deskWith(engine)
        desk.setCube('cube-1', { corners: QUAD, size: 0.3, x: 0.5 })
        expect(desk.setMapTest('nope', true)).toMatchObject({ ok: false, status: 404 })
        expect(desk.setMapTest('cube-1', true)).toMatchObject({ ok: true, mapTest: ['cube-1'] })
        const frames = engine.calls.splice(0).filter((c) => c.kind === 'frame')
        expect(frames.map((c) => c.cube)).toEqual(['cube-1'])
        // The whole field through the map: the cube's own size and offset are left out while mapping.
        const [x0, x1, y0, y1] = extent(frames[0].points)
        expect(x0).toBeCloseTo(-0.8, 2); expect(x1).toBeCloseTo(0.9, 2); expect(y0).toBeCloseTo(-0.9, 2); expect(y1).toBeCloseTo(0.8, 2)
        expect(desk.state()).toMatchObject({ mapTest: ['cube-1'], live: null })
        expect(desk.state().cubes[0].driving).toBe(true)
        // Off with no look live: dark, and the desk lets go of it.
        desk.setMapTest('cube-1', false)
        const off = engine.calls.splice(0).filter((c) => c.kind === 'frame')
        expect(off.map((c) => [c.cube, c.points.some(isLit)])).toEqual([['cube-1', false]])
        // Off with a look live: the look comes back.
        desk.go('grid')
        desk.setMapTest('cube-2', true)
        desk.setMapTest('cube-2', false)
        engine.calls.splice(0)
        desk.tick()
        expect(desk.state().mapTest).toEqual([])
        // Release ends the test too.
        desk.setMapTest('cube-1', true)
        desk.release()
        expect(desk.state().mapTest).toEqual([])
        desk.close()
    })
    it('Blackout holds a cube on its test picture dark', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk } = deskWith(engine)
        desk.setBlackout(true)
        desk.setMapTest('cube-1', true)
        expect(engine.calls.filter((c) => c.kind === 'frame').every((c) => !c.points.some(isLit))).toBe(true)
        desk.close()
    })
})

describe('the music (2026-10-31, the owner: "add audio analyze fully bpm sync as well")', () => {
    const widest = (points) => Math.max(...points.filter(isLit).map((p) => Math.abs(p[0])))
    it('Auto: the clock takes the heard tempo and lands the heard beat on a whole beat, the count running on', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk, t } = deskWith(engine)
        t.now += 5000 // 10 beats in at 120
        expect(desk.followBeat({ bpm: 128, beatAt: t.now - 100 })).toMatchObject({ ok: true, bpm: 128 })
        const beat = desk.state().beat
        // 100 ms after a beat at 128 BPM is 0.213 of a beat; the count stays near the 10 it was at.
        expect(beat - Math.floor(beat)).toBeCloseTo(100 / (60000 / 128), 6)
        expect(Math.round(beat)).toBe(10)
        expect(desk.state().bpm).toBe(128)
        expect(desk.followBeat({ bpm: 500, beatAt: t.now })).toMatchObject({ ok: false, status: 400 })
        expect(desk.followBeat({ bpm: 120, beatAt: t.now - 60000 })).toMatchObject({ ok: false, status: 400 })
        expect(desk.followBeat({ bpm: 120 })).toMatchObject({ ok: false, status: 400 })
        desk.close()
    })
    it('Resync: beat one is now', () => {
        const { desk, t } = deskWith(fakeEngine(['cube-1']))
        t.now += 3333
        expect(desk.resync()).toMatchObject({ ok: true })
        expect(desk.state().beat).toBe(0)
        desk.close()
    })
    it('Audio: quiet draws a look smaller, the bass and a kick full size, and a desk that stops hearing draws it as it is', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk, t } = deskWith(engine)
        desk.editLook('ring', { react: 1, pulse: 0, size: 0.8, height: 0, x: 0, shape: 'circle' })
        desk.go('ring')
        const drawn = () => { const frames = engine.calls.filter((c) => c.kind === 'frame'); return widest(frames[frames.length - 1].points) }
        expect(drawn()).toBeCloseTo(0.8, 3)
        expect(desk.state().hearing).toBe(false)
        desk.hearAudio({ low: 0, level: 0.1 }); t.now += 10; desk.tick()
        expect(drawn()).toBeCloseTo(0.32, 2)
        expect(desk.state().hearing).toBe(true)
        desk.hearAudio({ low: 1 }); t.now += 10; desk.tick()
        expect(drawn()).toBeCloseTo(0.8, 3)
        desk.hearAudio({ low: 0, kick: true }); t.now += 1; desk.tick()
        expect(drawn()).toBeGreaterThan(0.79)
        t.now += 400; desk.hearAudio({ low: 0 }); desk.tick()
        expect(drawn()).toBeLessThan(0.35)
        t.now += 1000; desk.tick()
        expect(drawn()).toBeCloseTo(0.8, 3)
        expect(desk.state().hearing).toBe(false)
        desk.close()
    })
    it('a look without Audio never moves with the music', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk, t } = deskWith(engine)
        desk.editLook('ring', { react: 0, pulse: 0, size: 0.8, height: 0, x: 0, shape: 'circle' })
        desk.go('ring')
        desk.hearAudio({ low: 0, kick: false }); t.now += 10; desk.tick()
        const frames = engine.calls.filter((c) => c.kind === 'frame')
        expect(widest(frames[frames.length - 1].points)).toBeCloseTo(0.8, 3)
        expect(normaliseLook({ react: 7 }).react).toBe(1)
        expect(normaliseLook({}).react).toBe(0)
        desk.close()
    })
})

describe('the desk page on a phone (docs/ai/known-fixes.md: "Setup squeezed its panes on a phone")', () => {
    it('keeps every Setup pane as tall as it needs, so the cube table and the mapping square are not squeezed under Safety', () => {
        const css = fs.readFileSync(require.resolve('./ui/desk.css'), 'utf8')
        const start = css.indexOf('@media (max-width: 760px) {')
        expect(start).toBeGreaterThan(-1)
        let depth = 0
        let end = start
        for (let i = css.indexOf('{', start); i < css.length; i += 1) {
            if (css[i] === '{') depth += 1
            if (css[i] === '}') { depth -= 1; if (depth === 0) { end = i; break } }
        }
        const phone = css.slice(start, end)
        expect(phone).toMatch(/#page-setup\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*\}/)
        expect(phone).toMatch(/#page-setup\s*>\s*\.pane\s*\{\s*flex:\s*none;\s*\}/)
    })
})

describe('a cube\'s brightness (2026-11-01, the owner: "i want laser brighntess controll in setup")', () => {
    const brightest = (points) => Math.max(...points.map((p) => Math.max(p[2], p[3], p[4])))
    it('is the most the cube gives: every look and the master scale under it, the test picture too; kept in desk.json', () => {
        const dir = tmp()
        const engine = fakeEngine(['cube-1'])
        const { desk, t } = deskWith(engine, { dir })
        expect(desk.state().cubes[0].brightness).toBe(1)
        desk.editLook('ring', { level: 1, colour: '#ffffff', pulse: 0, react: 0 })
        desk.go('ring')
        const last = () => { const frames = engine.calls.filter((c) => c.kind === 'frame'); return frames[frames.length - 1].points }
        expect(brightest(last())).toBeCloseTo(1, 3)
        expect(desk.setCube('cube-1', { brightness: 0.25 })).toMatchObject({ ok: true, cube: { brightness: 0.25 } })
        expect(brightest(last())).toBeCloseTo(0.25, 3)
        desk.setMaster(0.5); t.now += 10; desk.tick()
        expect(brightest(last())).toBeCloseTo(0.125, 3)
        desk.setMaster(1)
        desk.setMapTest('cube-1', true)
        expect(brightest(last())).toBeCloseTo(0.25, 3)
        desk.setMapTest('cube-1', false)
        expect(desk.setCube('cube-1', { brightness: 7 }).cube.brightness).toBe(1)
        expect(desk.setCube('cube-1', { brightness: -1 }).cube.brightness).toBe(0)
        expect(desk.setCube('cube-1', { brightness: 'x' }).cube.brightness).toBe(0)
        desk.setCube('cube-1', { brightness: 0.6 })
        desk.close()
        expect(deskWith(fakeEngine(['cube-1']), { dir }).desk.state().cubes[0].brightness).toBe(0.6)
    })
})

describe('Displace, Wobble and Strobe (2026-11-01, the owner: "add more parametres for changing shape like dis[place wobbines strobe")', () => {
    const g = require('./laserGuards')
    const { applyZone, normaliseZone, stillBeams, dotsAllowed } = require('./laserEngine')
    const { DOT_SHAPES } = require('../../../shared/laserShapes.cjs')
    // A dot shape (phyllotaxis) is dots only: let through by laser.json "dots": true, a still beam without it.
    const notStill = (shape, frame, label) => (DOT_SHAPES.includes(shape) ? expect(!stillBeams(frame).length || dotsAllowed(stillBeams(frame)), label).toBe(true) : expect(stillBeams(frame), label).toEqual([]))
    const { flattenLaserPaths } = require('../../../shared/laserFrame.cjs')
    const full = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }
    it('at full Displace and Wobble every seed look still fits the real cube (2333 points at 35 kpps) and is never still', () => {
        const plan = g.pathPlan(g.DEFAULT_GUARDS, 35000)
        const budget = g.frameBudget(35000, 6000)
        for (const seed of SEED_LOOKS) {
            const look = normaliseLook({ ...seed, size: 0.99, height: 0, x: 0, displace: 1, wobble: 1, wobbleBeats: 1 })
            for (let beat = 0; beat < 16; beat += 0.5) {
                // phyllochaos's falling point is Point's ring alone (to beat 12): both bends at full squash it into a dwell
                // for up to 160 ms at 120 BPM, under the engine's 200 ms hold; laserGuards.test.js holds that in time instead.
                if (look.shape === 'phyllochaos' && beat < 12) continue
                const raw = lookPointsAt(look, { t: beat * 500, clock: clock(120, 0) })
                if (!raw.some(isLit)) continue
                const frame = g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, normaliseZone(full)).points, plan).points
                expect(frame.length, `${seed.id} beat ${beat}`).toBeLessThanOrEqual(budget)
                notStill(look.shape, frame, `${seed.id} beat ${beat}`)
            }
        }
    })
    it('Strobe lights the first half of each flash on the desk\'s beat; off is the look as it was', () => {
        const look = normaliseLook({ shape: 'circle', size: 0.5, height: 0, pulse: 0 })
        const lit = (l, beat) => lookPointsAt(l, { t: beat * 500, clock: clock(120, 0) }).some(isLit)
        expect([0, 0.25, 0.5, 0.75, 1].map((b) => lit({ ...look, strobe: 1 }, b))).toEqual([true, true, false, false, true])
        expect([0, 0.3, 0.6, 0.9].map((b) => lit({ ...look, strobe: 2 }, b))).toEqual([true, false, true, false])
        expect([0, 0.5, 0.75].map((b) => lit(look, b))).toEqual([true, true, true])
    })
    it('Wobble keeps a line one stroke, its blank moves arriving where the strokes now start', () => {
        const look = normaliseLook({ shape: 'fan', size: 0.8, height: 0, pulse: 0, wobble: 1 })
        const pts = lookPointsAt(look, { t: 300, clock: clock(120, 0) })
        for (let k = 0; k < pts.length - 1; k += 1) {
            if (!isLit(pts[k]) && isLit(pts[k + 1])) expect([pts[k][0], pts[k][1]]).toEqual([pts[k + 1][0], pts[k + 1][1]])
        }
        expect(normaliseLook({ displace: 5, wobble: -1, wobbleBeats: 0, strobe: 9 })).toMatchObject({ displace: 1, wobble: 0, wobbleBeats: 0.25, strobe: 2 })
    })
})

describe('Speed, Split and Flicker (2026-11-06 evening, from the owner\'s laser.html: "red + green beams slightly misaligned")', () => {
    const g = require('./laserGuards')
    const { applyZone, normaliseZone, stillBeams, dotsAllowed } = require('./laserEngine')
    const { DOT_SHAPES } = require('../../../shared/laserShapes.cjs')
    // A dot shape (phyllotaxis) is dots only: let through by laser.json "dots": true, a still beam without it.
    const notStill = (shape, frame, label) => (DOT_SHAPES.includes(shape) ? expect(!stillBeams(frame).length || dotsAllowed(stillBeams(frame)), label).toBe(true) : expect(stillBeams(frame), label).toEqual([]))
    const { flattenLaserPaths } = require('../../../shared/laserFrame.cjs')
    const full = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const hex = (p) => '#' + [p[2], p[3], p[4]].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')

    it('a look keeps them in range, and one saved before them reads as off', () => {
        expect(normaliseLook({})).toMatchObject({ speed: 1, split: 0, colour2: '#14ff28', flicker: 0 })
        expect(normaliseLook({ speed: 9, split: 2, flicker: -1, colour2: 'green' })).toMatchObject({ speed: 4, split: 1, flicker: 0, colour2: '#14ff28' })
        expect(normaliseLook({ speed: 0, colour2: '#0f0' })).toMatchObject({ speed: 0.25, colour2: '#00ff00' })
        expect(LOOK_DEFAULTS).toMatchObject({ speed: 1, split: 0, colour2: '#14ff28', flicker: 0 })
    })

    it('Split draws the picture again in the split colour, a little apart, sharing the look\'s points', () => {
        const look = normaliseLook({ shape: 'circle', size: 0.5, height: 0, points: 400, colour: '#ff0000', colour2: '#00ff00' })
        const at = (l) => lookPointsAt(l, { t: 0, clock: clock(120, 0) })
        const plain = strokes(at(look))
        const split = strokes(at({ ...look, split: 0.5 }))
        expect(plain).toHaveLength(1)
        expect(split).toHaveLength(2)
        expect(hex(split[0][0])).toBe('#ff0000')
        expect(hex(split[1][0])).toBe('#00ff00')
        expect(split[0].length + split[1].length).toBe(plain[0].length)
        // The second beam is the first moved 0.02 of the field (Split 0.5 of SPLIT_REACH 0.04), the same way for every point.
        const moves = split[1].map((p, i) => [p[0] - split[0][i][0], p[1] - split[0][i][1]])
        for (const m of moves) {
            expect(Math.hypot(m[0], m[1])).toBeCloseTo(0.02, 6)
            expect(m[0]).toBeCloseTo(moves[0][0], 9)
        }
        expect(at({ ...look, split: 0 })).toEqual(at(look))
    })

    it('Flicker dips the brightness by up to half, new every frame, each beam and cube its own; the same moment draws the same', () => {
        const look = normaliseLook({ shape: 'circle', size: 0.5, height: 0, colour: '#ff0000', flicker: 1 })
        const red = (t, index = 0) => lookPointsAt(look, { t, clock: clock(120, 0), index }).find(isLit)[2]
        const reds = Array.from({ length: 40 }, (_, k) => red(k * 50))
        for (const r of reds) { expect(r).toBeGreaterThanOrEqual(0.5 - 1e-9); expect(r).toBeLessThanOrEqual(1) }
        expect(new Set(reds.map((r) => r.toFixed(4))).size).toBeGreaterThan(30)
        expect(red(1234)).toBe(red(1234))
        expect(red(1210)).toBe(red(1240))
        expect(red(1234, 1)).not.toBe(red(1234, 0))
        expect(lookPointsAt({ ...look, flicker: 0 }, { t: 0, clock: clock(120, 0) }).find(isLit)[2]).toBe(1)
    })

    it('Speed runs the shape\'s own beat; Strobe keeps the desk\'s', () => {
        const look = normaliseLook({ shape: 'volcano', size: 0.5, height: 0, points: 300 })
        const at = (l, beat) => lookPointsAt(l, { t: beat * 500, clock: clock(120, 0) })
        for (const beat of [0.3, 2.6, 5.2, 9.1]) expect(at({ ...look, speed: 2 }, beat)).toEqual(at(look, beat * 2))
        expect(at({ ...look, speed: 0.5 }, 9.1)).toEqual(at(look, 4.55))
        const lit = (beat) => at({ ...look, speed: 2, strobe: 1 }, beat).some(isLit)
        expect([0.1, 0.4, 0.6, 0.9, 1.1].map(lit)).toEqual([true, true, false, false, true])
    })

    it('at Split 1, with Speed 4 or with Displace and Wobble in full, every seed look still fits the real cube (2333 points at 35 kpps) and is never still', () => {
        const plan = g.pathPlan(g.DEFAULT_GUARDS, 35000)
        const budget = g.frameBudget(35000, 6000)
        for (const seed of SEED_LOOKS) {
            for (const more of [{ speed: 4 }, { displace: 1, wobble: 1, wobbleBeats: 1 }]) {
                const look = normaliseLook({ ...seed, size: 0.99, height: 0, x: 0, split: 1, ...more })
                for (let beat = 0; beat < 16; beat += 0.5) {
                    const raw = lookPointsAt(look, { t: beat * 500, clock: clock(120, 0) })
                    if (!raw.some(isLit)) continue
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, normaliseZone(full)).points, plan).points
                    const label = `${seed.id} ${JSON.stringify(more)} beat ${beat}`
                    expect(frame.length, label).toBeLessThanOrEqual(budget)
                    notStill(look.shape, frame, label)
                }
            }
        }
    })

    it('a picture too busy to draw twice in one pass stays one beam with all its points; Strands always gets both', () => {
        const at = (l, beat = 0) => lookPointsAt(l, { t: beat * 500, clock: clock(120, 0) })
        const galaxy = normaliseLook({ ...SEED_LOOKS.find((l) => l.id === 'galaxy'), size: 0.99, height: 0, x: 0 })
        expect(at({ ...galaxy, split: 1 })).toEqual(at(galaxy))
        const strands = normaliseLook({ ...SEED_LOOKS.find((l) => l.id === 'strands'), size: 1, height: 0, x: 0 })
        expect(strands).toMatchObject({ shape: 'strands', colour: '#ff190a', colour2: '#14ff28', split: 0.25, flicker: 0.4 })
        for (let beat = 0; beat < 16; beat += 1 / 8) expect(strokes(at(strands, beat)), `beat ${beat}`).toHaveLength(2)
    })
})

describe('Distance: how far the split beam is below the first (2026-11-07, the owner: "second line … make lines far and near option", "distance should be y not x side")', () => {
    const strokes = (points) => {
        const out = [[]]
        for (const p of points) { if (!isLit(p)) out.push([]); else out[out.length - 1].push(p) }
        return out.filter((s) => s.length)
    }
    const base = normaliseLook({ shape: 'circle', size: 0.5, height: 0, points: 400, colour: '#ff0000', colour2: '#00ff00', split: 1 })
    // How far the second beam is from the first, point by point: [across, up].
    const apart = (look, more = {}) => {
        const [first, second] = strokes(lookPointsAt({ ...look, ...more }, { t: 0, clock: clock(120, 0) }))
        return second.map((p, i) => [p[0] - first[i][0], p[1] - first[i][1]])
    }
    it('is 0…1, a look saved before it reads as 0 (near), and the old looks are drawn as they were', () => {
        expect(normaliseLook({})).toMatchObject({ splitFar: 0 })
        expect(normaliseLook({ splitFar: 9 }).splitFar).toBe(1)
        expect(normaliseLook({ splitFar: -1 }).splitFar).toBe(0)
        expect(LOOK_DEFAULTS.splitFar).toBe(0)
        const at = (l) => lookPointsAt(l, { t: 0, clock: clock(120, 0) })
        expect(at({ ...base, splitFar: 0 })).toEqual(at(base))
        expect(at({ ...base, splitFar: 1, split: 0 })).toEqual(at({ ...base, split: 0 }))
    })
    it('at Split 1, Distance 0 is the old 0.04 of the field and Distance 1 is 0.6, each step growing by the same factor', () => {
        const offset = (far, split = 1) => Math.hypot(...apart(base, { splitFar: far, split })[0])
        expect(offset(0)).toBeCloseTo(0.04, 6)
        expect(offset(1)).toBeCloseTo(0.6, 6)
        expect(offset(0.5)).toBeCloseTo(Math.sqrt(0.04 * 0.6), 6)
        expect(offset(0.5) / offset(0)).toBeCloseTo(offset(1) / offset(0.5), 6)
        // Split sets how much of that reach: half of it at Split 0.5.
        expect(offset(1, 0.5)).toBeCloseTo(0.3, 6)
        expect(offset(0, 0.5)).toBeCloseTo(0.02, 6)
    })
    it('the second beam is straight below the first, the same x, whatever the Distance, turn or spin', () => {
        for (const more of [{ splitFar: 0 }, { splitFar: 0.5 }, { splitFar: 1 }, { splitFar: 1, rotation: 0.125 }, { splitFar: 1, spin: 0.25 }]) {
            const moves = apart(base, more)
            const down = Math.hypot(...moves[0])
            expect(down, JSON.stringify(more)).toBeGreaterThan(0.03)
            for (const m of moves) {
                expect(m[0], JSON.stringify(more)).toBeCloseTo(0, 9)
                expect(m[1], JSON.stringify(more)).toBeCloseTo(-down, 9)
            }
        }
    })
    it('the picture a look can reach grows with its Distance, so a picture framed on it keeps the far beam inside', () => {
        const { lookBox } = require('../../../shared/laserLook.cjs')
        const near = lookBox({ ...base, split: 1, splitFar: 0 })
        const far = lookBox({ ...base, split: 1, splitFar: 1 })
        expect(far[3] - far[2]).toBeGreaterThan(near[3] - near[2])
        expect(lookBox({ ...base, split: 0, splitFar: 1 })).toEqual(lookBox({ ...base, split: 0, splitFar: 0 }))
    })
})

describe('Reset: a look back to how its scene started (2026-11-07, the owner: "reset parameters option so we will come back to 0 point for each scene how it was from the beginning")', () => {
    const lookOf = (desk, id) => desk.state().looks.find((l) => l.id === id)
    // What the page's Reset button sends (serverXR/src/laser/ui/desk.js): the look's seed (its own id's, else the seed of its
    // first shape) over the desk's defaults, only the settings that differ, as one edit that is a step of its own.
    // Name, size, height, x and cubes stay.
    const KEEP = ['id', 'name', 'size', 'height', 'x', 'cubes']
    const resetLook = (desk, id) => {
        const { seeds, defaults } = desk.state()
        const look = lookOf(desk, id)
        const first = (shape) => String(shape || '').split(',')[0]
        const seed = seeds.find((s) => s.id === look.id) || seeds.find((s) => first(s.shape) === first(look.shape)) || { shape: look.shape }
        const changes = {}
        for (const [k, v] of Object.entries({ ...defaults, ...seed })) {
            if (!KEEP.includes(k) && JSON.stringify(look[k]) !== JSON.stringify(v)) changes[k] = v
        }
        return desk.editLook(id, { ...changes, step: true })
    }
    const EDITS = { name: 'Mine', size: 0.4, height: 0.2, x: 0.3, cubes: ['cube-1'], colour: '#ffffff', spin: 0.9, split: 0.7, splitFar: 0.8, speed: 3, flicker: 0.5, pulse: 0.8, copies: 4 }

    it('the desk state carries the seed looks and the defaults for it', () => {
        const { desk } = deskWith(fakeEngine())
        expect(desk.state().seeds.map((l) => l.id)).toEqual(SEED_LOOKS.map((l) => l.id))
        expect(desk.state().seeds.find((l) => l.id === 'star')).toMatchObject({ shape: 'star', colour: '#20d8ff', spin: 0.125 })
        expect(desk.state().defaults).toEqual(LOOK_DEFAULTS)
    })

    it('an edited look goes back to its seed over the defaults, and keeps its name, size, height, x and cubes', () => {
        const { desk } = deskWith(fakeEngine())
        desk.editLook('star', EDITS)
        expect(lookOf(desk, 'star')).toMatchObject({ colour: '#ffffff', spin: 0.9, split: 0.7, splitFar: 0.8, speed: 3 })
        expect(resetLook(desk, 'star')).toMatchObject({ ok: true })
        const seed = normaliseLook(SEED_LOOKS.find((l) => l.id === 'star'))
        const now = lookOf(desk, 'star')
        for (const k of Object.keys(seed)) if (!KEEP.includes(k)) expect(now[k], k).toEqual(seed[k])
        expect(now).toMatchObject({ colour: '#20d8ff', spin: 0.125, split: 0, splitFar: 0, speed: 1, flicker: 0, pulse: 0, copies: 0 })
        expect(now).toMatchObject({ name: 'Mine', size: 0.4, height: 0.2, x: 0.3, cubes: ['cube-1'] })
        expect(now.id).toBe('star')
    })

    it('a saved copy goes back to the seed of its first shape', () => {
        const { desk } = deskWith(fakeEngine())
        const { id } = desk.copyLook('star')
        expect(lookOf(desk, id).name).toBe('Star 2')
        desk.editLook(id, { colour: '#ffffff', spin: -1, splitFar: 1, shape: 'star,circle' })
        resetLook(desk, id)
        expect(lookOf(desk, id)).toMatchObject({ id, name: 'Star 2', shape: 'star', colour: '#20d8ff', spin: 0.125, splitFar: 0 })
    })

    it('is its own undo step: one undo brings the edited look back, a second the look as it was', () => {
        const { desk, t } = deskWith(fakeEngine())
        const original = lookOf(desk, 'star')
        desk.editLook('star', { colour: '#ffffff' }); t.now += 100
        desk.editLook('star', EDITS)
        const edited = lookOf(desk, 'star')
        resetLook(desk, 'star')
        expect(lookOf(desk, 'star')).not.toEqual(edited)
        expect(desk.undo()).toMatchObject({ ok: true, undone: true })
        expect(lookOf(desk, 'star')).toEqual(edited)
        expect(desk.redo()).toMatchObject({ ok: true, redone: true })
        expect(lookOf(desk, 'star').colour).toBe('#20d8ff')
        desk.undo()
        desk.undo()
        expect(lookOf(desk, 'star')).toEqual(original)
    })

    it('without its own step, a Reset right after a slider is joined to it (what `step: true` is for)', () => {
        const { desk } = deskWith(fakeEngine())
        const original = lookOf(desk, 'star')
        desk.editLook('star', { spin: 0.9 })
        desk.editLook('star', { spin: 0.125 })
        expect(desk.undo().undone).toBe(true)
        expect(lookOf(desk, 'star')).toEqual(original)
        desk.redo()
        desk.editLook('star', { colour: '#ffffff' })
        desk.editLook('star', { colour: '#20d8ff', step: true })
        desk.undo()
        expect(lookOf(desk, 'star').colour).toBe('#ffffff')
    })

    it('a look on the laser follows it, and an undo', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk } = deskWith(engine)
        desk.go('star')
        desk.editLook('star', { colour: '#ffffff', splitFar: 1 })
        expect(desk.state().live).toMatchObject({ colour: '#ffffff', splitFar: 1 })
        resetLook(desk, 'star')
        expect(desk.state().live).toMatchObject({ colour: '#20d8ff', splitFar: 0 })
        desk.undo()
        expect(desk.state().live).toMatchObject({ colour: '#ffffff', splitFar: 1 })
    })

    it('a look already as it started has nothing to change', () => {
        const { desk } = deskWith(fakeEngine())
        const before = lookOf(desk, 'ring')
        const { seeds, defaults } = desk.state()
        const seed = seeds.find((s) => s.id === 'ring')
        const differs = Object.entries({ ...defaults, ...seed }).filter(([k, v]) => !KEEP.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(v))
        expect(differs).toEqual([])
    })
})

describe('Send to: a look on some of the lasers (2026-11-07, the owner\'s laser desk: a look to one laser, others keep theirs)', () => {
    const hexOf = (p) => '#' + [p[2], p[3], p[4]].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
    // The colour a cube's last frame was drawn in; null where the desk sent it nothing.
    const colourOn = (engine, cube) => {
        const frame = engine.frames().byCube[cube]
        const p = frame?.find(isLit)
        return p ? hexOf(p) : null
    }
    const colours = (engine) => ['cube-1', 'cube-2', 'cube-3', 'cube-4'].map((c) => colourOn(engine, c))
    const RING = '#ff2030'
    const STAR = '#20d8ff'
    const WAVE = '#3050ff'
    const four = () => {
        const engine = fakeEngine(['cube-1', 'cube-2', 'cube-3', 'cube-4'])
        return { engine, ...deskWith(engine) }
    }

    it('look A to laser 1 and look B to lasers 3 and 4: each cube draws only its own look, laser 2 is left alone', () => {
        const { engine, desk } = four()
        expect(desk.go('ring', ['cube-1'])).toMatchObject({ ok: true, liveBy: { 'cube-1': { id: 'ring', name: 'Ring' } } })
        expect(colours(engine)).toEqual([RING, null, null, null])
        expect(desk.go('star', ['cube-3', 'cube-4'])).toMatchObject({ ok: true })
        expect(colours(engine)).toEqual([RING, null, STAR, STAR])
        expect(desk.state().liveBy).toEqual({ 'cube-1': { id: 'ring', name: 'Ring' }, 'cube-3': { id: 'star', name: 'Star' }, 'cube-4': { id: 'star', name: 'Star' } })
        expect(desk.state()).toMatchObject({ live: null, liveId: null })
        // Each cube's frame is its own look's picture, nothing of the other's.
        const lit = (cube) => engine.frames().byCube[cube].filter(isLit)
        expect(lit('cube-1').every((p) => hexOf(p) === RING)).toBe(true)
        expect(lit('cube-3').every((p) => hexOf(p) === STAR)).toBe(true)
        expect(engine.frames().byCube['cube-3']).toEqual(engine.frames().byCube['cube-4'])
    })

    it('a look sent to some lasers plays over the look sent to all; the other lasers keep that', () => {
        const { engine, desk } = four()
        desk.go('wave')
        expect(colours(engine)).toEqual([WAVE, WAVE, WAVE, WAVE])
        desk.go('ring', ['cube-1'])
        desk.go('star', ['cube-3', 'cube-4'])
        expect(colours(engine)).toEqual([RING, WAVE, STAR, STAR])
        expect(desk.state()).toMatchObject({ liveId: 'wave' })
        // A laser sent to again takes the new look.
        desk.go('star', ['cube-1'])
        expect(colours(engine)).toEqual([STAR, WAVE, STAR, STAR])
    })

    it('editing a look changes every laser playing it, and only them', () => {
        const { engine, desk } = four()
        desk.go('ring', ['cube-1', 'cube-2'])
        desk.go('star', ['cube-3'])
        const before = { one: engine.frames().byCube['cube-1'], three: engine.frames().byCube['cube-3'] }
        expect(desk.editLook('ring', { colour: '#ffffff' })).toMatchObject({ ok: true })
        expect(colours(engine)).toEqual(['#ffffff', '#ffffff', STAR, null])
        expect(engine.frames().byCube['cube-1']).not.toEqual(before.one)
        expect(engine.frames().byCube['cube-3']).toEqual(before.three)
        expect(desk.state().liveBy['cube-2']).toEqual({ id: 'ring', name: 'Ring' })
        // Size changes the drawing itself, on both lasers.
        desk.editLook('ring', { size: 0.2 })
        const reach = (cube) => Math.max(...engine.frames().byCube[cube].filter(isLit).map((p) => Math.abs(p[0])))
        expect(reach('cube-1')).toBeLessThan(0.25)
        expect(reach('cube-2')).toBeLessThan(0.25)
        // Undo follows too.
        desk.undo()
        expect(reach('cube-1')).toBeGreaterThan(0.25)
        expect(reach('cube-2')).toBeGreaterThan(0.25)
    })

    it('sending to All puts every laser back on one look', () => {
        const { engine, desk } = four()
        desk.go('ring', ['cube-1'])
        desk.go('star', ['cube-3', 'cube-4'])
        expect(Object.keys(desk.state().liveBy)).toHaveLength(3)
        expect(desk.go('wave')).toMatchObject({ ok: true, live: 'wave', liveBy: {} })
        expect(colours(engine)).toEqual([WAVE, WAVE, WAVE, WAVE])
        expect(desk.state()).toMatchObject({ liveId: 'wave', liveBy: {} })
        // And editing the look sent to all reaches them all again.
        desk.editLook('wave', { colour: '#ffffff' })
        expect(colours(engine)).toEqual(['#ffffff', '#ffffff', '#ffffff', '#ffffff'])
    })

    it('answers for lasers that are not on the desk, and Release lets every laser go', () => {
        const { engine, desk } = four()
        expect(desk.go('ring', ['cube-9'])).toMatchObject({ ok: false, status: 400 })
        expect(desk.go('nothing', ['cube-1'])).toMatchObject({ ok: false, status: 404 })
        expect(desk.go('ring', ['cube-9', 'cube-2'])).toMatchObject({ ok: true, liveBy: { 'cube-2': { id: 'ring' } } })
        expect(colours(engine)).toEqual([null, RING, null, null])
        desk.release()
        expect(desk.state().liveBy).toEqual({})
        expect(colours(engine)).toEqual([null, null, null, null])
    })
})

describe('a look\'s Cubes are where it plays (2026-11-07, the owner, showing the editor\'s Cubes: "choose each liser and then going anorher pattern choosing laser")', () => {
    const hexOf = (p) => '#' + [p[2], p[3], p[4]].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
    const colours = (engine) => ['cube-1', 'cube-2', 'cube-3', 'cube-4'].map((c) => {
        const p = engine.frames().byCube[c]?.find(isLit)
        return p ? hexOf(p) : null
    })
    const RING = '#ff2030'
    const STAR = '#20d8ff'
    const WAVE = '#3050ff'
    const four = () => {
        const engine = fakeEngine(['cube-1', 'cube-2', 'cube-3', 'cube-4'])
        return { engine, ...deskWith(engine) }
    }

    it('pick lasers in one look, send it; pick others in the next, send it: both play, each on its own lasers', () => {
        const { engine, desk } = four()
        desk.editLook('ring', { cubes: ['cube-1', 'cube-2'] })
        expect(colours(engine)).toEqual([null, null, null, null]) // an edit sends nothing
        desk.go('ring')
        expect(colours(engine)).toEqual([RING, RING, null, null])
        desk.editLook('star', { cubes: ['cube-3', 'cube-4'] })
        desk.go('star')
        expect(colours(engine)).toEqual([RING, RING, STAR, STAR])
        expect(desk.state().liveBy).toMatchObject({ 'cube-1': { id: 'ring' }, 'cube-2': { id: 'ring' }, 'cube-3': { id: 'star' }, 'cube-4': { id: 'star' } })
        // A laser dropped from a playing look, with no look on all: dark, not its last picture held.
        desk.editLook('star', { cubes: ['cube-3'] })
        expect(colours(engine)).toEqual([RING, RING, STAR, null])
    })

    it('a look on All still takes every laser; one with picked Cubes then plays over it there, the rest keep it', () => {
        const { engine, desk } = four()
        desk.go('wave')
        desk.editLook('ring', { cubes: ['cube-2'] })
        desk.go('ring')
        expect(colours(engine)).toEqual([WAVE, RING, WAVE, WAVE])
        desk.go('wave')
        expect(colours(engine)).toEqual([WAVE, WAVE, WAVE, WAVE])
    })

    it('changing the Cubes of a look that plays moves it: onto the lasers picked, off the ones dropped', () => {
        const { engine, desk } = four()
        desk.go('wave')
        desk.editLook('ring', { cubes: ['cube-1'] })
        desk.go('ring')
        expect(colours(engine)).toEqual([RING, WAVE, WAVE, WAVE])
        desk.editLook('ring', { cubes: ['cube-1', 'cube-3'] })
        expect(colours(engine)).toEqual([RING, WAVE, RING, WAVE])
        // Dropped: laser 1 goes back to the look on all.
        desk.editLook('ring', { cubes: ['cube-3'] })
        expect(colours(engine)).toEqual([WAVE, WAVE, RING, WAVE])
        // All: the look on every laser.
        desk.editLook('ring', { cubes: 'all' })
        expect(colours(engine)).toEqual([RING, RING, RING, RING])
        expect(desk.state()).toMatchObject({ liveId: 'ring', liveBy: {} })
    })

    it('the look on all, given Cubes while it plays, goes dark on the lasers it drops and takes back one just picked', () => {
        const { engine, desk } = four()
        desk.go('wave')
        desk.go('star', ['cube-4'])
        expect(colours(engine)).toEqual([WAVE, WAVE, WAVE, STAR])
        desk.editLook('wave', { cubes: ['cube-1', 'cube-2'] })
        expect(colours(engine)).toEqual([WAVE, WAVE, null, STAR])
        desk.editLook('wave', { cubes: ['cube-1', 'cube-2', 'cube-4'] })
        expect(colours(engine)).toEqual([WAVE, WAVE, null, WAVE])
    })

    it('an edit that leaves the Cubes alone moves nothing; an undo of a Cubes change moves the look back', () => {
        const { engine, desk, t } = four()
        desk.go('wave')
        desk.editLook('ring', { cubes: ['cube-1'] })
        desk.go('ring')
        desk.editLook('ring', { size: 0.4 })
        expect(colours(engine)).toEqual([RING, WAVE, WAVE, WAVE])
        t.now += 60_000
        desk.editLook('ring', { cubes: ['cube-1', 'cube-2'] })
        expect(colours(engine)).toEqual([RING, RING, WAVE, WAVE])
        desk.undo()
        expect(colours(engine)).toEqual([RING, WAVE, WAVE, WAVE])
        // The look on all, one laser picked by mistake, undone: on all again.
        t.now += 60_000
        desk.go('wave')
        desk.editLook('wave', { cubes: ['cube-1'] })
        expect(colours(engine)).toEqual([WAVE, null, null, null])
        desk.undo()
        expect(colours(engine)).toEqual([WAVE, WAVE, WAVE, WAVE])
    })

    it('Cubes naming no laser on this desk play the look on all, drawn only where it picks, as before', () => {
        const { engine, desk } = four()
        desk.editLook('ring', { cubes: ['cube-9'] })
        expect(desk.go('ring')).toMatchObject({ ok: true, live: 'ring' })
        expect(colours(engine)).toEqual([null, null, null, null])
    })
})

describe('layers (2026-11-07, the owner: "adding + and opening same pattern copy and alll the paraamamtres"; then "copy on other lasers": each laser draws ONE)', () => {
    const g = require('./laserGuards')
    const { applyZone, normaliseZone } = require('./laserEngine')
    const { flattenLaserPaths } = require('../../../shared/laserFrame.cjs')
    const plan = g.pathPlan(g.DEFAULT_GUARDS, 35000)
    const full = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
    const at = (look, beat = 2) => lookPointsAt(normaliseLook(look), { t: beat * 500, clock: clock(120, 0) })
    const litOf = (points) => points.filter(isLit)
    const mid = (ps) => ps.reduce((s, p) => s + p[1], 0) / ps.length

    it('none unless added; at most three, each a look of its own with every setting in range and its own lasers, no name, id or layers', () => {
        expect(LOOK_DEFAULTS.layers).toEqual([])
        expect(normaliseLook({ name: 'old' }).layers).toEqual([])
        const look = normaliseLook({ shape: 'circle', layers: [{ shape: 'star', size: 9, height: -0.5, name: 'x', id: 'y', cubes: ['cube-1'], layers: [{ shape: 'line' }] }, 7, null, {}, {}, {}] })
        expect(look.layers).toHaveLength(3)
        expect(look.layers[0]).toMatchObject({ shape: 'star', size: 1, height: -0.5 })
        for (const k of ['id', 'name', 'layers']) expect(look.layers[0]).not.toHaveProperty(k)
        expect(look.layers[0].cubes).toEqual(['cube-1'])
        expect(Object.keys(look.layers[1]).sort()).toEqual(Object.keys(LOOK_DEFAULTS).filter((k) => !['name', 'layers'].includes(k)).sort())
        // A layer with no lasers (a copy just made, or one saved before layers had lasers) is on NO laser, never 'all'.
        expect(look.layers[1].cubes).toEqual([])
        expect(normaliseLook({ layers: [{ shape: 'star', cubes: 'all' }] }).layers[0].cubes).toBe('all')
    })
    it('on a laser, ONE picture: the last layer that picks it, else the pattern itself; never two in its signal', () => {
        const base = { shape: 'circle', size: 0.3, height: 0.4, x: 0, points: 600 }
        const copy = { ...base, height: -0.5, cubes: ['cube-2'] }
        const look = normaliseLook({ ...base, layers: [copy] })
        const on = (cubeId) => litOf(lookPointsAt(look, { t: 1000, clock: clock(120, 0), cubeId }))
        const own = on('cube-1')
        const theCopy = on('cube-2')
        expect(own.length).toBe(litOf(at(base)).length)
        expect(own.every((p) => p[1] > 0)).toBe(true)
        expect(theCopy.length).toBe(litOf(at(copy)).length)
        expect(theCopy.every((p) => p[1] < 0)).toBe(true)
        // The last layer wins where two pick the same laser.
        const three = normaliseLook({ ...base, layers: [copy, { ...base, shape: 'star', cubes: ['cube-2'] }] })
        expect(litOf(lookPointsAt(three, { t: 1000, clock: clock(120, 0), cubeId: 'cube-2' }))).toEqual(litOf(at({ ...base, shape: 'star' })))
        // The Preview (no laser) still shows every layer together.
        const preview = litOf(lookPointsAt(look, { t: 1000, clock: clock(120, 0) }))
        expect(preview.some((p) => p[1] > 0) && preview.some((p) => p[1] < 0)).toBe(true)
    })
    it('a copy of the pattern at another height plays in the same frame, each with its own settings', () => {
        const base = { shape: 'circle', size: 0.3, height: 0.4, x: 0, points: 600 }
        const copy = { ...base, height: -0.5 }
        const two = litOf(at({ ...base, layers: [copy] }))
        const up = two.filter((p) => p[1] > 0)
        const down = two.filter((p) => p[1] < 0)
        expect(mid(up)).toBeCloseTo(mid(litOf(at(base))), 2)
        expect(mid(down)).toBeCloseTo(mid(litOf(at(copy))), 2)
        // A layer is a look of its own: another shape, colour and size.
        const other = litOf(at({ ...base, layers: [{ ...base, shape: 'star', colour: '#ff2030', size: 0.6, height: -0.4 }] }))
        expect(other.some((p) => p[2] > 0.9 && p[3] < 0.2)).toBe(true) // the red star
        const own = litOf(at(base))[0]
        expect(other.some((p) => p[2] === own[2] && p[3] === own[3] && p[4] === own[4])).toBe(true) // the look's own colour
        expect(at({ ...base, layers: [copy] }).layersDrawn).toBe(1)
        expect(at(base).layersDrawn).toBeUndefined()
    })
    it('a layer with no room in the laser\'s pass is left out, and the ones after it; never past the real cube\'s 2333', () => {
        const busy = { shape: 'phyllotaxis', size: 1, height: 0.2, x: 0, points: 1992, copies: 4 }
        const points = at({ ...busy, layers: [{ ...busy, height: -0.6 }, { ...busy, shape: 'circle', points: 200 }] }, 5)
        expect(points.layersDrawn).toBe(0)
        expect(points.filter(isLit)).toEqual(at(busy, 5).filter(isLit))
    })
    it('every seed look with a copy of itself as a layer at another height fits the real cube\'s pass (2333 at 35 kpps)', () => {
        for (const seed of SEED_LOOKS) {
            for (const size of [0.5, 1]) {
                const look = { ...seed, size, height: 0.4, x: 0 }
                for (let beat = 0; beat < 8; beat += 1) {
                    const raw = at({ ...look, layers: [{ ...look, height: -0.4 }] }, beat)
                    if (!raw.some(isLit)) continue
                    const frame = g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, full).points, plan).points
                    expect(frame.length, `${seed.id} ${size} beat ${beat}`).toBeLessThanOrEqual(2333)
                }
            }
        }
    })
    it('the desk keeps a look\'s layers: a copy on no laser changes no signal; given lasers, it plays there alone; saved in desk.json', () => {
        const engine = fakeEngine(['cube-1', 'cube-2', 'cube-3'])
        const { desk, dir } = deskWith(engine)
        const ring = desk.state().looks.find((l) => l.id === 'ring')
        expect(desk.editLook('ring', { height: 0.5, cubes: ['cube-1'] }).ok).toBe(true)
        desk.go('ring')
        const lit = (c) => (engine.frames().byCube[c] || []).filter(isLit)
        const one = lit('cube-1')
        expect(one.length).toBeGreaterThan(0)
        expect(lit('cube-2')).toEqual([])
        // + : the copy is on no laser yet, so cube-1's signal is exactly what it was.
        const { id, name, layers, cubes, ...settings } = ring
        expect(desk.editLook('ring', { layers: [{ ...settings, height: -0.5, cubes: [] }] }).ok).toBe(true)
        expect(lit('cube-1')).toEqual(one)
        expect(lit('cube-2')).toEqual([])
        // Picking cube-2 for the copy: the playing look moves onto it, and each laser draws one picture.
        const now = desk.state().looks.find((l) => l.id === 'ring')
        expect(desk.editLook('ring', { layers: [{ ...now.layers[0], cubes: ['cube-2'] }] }).ok).toBe(true)
        expect(lit('cube-1').length).toBe(one.length)
        expect(lit('cube-1').every((p) => p[1] > 0)).toBe(true)
        expect(lit('cube-2').length).toBe(one.length)
        expect(lit('cube-2').every((p) => p[1] < 0)).toBe(true)
        expect(lit('cube-3')).toEqual([])
        expect(desk.saveBank().ok).toBe(true)
        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'desk.json'), 'utf8'))
        expect((saved.looks || saved.savedLooks).find((l) => l.layers && l.layers.length)).toBeTruthy()
    })
})

describe('LFO on the sliders (2026-11-07, the owner: "add lfo paramatre for laser desk")', () => {
    const { lfoValueAt, lfoWave, lookBox, LFO_FIELDS, LFO_SIZE_LEAST } = require('../../../shared/laserLook.cjs')
    const g = require('./laserGuards')
    const { applyZone, normaliseZone, stillBeams, dotsAllowed } = require('./laserEngine')
    const { DOT_SHAPES } = require('../../../shared/laserShapes.cjs')
    const { flattenLaserPaths } = require('../../../shared/laserFrame.cjs')
    const width = (points) => {
        const xs = points.filter(isLit).map((p) => p[0])
        return xs.length ? Math.max(...xs) - Math.min(...xs) : 0
    }
    const at = (look, beat, ctx = {}) => lookPointsAt(look, { t: beat * 500, clock: clock(120, 0), ...ctx })
    it('keeps an LFO only on an amount or a place, every setting in range; none by default', () => {
        expect(normaliseLook({}).lfo).toEqual({})
        const look = normaliseLook({ lfo: { size: { wave: 'saw', beats: 999, depth: 3 }, rotation: { wave: 'nope', beats: 0, depth: -1, on: 'false' }, speed: { depth: 1 }, spin: {}, strobe: {}, pulseBeats: {}, evil: {} } })
        expect(look.lfo).toEqual({
            size: { on: true, wave: 'saw', beats: 64, depth: 1 },
            rotation: { on: false, wave: 'sine', beats: 0.25, depth: 0 }
        })
        expect(normaliseLook({ lfo: [1, 2] }).lfo).toEqual({})
        expect(Object.keys(LFO_FIELDS)).toEqual(['size', 'height', 'x', 'rotation', 'level', 'pulse', 'sweep', 'displace', 'wobble', 'split', 'splitFar', 'flicker'])
    })
    it('an amount is at its slider on beat one and goes down by Depth; a place swings round its slider', () => {
        const sine = { on: true, wave: 'sine', beats: 4, depth: 0.5 }
        expect(lfoValueAt('level', 0.8, sine, 0)).toBeCloseTo(0.8)
        expect(lfoValueAt('level', 0.8, sine, 2)).toBeCloseTo(0.4)
        expect(lfoValueAt('level', 0.8, sine, 4)).toBeCloseTo(0.8)
        expect(lfoValueAt('height', 0, sine, 0)).toBeCloseTo(0.5)
        expect(lfoValueAt('height', 0, sine, 2)).toBeCloseTo(-0.5)
        expect(lfoValueAt('height', 0.8, { ...sine, depth: 1 }, 0)).toBe(1) // never off the field
        // Saw at 100 % turns Rotation round once a round, with no jump: -1/2 and +1/2 a turn are the same picture.
        const saw = { on: true, wave: 'saw', beats: 4, depth: 1 }
        expect([0, 1, 2, 3].map((b) => lfoValueAt('rotation', 0, saw, b))).toEqual([0.5, 0.25, 0, -0.25])
        expect(lfoValueAt('rotation', 0, saw, 3.999)).toBeCloseTo(-0.5, 2)
        // Off, or at Depth 0, the slider stays where it is; a rate has no LFO.
        expect(lfoValueAt('level', 0.8, { ...sine, on: false }, 2)).toBe(0.8)
        expect(lfoValueAt('level', 0.8, { ...sine, depth: 0 }, 2)).toBe(0.8)
        expect(lfoValueAt('speed', 2, sine, 2)).toBe(2)
    })
    it('waves: Tri, Square, Saw at their tops on beat one; Random a new place each round, the same within one', () => {
        expect([0, 1, 2, 3].map((b) => lfoWave('tri', b, 4))).toEqual([1, 0.5, 0, 0.5])
        expect([0, 1, 2, 3].map((b) => lfoWave('square', b, 4))).toEqual([1, 1, 0, 0])
        expect([0, 1, 2, 3].map((b) => lfoWave('saw', b, 4))).toEqual([1, 0.75, 0.5, 0.25])
        const r = [0, 0.5, 0.9, 1, 1.5, 2].map((b) => lfoWave('random', b, 1, 3))
        expect(r[0]).toBe(r[1])
        expect(r[1]).toBe(r[2])
        expect(r[3]).toBe(r[4])
        expect(new Set(r).size).toBeGreaterThan(1)
        for (const v of r) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
    })
    it('a Size LFO never takes the picture under LFO_SIZE_LEAST, where it would be a still beam', () => {
        const full = { on: true, wave: 'sine', beats: 4, depth: 1 }
        expect(lfoValueAt('size', 0.8, full, 2)).toBe(LFO_SIZE_LEAST)
        expect(lfoValueAt('size', 0.1, full, 2)).toBe(0.1) // a slider already under it stays put, never jumps up
        expect(lfoValueAt('size', 0.8, { ...full, depth: 0.5 }, 2)).toBeCloseTo(0.4)
    })
    it('the picture moves with it, the Chase delay included; a look without an LFO is drawn as before', () => {
        const look = normaliseLook({ shape: 'circle', size: 0.8, height: 0, pulse: 0, lfo: { size: { wave: 'sine', beats: 4, depth: 0.5 } } })
        expect(width(at(look, 0))).toBeCloseTo(1.6, 1)
        expect(width(at(look, 2))).toBeCloseTo(0.8, 1)
        const chased = { ...look, phase: 2 }
        expect(width(at(chased, 2, { index: 1 }))).toBeCloseTo(1.6, 1)
        const plain = normaliseLook({ shape: 'star', size: 0.6, height: 0, spin: 0.25, pulse: 0.3 })
        const { lfo: _lfo, ...old } = plain
        expect(at(plain, 1.3)).toEqual(at(old, 1.3))
        expect(at({ ...plain, lfo: { size: { on: false, wave: 'sine', beats: 4, depth: 1 } } }, 1.3)).toEqual(at(old, 1.3))
    })
    it('the frame on a tile holds the swing of an Across or Height LFO', () => {
        const look = normaliseLook({ shape: 'circle', size: 0.2, height: 0, x: 0 })
        const [x0, x1, y0, y1] = lookBox({ ...look, lfo: { x: { on: true, wave: 'sine', beats: 4, depth: 0.5 } } })
        expect(x0).toBeCloseTo(-0.74)
        expect(x1).toBeCloseTo(0.74)
        expect(y0).toBeCloseTo(-0.24)
        expect(y1).toBeCloseTo(0.24)
        expect(lookBox({ ...look, lfo: { size: { on: true, wave: 'sine', beats: 4, depth: 1 } } })).toEqual(lookBox(look))
    })
    it('every seed look with a Size LFO in full, at its smallest, fits the real cube and is never still', () => {
        const plan = g.pathPlan(g.DEFAULT_GUARDS, 35000)
        const zone = normaliseZone({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        for (const seed of SEED_LOOKS) {
            const look = normaliseLook({ ...seed, size: 1, height: 0, x: 0, lfo: { size: { wave: 'sine', beats: 4, depth: 1 } } })
            for (const beat of [1.75, 2, 2.25, 10]) { // 2 and 10: Size at LFO_SIZE_LEAST
                const raw = at(look, beat)
                if (!raw.some(isLit)) continue
                const frame = g.optimisePath(applyZone(flattenLaserPaths(raw, { budget: null }).points, zone).points, plan).points
                expect(frame.length, `${seed.id} beat ${beat}`).toBeLessThanOrEqual(2333)
                const still = stillBeams(frame)
                if (DOT_SHAPES.includes(look.shape.split(',')[0])) expect(!still.length || dotsAllowed(still), `${seed.id} beat ${beat}`).toBe(true)
                else expect(still, `${seed.id} beat ${beat}`).toEqual([])
            }
        }
    })
    it('the desk keeps a look\'s LFOs: on the laser at once and moving there, a layer\'s its own, undone, saved in desk.json', () => {
        const engine = fakeEngine(['cube-1'])
        const { desk, dir, t } = deskWith(engine)
        desk.go('ring')
        const lfo = { size: { on: true, wave: 'square', beats: 2, depth: 0.5 } }
        expect(desk.editLook('ring', { lfo }).ok).toBe(true)
        const ring = desk.state().looks.find((l) => l.id === 'ring')
        expect(ring.lfo).toEqual(lfo)
        const widths = []
        for (let k = 0; k < 4; k += 1) { desk.tick(); widths.push(width(engine.frames().byCube['cube-1'])); t.now += 500 }
        expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.5)
        expect(desk.editLook('ring', { layers: [{ ...ring, height: -0.5, lfo: { x: { on: true, wave: 'sine', beats: 4, depth: 0.2 } } }] }).ok).toBe(true)
        const both = desk.state().looks.find((l) => l.id === 'ring')
        expect(Object.keys(both.lfo)).toEqual(['size'])
        expect(Object.keys(both.layers[0].lfo)).toEqual(['x'])
        expect(desk.undo().ok).toBe(true)
        expect(desk.state().looks.find((l) => l.id === 'ring').layers).toEqual([])
        expect(desk.saveBank().ok).toBe(true)
        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'desk.json'), 'utf8'))
        expect((saved.looks || saved.savedLooks).some((l) => l.lfo && l.lfo.size && l.lfo.size.wave === 'square')).toBe(true)
    })
})
