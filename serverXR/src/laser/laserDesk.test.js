// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

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
        const css = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'ui', 'desk.css'), 'utf8')
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
