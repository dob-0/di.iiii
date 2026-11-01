// The scene link (2026-10-31, ledger N1587): a light scene puts the look that follows it live on the laser desk.
// Three layers: the pure first fill (sceneLink.js), the desk's follow (laserDesk.js followScene: the live look and nothing
// else), and the safety core through express with BOTH lanes joined as index.js joins them: only a recall that passes the
// laser's own Go guards (di's own page, or the local token) moves the laser; a chase restored on a restart moves nothing.
import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const express = require('express')
const { leadingKey, fillLinks, mayDrive, linkLightToLaser } = require('./sceneLink')
const { createLaserDesk } = require('./laserDesk')
const { registerLaserRoutes } = require('../routes/laserRoutes')
const { registerLightingRoutes } = require('../routes/lightingRoutes')

const dirs = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-link-')); dirs.push(d); return d }
const cleanups = []
const envBefore = { NODE_ENV: process.env.NODE_ENV }
afterEach(async () => {
    while (cleanups.length) await cleanups.pop()()
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true })
    for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})
const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0

const SCENES = [{ id: 'muth01', name: 'MUTH 01 Threshold' }, { id: 'muth05', name: 'MUTH 05 Catacomb' }, { id: 'muth09', name: 'MUTH 09 Lusabats' }]
const LOOKS = [
    { id: 'muth-01-threshold', name: 'MUTH 01 Threshold', shape: 'line' },
    { id: 'muth-05-catacomb', name: 'MUTH 05 Catacomb', shape: 'galaxy' },
    { id: 'muth-09-lusabats-dawn', name: 'MUTH 09 Lusabats (Dawn)', shape: 'grid' }
]
const deskFile = (dir, followLight, looks = LOOKS) => fs.writeFileSync(path.join(dir, 'desk.json'), JSON.stringify({ v: 1, bpm: 120, master: 0.8, followLight, looks }))

// An engine that records every arm and every frame with its go flag.
const fakeEngine = (ids = ['cube-1', 'cube-2']) => {
    const calls = []
    return {
        calls,
        dark: () => ({ ok: true }),
        blackout: () => ({ ok: true }),
        arm: (opts) => { calls.push({ kind: 'arm', opts }); return { ok: true } },
        state: () => ({ sim: true, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: ids.map((id) => ({ id, name: id, path: null, info: null })) }),
        setFrame: (cube, points, out, opts = {}) => { calls.push({ kind: 'frame', cube, points, out, go: opts.go === true }); return { ok: true } },
        alive: (cube, out) => { calls.push({ kind: 'alive', cube, out }); return { ok: true } },
        frames: () => ({ armed: false, sim: true, all: null, byCube: {}, cubes: ids, stopped: {}, blackouts: 0 })
    }
}
const deskWith = ({ followLight = true, looks = LOOKS, scenes = SCENES, dir = tmp() } = {}) => {
    if (!fs.existsSync(path.join(dir, 'desk.json'))) deskFile(dir, followLight, looks)
    const engine = fakeEngine()
    const desk = createLaserDesk({ dataDir: dir, getEngine: () => engine, now: () => 1000, setInterval: () => 1, clearInterval: () => {}, log: null, lightScenes: () => scenes })
    cleanups.push(() => desk.close())
    return { desk, engine, dir }
}
const page = (id) => ({ id, name: SCENES.find((s) => s.id === id)?.name ?? id, origin: 'page' })

describe('the first fill: a look follows the scene with its leading word and number', () => {
    it('reads the leading word and number, case and zeros aside', () => {
        expect(leadingKey('MUTH 05 Catacomb')).toBe('muth 5')
        expect(leadingKey('muth 5')).toBe('muth 5')
        expect(leadingKey('MUTH 09 Lusabats (Dawn)')).toBe('muth 9')
        expect(leadingKey('Galaxy')).toBe(null)
        expect(leadingKey('05 MUTH')).toBe(null)
    })
    it('links each unset look to its one scene: "MUTH 05" and "MUTH 09 Lusabats (Dawn)" <-> "MUTH 09 Lusabats"', () => {
        const looks = LOOKS.map((l) => ({ ...l, follows: null }))
        expect(fillLinks(looks, SCENES)).toEqual([
            { look: 'muth-01-threshold', scene: 'muth01' },
            { look: 'muth-05-catacomb', scene: 'muth05' },
            { look: 'muth-09-lusabats-dawn', scene: 'muth09' }
        ])
    })
    it('guesses nothing: two scenes with one key, a scene a person gave another look, a look set to none', () => {
        const looks = [
            { id: 'a', name: 'MUTH 05 Catacomb', follows: null },
            { id: 'b', name: 'MUTH 01 Copy', follows: null },
            { id: 'c', name: 'MUTH 01 Threshold', follows: 'muth01' },
            { id: 'd', name: 'MUTH 09 Lusabats', follows: '' }
        ]
        const scenes = [...SCENES, { id: 'muth05b', name: 'MUTH 05 Other' }]
        expect(fillLinks(looks, scenes)).toEqual([]) // a: ambiguous; b: muth01 is c's (manual wins); d: none, never refilled
    })
    it('only di\'s own page and the local token may drive the laser', () => {
        expect([mayDrive('page'), mayDrive('token'), mayDrive(null), mayDrive(undefined), mayDrive('lan'), mayDrive('')]).toEqual([true, true, false, false, false, false])
    })
})

describe('the desk follows a light scene: the live look and nothing else', () => {
    it('a scene puts its look live; the switch fills the links and saves them', () => {
        const { desk } = deskWith({ followLight: false })
        expect(desk.setFollowLight(true)).toMatchObject({ ok: true, followLight: true, filled: 3 })
        expect(desk.followScene(page('muth05'))).toMatchObject({ followed: true, look: 'muth-05-catacomb' })
        const st = desk.state()
        expect(st.liveId).toBe('muth-05-catacomb')
        expect(st.follow).toMatchObject({ on: true, last: { look: 'muth-05-catacomb', scene: { id: 'muth05' } } })
        expect(desk.followMap().links.muth05).toEqual({ look: 'muth-05-catacomb', name: 'MUTH 05 Catacomb' })
    })
    it('followMap: table is the same map whatever the switch says; links only while it is on (the Scenes row plays from table)', () => {
        const off = deskWith({ followLight: false }).desk.followMap()
        expect(off).toMatchObject({ ok: true, on: false, links: {} })
        expect(off.table.muth05).toEqual({ look: 'muth-05-catacomb', name: 'MUTH 05 Catacomb' })
        expect(Object.keys(off.table).sort()).toEqual(['muth01', 'muth05', 'muth09'])
        const on = deskWith({ followLight: true }).desk.followMap()
        expect(on.on).toBe(true)
        expect(on.links).toEqual(on.table)
        expect(on.table).toEqual(off.table)
    })
    it('no link, no change; switch off, no change; not a hand the lasers obey, no change', () => {
        const { desk, engine } = deskWith()
        expect(desk.followScene(page('muth77'))).toMatchObject({ followed: false, why: 'no look' })
        expect(desk.followScene({ ...page('muth05'), origin: null })).toMatchObject({ followed: false, why: 'origin' })
        expect(desk.state().liveId).toBe(null)
        const off = deskWith({ followLight: false })
        expect(off.desk.followScene(page('muth05'))).toMatchObject({ followed: false, why: 'off' })
        expect(off.desk.state().liveId).toBe(null)
        expect(engine.calls.concat(off.engine.calls).filter((c) => c.kind === 'frame')).toEqual([])
    })
    it('never arms, never a Go (also right after Release), never lifts a Blackout, never moves Master or BPM', () => {
        const { desk, engine } = deskWith()
        desk.go('muth-01-threshold') // a person's Go: its first frames carry go: true
        expect(engine.calls.some((c) => c.kind === 'frame' && c.go)).toBe(true)
        desk.release() // dark, and each cube the desk drew on switched off (as today); the link is NOT paused by it
        const before = engine.calls.length
        expect(desk.followScene(page('muth05'))).toMatchObject({ followed: true })
        desk.tick()
        const after = engine.calls.slice(before)
        expect(after.filter((c) => c.kind === 'arm')).toEqual([])
        expect(after.filter((c) => c.kind === 'frame').length).toBeGreaterThan(0)
        expect(after.filter((c) => c.kind === 'frame' && c.go)).toEqual([]) // the cleared record must not read as a new Go
        desk.setBlackout(true)
        const dark = engine.calls.length
        expect(desk.followScene(page('muth09'))).toMatchObject({ followed: true, look: 'muth-09-lusabats-dawn' })
        desk.tick()
        const st = desk.state()
        expect(st.blackout).toBe(true)
        expect(engine.calls.slice(dark).filter((c) => c.kind === 'frame' && c.points.some(isLit))).toEqual([])
        expect(engine.calls.slice(dark).filter((c) => c.kind === 'arm' || (c.kind === 'frame' && c.go))).toEqual([])
        expect([st.master, st.bpm]).toEqual([0.8, 120])
    })
    it('a person sets the link by hand: the scene moves to that look, "none" is never refilled, the bank is not changed', () => {
        const { desk, dir } = deskWith()
        desk.setFollowLight(true)
        expect(desk.setFollows('muth-01-threshold', 'muth05')).toMatchObject({ ok: true, follows: 'muth05', moved: ['muth-05-catacomb'] })
        expect(desk.followScene(page('muth05'))).toMatchObject({ look: 'muth-01-threshold' })
        expect(desk.followScene(page('muth01'))).toMatchObject({ followed: false, why: 'no look' })
        const st = desk.state()
        expect(st.looks.find((l) => l.id === 'muth-05-catacomb').follows).toBe('')
        expect(st.unsaved).toBeFalsy()
        expect(st.changed ?? []).toEqual([])
        desk.copyLook('muth-01-threshold')
        expect(desk.state().looks.filter((l) => l.follows === 'muth05').map((l) => l.id)).toEqual(['muth-01-threshold'])
        desk.close()
        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'desk.json'), 'utf8'))
        expect(saved.followLight).toBe(true)
        expect(saved.looks.find((l) => l.id === 'muth-01-threshold').follows).toBe('muth05')
        const again = deskWith({ dir })
        expect(again.desk.state().follow.on).toBe(true)
        expect(again.desk.followScene(page('muth05'))).toMatchObject({ look: 'muth-01-threshold' })
    })
})

// ---- The safety core: through express, both lanes, joined as index.js joins them.
const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })) })
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)) } return false }
const bootBoth = async (dir) => {
    delete process.env.NODE_ENV
    const app = express()
    let lasers = null
    const lighting = registerLightingRoutes(app, { dataDir: dir, offline: true, log: () => {}, sceneOrigin: (req) => lasers.originOf(req) })
    lasers = registerLaserRoutes(app, { dataDir: dir, log: null, lightScenes: () => lighting.scenes() })
    const origins = []
    const offSeen = lighting.onSceneRecall((s) => origins.push(s.origin))
    const unlink = linkLightToLaser({ lighting, lasers })
    const token = fs.readFileSync(path.join(dir, 'laser', '.token'), 'utf8').trim()
    const { server, base } = await listen(app)
    let closed = false
    const close = async () => { if (closed) return; closed = true; offSeen(); unlink(); await lasers.close(); await lighting.close?.(); await new Promise((r) => server.close(r)) }
    cleanups.push(close)
    const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const get = async (url) => (await fetch(base + url)).json()
    return { base, token, origins, close, post, get }
}
const linked = async () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, 'laser'), { recursive: true })
    deskFile(path.join(dir, 'laser'), true)
    const lane = await bootBoth(dir)
    const r = await lane.post('/light/api/scenes/replace', { scenes: SCENES.map((s) => ({ ...s, fixtures: [] })) })
    expect(r.status).toBe(200)
    return { dir, ...lane }
}
const liveOf = async (lane) => (await lane.get('/laser/desk/api/state')).liveId

describe('only a recall the lasers would obey moves the laser (the lead\'s rule)', () => {
    it('no Origin and no token: the light desk changes, the laser live look does not', async () => {
        const lane = await linked()
        expect((await lane.post('/light/api/scenes/recall', { id: 'muth05' })).status).toBe(200)
        expect((await lane.get('/light/api/state')).activeScene).toBe('muth05')
        expect(lane.origins).toEqual([null])
        expect(await liveOf(lane)).toBe(null)
    })
    it('di\'s own page (Origin = this address): the laser follows', async () => {
        const lane = await linked()
        expect((await lane.post('/light/api/scenes/recall', { id: 'muth05' }, { origin: lane.base })).status).toBe(200)
        expect(lane.origins).toEqual(['page'])
        expect(await liveOf(lane)).toBe('muth-05-catacomb')
    })
    it('the local token, no Origin: the laser follows; a wrong token or a foreign Origin: it does not', async () => {
        const lane = await linked()
        await lane.post('/light/api/scenes/recall', { id: 'muth01' }, { 'x-laser-token': 'x'.repeat(lane.token.length) })
        await lane.post('/light/api/scenes/recall', { id: 'muth01' }, { origin: 'http://evil.example' })
        expect(await liveOf(lane)).toBe(null)
        await lane.post('/light/api/scenes/recall', { id: 'muth09' }, { 'x-laser-token': lane.token })
        expect(lane.origins.slice(-1)).toEqual(['token'])
        expect(await liveOf(lane)).toBe('muth-09-lusabats-dawn')
    })
    it('a chase keeps the hand that started it; restored after a restart it has none and moves nothing', async () => {
        const lane = await linked()
        const r = await lane.post('/light/api/chase', { enabled: true, sceneIds: ['muth01', 'muth05'], holdMs: 60, sync: 'clock' }, { origin: lane.base })
        expect(r.status).toBe(200)
        expect(await until(async () => (await liveOf(lane)) !== null)).toBe(true)
        expect(lane.origins.length).toBeGreaterThan(0)
        expect(new Set(lane.origins)).toEqual(new Set(['page']))
        await new Promise((res) => setTimeout(res, 300))
        await lane.close()
        const next = await bootBoth(lane.dir)
        expect((await next.get('/light/api/state')).chase?.enabled).toBe(true)
        expect(await until(() => next.origins.length >= 2)).toBe(true)
        expect(new Set(next.origins)).toEqual(new Set([null]))
        expect(await liveOf(next)).toBe(null)
    })
})
