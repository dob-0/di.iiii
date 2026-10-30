// Fix round for #1233 (review D1–D4, D6, E2 desk half): each test fails on the PR head before this change.
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLaserDesk, OUT } from './laserDesk.js'

const fakeEngine = (over = {}) => {
    const e = { calls: [], blackouts: 0, cubeState: { id: 'cube-1', armed: true, stop: null }, sim: false }
    e.state = () => ({ zone: null, sim: e.sim, cubes: [e.cubeState] })
    e.setFrame = (id, points, out, opts) => { e.calls.push({ op: 'frame', id, lit: points.filter((p) => p[2] || p[3] || p[4]).length, opts }); return { ok: true } }
    e.alive = () => { e.calls.push({ op: 'alive' }); return { ok: true } }
    e.arm = (a) => { e.calls.push({ op: 'arm', ...a }); return { ok: true } }
    e.dark = (on) => { e.calls.push({ op: 'dark', on }); return { ok: true } }
    e.blackout = () => { e.blackouts += 1; e.calls.push({ op: 'blackout' }); return { ok: true } }
    e.frames = () => ({ armed: true, sim: e.sim, all: null, byCube: {}, cubes: ['cube-1'], stopped: {}, blackouts: e.blackouts })
    return Object.assign(e, over)
}
// Temp dirs are removed after each test; the option names are the desk's own (setInterval / clearInterval), so no real timer runs (R8).
const dirs = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lfr-')); dirs.push(d); return d }
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
const make = (engine, extra = {}) => createLaserDesk({ getEngine: () => engine, dataDir: tmp(), now: () => 1000, setInterval: () => 1, clearInterval: () => {}, ...extra })
const frames = (e) => e.calls.filter((c) => c.op === 'frame')

describe('D1 goSeq', () => {
    it('the first frame after Go carries go:true, once', () => {
        const e = fakeEngine(); const d = make(e)
        d.go(d.state().looks[0].id)
        d.tick(); d.tick()
        const f = frames(e)
        expect(f[0].opts).toEqual({ go: true })
        expect(f.slice(1).every((c) => c.opts?.go === false)).toBe(true)
    })
    it('lifting a blackout is a Go; a blackout itself is not', () => {
        const e = fakeEngine(); const d = make(e)
        d.go(d.state().looks[0].id); d.tick(); e.calls.length = 0
        d.setBlackout(true); d.setBlackout(false); d.tick()
        expect(frames(e).some((c) => c.opts?.go === true)).toBe(true)
    })
})
describe('E2 desk half: Release switches the cubes off, never resumes', () => {
    it('Release sends dark then arm off for each cube it drew on', () => {
        const e = fakeEngine(); const d = make(e)
        d.go(d.state().looks[0].id); e.calls.length = 0
        d.release()
        expect(e.calls.filter((c) => c.op === 'arm')).toEqual([{ op: 'arm', armed: false, cube: 'cube-1', out: OUT }])
        expect(e.calls.some((c) => c.op === 'arm' && c.armed === true)).toBe(false)
    })
})
describe('D2 readout from the engine', () => {
    it('a stopped or disarmed cube is not "driving"', () => {
        const e = fakeEngine(); const d = make(e)
        d.go(d.state().looks[0].id)
        expect(d.state().cubes[0].driving).toBe(true)
        e.cubeState = { id: 'cube-1', armed: true, stop: { reason: 'still-beam' } }
        expect(d.state().cubes[0]).toMatchObject({ driving: false, dark: true })
        e.cubeState = { id: 'cube-1', armed: false, stop: null }
        expect(d.state().cubes[0]).toMatchObject({ driving: false, dark: true })
    })
})
describe('D3 Blackout keeps the arm (setting, default off)', () => {
    it('default: Blackout reaches the engine; with the setting it does not, and it survives a reload', () => {
        const dir = tmp()
        const e = fakeEngine(); const d = make(e, { dataDir: dir })
        expect(d.state().blackoutKeepsArm).toBe(false)
        d.setBlackout(true); expect(e.blackouts).toBe(1)
        expect(d.setBlackoutKeepsArm('yes')).toMatchObject({ ok: false })
        d.setBlackoutKeepsArm(true); d.close()
        const e2 = fakeEngine(); const d2 = make(e2, { dataDir: dir })
        expect(d2.state().blackoutKeepsArm).toBe(true)
        d2.setBlackout(true)
        expect(e2.blackouts).toBe(0)
        expect(d2.state().blackout).toBe(true)
    })
})
describe('D4 / D6 page', () => {
    const src = fs.readFileSync(new URL('./ui/desk.js', 'file://' + __dirname + '/'), 'utf8')
    it('the 400 ms gap applies to Shift+B only', () => { expect(src).toMatch(/e\.shiftKey && t - blackoutKeyAt < BLACKOUT_GAP_MS/) })
    it('a stopped cube shows "stopped: press Go" with a Go route', () => { expect(src).toMatch(/Stopped · press Go/); expect(src).toMatch(/desk\/api\/go/) })
})
