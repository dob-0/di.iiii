// @vitest-environment node
// The desk's live pictures (laserLive.js, 2026-11-07, the owner: "can we do without any restart cuz i want live work with
// u and its will be impossible in performance time"): a changed shared/laserShapes.cjs or laserLook.cjs reaches a running
// desk only after its trial, and a change that fails it never draws.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createLiveCode, checkSources, SHAPES_FILE, LOOK_FILE } = require('./laserLive')
const { createLaserDesk, normaliseLook } = require('./laserDesk')
const FRAME_FILE = path.join(path.dirname(SHAPES_FILE), 'laserFrame.cjs')

const dirs = []
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }) })
// A copy of the three shared files, so a test can change them while a live code watches.
const copyOfShared = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-live-'))
    dirs.push(dir)
    for (const f of [SHAPES_FILE, LOOK_FILE, FRAME_FILE]) fs.copyFileSync(f, path.join(dir, path.basename(f)))
    return { dir, shapesFile: path.join(dir, 'laserShapes.cjs'), lookFile: path.join(dir, 'laserLook.cjs') }
}
const crlf = (s) => s.includes('\r\n')
const nl = (s) => (crlf(s) ? '\r\n' : '\n')
// The shapes file with one more shape, `name`, drawn by `body` (a builder's source).
const withShape = (text, name, body) => {
    const e = nl(text)
    const list = `    'phyllochaos',${e}`
    const builder = `    phyllochaos: (n, {`
    if (!text.includes(list) || !text.includes(builder)) throw new Error('the shapes file has moved: update withShape')
    return text.replace(list, `${list}    '${name}',${e}`).replace(builder, `    ${name}: ${body},${e}${builder}`)
}
const RING = '(n) => [Array.from({ length: n }, (_, i) => [Math.cos((i / (n - 1)) * 6.2832) * 0.5, Math.sin((i / (n - 1)) * 6.2832) * 0.5])]'
const write = (file, text) => {
    fs.writeFileSync(file, text)
    // A second write in the same millisecond keeps the mtime: move it on, so the change is seen as one.
    const t = new Date(Date.now() + 5000 + Math.random() * 1000)
    fs.utimesSync(file, t, t)
}
// The trial on this thread (the worker runs the same checkSources), so a test can await it.
const onThread = (data) => checkSources(data)
const live = (files, more = {}) => {
    const t = { now: 1000 }
    const code = createLiveCode({ ...files, now: () => t.now, runCheck: onThread, ...more })
    const step = async (looks = []) => { t.now += 1500; await code.check(looks) }
    return { code, step, t }
}

describe('the desk\'s live pictures (laserLive.js)', () => {
    it('a new shape goes in on the next look at the files, and draws', async () => {
        const files = copyOfShared()
        const { code, step } = live(files)
        expect(code.version()).toBe(0)
        expect(code.shapes().LASER_SHAPES).not.toContain('testring')
        write(files.shapesFile, withShape(fs.readFileSync(files.shapesFile, 'utf8'), 'testring', RING))
        await step()
        expect(code.status().error).toBeNull()
        expect(code.version()).toBe(1)
        expect(code.shapes().LASER_SHAPES).toContain('testring')
        const pts = code.shapes().generateShape({ shape: 'testring', size: 1, height: 0, points: 100 })
        expect(pts).toHaveLength(100)
        // The look drawing is the new one too: it draws the new shape.
        const look = normaliseLook({ shape: 'testring', size: 1, height: 0, points: 100 })
        expect(code.look().lookPointsAt(look, { t: 0, clock: { bpm: 120, zero: 0 } }).filter((p) => p[2] + p[3] + p[4] > 0).length).toBeGreaterThan(50)
        expect(code.sources().shapes).toContain('testring')
    })
    it('a change that does not load is kept out, the running pictures stay, and it is not tried again until it changes', async () => {
        const files = copyOfShared()
        let trials = 0
        const { code, step } = live(files, { runCheck: (d) => { trials += 1; return checkSources(d) } })
        const good = fs.readFileSync(files.shapesFile, 'utf8')
        write(files.shapesFile, `${good}\n}}}`)
        await step()
        expect(code.version()).toBe(0)
        expect(code.status().error).toMatch(/does not load/)
        expect(code.shapes().generateShape({ shape: 'circle', size: 0.5, points: 50 })).toHaveLength(50)
        await step()
        expect(trials).toBe(1)
        write(files.shapesFile, withShape(good, 'testring', RING))
        await step()
        expect(trials).toBe(2)
        expect(code.version()).toBe(1)
        expect(code.status().error).toBeNull()
    })
    it('keeps out a change that removes a shape, throws, leaves the field or is more than one pass of the cube', async () => {
        const good = fs.readFileSync(SHAPES_FILE, 'utf8')
        const look = fs.readFileSync(LOOK_FILE, 'utf8')
        const old = require('../../../shared/laserShapes.cjs').LASER_SHAPES
        const tryIt = (shapesSource) => checkSources({ shapesSource, lookSource: look, oldShapes: old, oldSources: { shapes: good, look } })
        expect(tryIt(good)).toMatchObject({ ok: true })
        expect(tryIt(good.replace("    'crossgrid',", '')).error).toMatch(/would be gone: crossgrid/)
        expect(tryIt(withShape(good, 'testring', '(n) => { throw new Error("oops") }')).error).toMatch(/testring .* throws: oops/)
        expect(tryIt(withShape(good, 'testring', '(n) => [[[NaN, 0], [0, 0.5]]]')).error).toMatch(/testring .*not a number/)
        // 200 long lines in one picture: far more than the cube can draw in one pass.
        expect(tryIt(withShape(good, 'testring', '(n) => Array.from({ length: 200 }, (_, j) => [[-0.9, j / 220 - 0.45], [0.9, j / 220 - 0.45]])')).error).toMatch(/more than the cube's 2333/)
    })
    it('a picture that is over the pass today but drawn the same is not the change\'s doing', () => {
        const good = fs.readFileSync(SHAPES_FILE, 'utf8')
        const look = fs.readFileSync(LOOK_FILE, 'utf8')
        // pendulum at 1992 points and size 0.5 is over 2333 at beat 0 (measured 2338): without the running code to compare
        // with, the trial refuses it; with it, the unchanged picture passes.
        expect(checkSources({ shapesSource: good, lookSource: look }).error).toMatch(/pendulum/)
        expect(checkSources({ shapesSource: good, lookSource: look, oldSources: { shapes: good, look } }).ok).toBe(true)
    })
    it('a change that comes in while the last one is on trial is the one that counts', async () => {
        const files = copyOfShared()
        const good = fs.readFileSync(files.shapesFile, 'utf8')
        const pending = []
        const { code, t } = live(files, { runCheck: (d) => new Promise((resolve) => pending.push(() => resolve(checkSources(d)))) })
        write(files.shapesFile, withShape(good, 'testring', RING))
        t.now += 1500
        const first = code.check([])
        write(files.shapesFile, withShape(good, 'testring2', RING))
        t.now += 1500
        code.check([])
        expect(pending).toHaveLength(1)
        pending.shift()()
        await first
        // The first trial's text is no longer on disk: dropped, and the newer text went on trial straight after it.
        expect(code.version()).toBe(0)
        expect(pending).toHaveLength(1)
        pending.shift()()
        await code.check([])
        expect(code.version()).toBe(1)
        expect(code.shapes().LASER_SHAPES).toContain('testring2')
        expect(code.shapes().LASER_SHAPES).not.toContain('testring')
    })
    it('the trial runs on a worker thread (laserLiveCheck.js) and gives the same answer', async () => {
        const files = copyOfShared()
        const { code, step } = live(files, { runCheck: undefined })
        write(files.shapesFile, withShape(fs.readFileSync(files.shapesFile, 'utf8'), 'testring', RING))
        await step()
        expect(code.status().error).toBeNull()
        expect(code.shapes().LASER_SHAPES).toContain('testring')
    }, 60000)
})

describe('the desk with live pictures', () => {
    const fakeEngine = (ids = ['cube-1']) => {
        const calls = []
        return {
            calls,
            state: () => ({ zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: ids.map((id) => ({ id, name: id, path: null, info: null })) }),
            setFrame: (cube, points, out) => { calls.push({ cube, points, out }); return { ok: true } },
            alive: () => ({ ok: true }),
            frames: () => ({ armed: false, sim: true, all: null, byCube: Object.fromEntries(calls.map((c) => [c.cube, c.points])), cubes: ids, stopped: {} })
        }
    }
    const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-live-desk-')); dirs.push(d); return d }
    const lit = (pts) => pts.filter((p) => p[2] + p[3] + p[4] > 0).length

    it('a look whose drawing throws is drawn blank (never stops the tick), and the desk goes back to the pictures before', () => {
        const real = require('../../../shared/laserLook.cjs')
        let broken = true
        let reverted = 0
        const code = {
            shapes: () => require('../../../shared/laserShapes.cjs'),
            look: () => (broken ? { lookPointsAt: () => { throw new Error('boom') } } : real),
            check: () => null,
            status: () => ({ version: 1, error: null }),
            revert: () => { reverted += 1; if (reverted > 1) return false; broken = false; return true }
        }
        const engine = fakeEngine()
        const desk = createLaserDesk({ dataDir: tmpDir(), getEngine: () => engine, now: () => 1000, setInterval: () => 1, clearInterval: () => {}, log: null, code })
        const id = desk.state().looks[0].id
        expect(desk.go(id).ok).toBe(true)
        // The first draw threw, the desk went back and drew with the pictures before.
        expect(reverted).toBe(1)
        expect(lit(engine.calls.at(-1).points)).toBeGreaterThan(0)
        // Broken with nothing to go back to: a blank, and the tick goes on.
        broken = true
        expect(() => desk.tick()).not.toThrow()
        expect(lit(engine.calls.at(-1).points)).toBe(0)
    })
    it('the state carries the live pictures\' shapes and status', () => {
        const engine = fakeEngine()
        const desk = createLaserDesk({ dataDir: tmpDir(), getEngine: () => engine, now: () => 1000, setInterval: () => 1, clearInterval: () => {}, log: null })
        const s = desk.state()
        expect(s.shapes).toContain('phyllochaos')
        expect(s.code).toMatchObject({ error: null })
        expect(typeof s.code.version).toBe('number')
    })
})
