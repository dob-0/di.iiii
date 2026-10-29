// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerLaserRoutes } = require('./laserRoutes.js')
const { ARM_PHRASE } = require('../laser/laserEngine.js')

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
})

const envBefore = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL }
const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
  for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})

const boot = async (extra = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-laser-'))
  const app = express()
  const lane = registerLaserRoutes(app, { dataDir: dir, log: null, ...extra })
  const { server, base } = await listen(app)
  cleanups.push(() => new Promise((r) => { lane.close(); server.close(r); fs.rmSync(dir, { recursive: true, force: true }) }))
  return { base, lane }
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('the lasers at /laser', () => {
  it('is dormant until asked, then answers DISARMED with six sim cubes', async () => {
    delete process.env.NODE_ENV
    const { base, lane } = await boot()
    expect(lane.hasEngine()).toBe(false)
    const state = await (await fetch(`${base}/laser/api/state`)).json()
    expect(state).toMatchObject({ armed: false, sim: true, zone: { yMin: 0 } })
    expect(state.cubes).toHaveLength(6)
    // The guards' limits are said, and said to be unvalidated; a sim cube has no info.
    expect(state.guard).toMatchObject({ frameTimeoutMs: 200, stillWindowDeg: 0.6, stillHoldMs: 200, validated: false })
    expect(state.cubes[0]).toMatchObject({ id: 'cube-1', info: null, rate: null, stop: null })
  })

  it('keeps a frame alive on /alive, and says when there is none to keep', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    expect(await (await post(`${base}/laser/api/alive`, { cube: 'all' })).json()).toMatchObject({ ok: true, kept: false })
    await post(`${base}/laser/api/frame`, { cube: 'cube-2', points: [[0, 0.5, 0, 1, 0]] })
    expect(await (await post(`${base}/laser/api/alive`, { cube: 'cube-2' })).json()).toMatchObject({ ok: true, kept: true })
    expect((await post(`${base}/laser/api/alive`, { cube: 'cube-9' })).status).toBe(400)
    expect((await (await fetch(`${base}/laser/api/frames`)).json()).stopped).toEqual({})
  })

  it('keeps a frame (the zone applied) and gives it back for the room, and blackout drops it', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const res = await post(`${base}/laser/api/frame`, { cube: 'all', points: [[0, 0.5, 0, 1, 0], [0, -0.5, 1, 1, 1]] })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, armed: false, blanked: 1 })
    expect((await (await fetch(`${base}/laser/api/frames`)).json()).all).toEqual([[0, 0.5, 0, 1, 0], [0, 0, 0, 0, 0]])
    await post(`${base}/laser/api/blackout`, {})
    expect((await (await fetch(`${base}/laser/api/frames`)).json()).all).toBe(null)
  })

  it('the desk Blackout takes a true or false only, and lifting it is same-machine only (review 1218 M1)', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const url = `${base}/laser/desk/api/blackout`
    expect((await post(url, {})).status).toBe(400)
    expect((await post(url, { on: 'false' })).status).toBe(400)
    expect(await (await post(url, { on: true })).json()).toMatchObject({ ok: true, blackout: true })
    // a second dark press stays dark; an empty post does not lift it
    expect(await (await post(url, { on: true })).json()).toMatchObject({ blackout: true })
    await post(url, {})
    expect((await (await fetch(`${base}/laser/desk/api/state`)).json()).blackout).toBe(true)
    // a peer that is not this machine (it came through a proxy): refused to lift
    const viaProxy = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ on: false }) })
    expect(viaProxy.status).toBe(403)
    expect((await (await fetch(`${base}/laser/desk/api/state`)).json()).blackout).toBe(true)
    expect(await (await post(url, { on: false })).json()).toMatchObject({ ok: true, blackout: false })
  })

  it('refuses to arm without the sign-off phrase (403), and arms with it', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    expect((await post(`${base}/laser/api/arm`, { armed: true })).status).toBe(403)
    expect((await (await fetch(`${base}/laser/api/state`)).json()).armed).toBe(false)
    const ok = await post(`${base}/laser/api/arm`, { armed: true, confirm: ARM_PHRASE })
    expect(ok.status).toBe(200)
    expect((await (await fetch(`${base}/laser/api/state`)).json()).armed).toBe(true)
  })

  it('is not there at all on a hosted server (404)', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DI_LOCAL
    const { base } = await boot()
    expect((await fetch(`${base}/laser/api/state`)).status).toBe(404)
  })

  it('plays a project\'s laser lines on the cubes by show time, says so in /state, and stops', async () => {
    delete process.env.NODE_ENV
    const line = (id) => ({ id, type: 'spotLight', components: { beam: { laser: { mW: [1], nm: [525], frames: { period: 10, list: [[[0.1, 0.5, 1, 1, 1]], [[0.2, 0.5, 1, 1, 1]]] } } } } })
    const docs = { show: { entities: [line('rig-laser-1a'), line('rig-laser-1b'), line('rig-laser-2a')] }, empty: { entities: [] } }
    const { base } = await boot({ loadDocument: async (id) => docs[id] || null })
    expect((await post(`${base}/laser/api/show`, {})).status).toBe(400)
    expect((await post(`${base}/laser/api/show`, { project: 'nope' })).status).toBe(404)
    expect((await post(`${base}/laser/api/show`, { project: 'empty' })).status).toBe(400)
    const started = await post(`${base}/laser/api/show`, { project: 'show' })
    expect(started.status).toBe(200)
    expect(await started.json()).toMatchObject({ ok: true, project: 'show', show: { playing: true, cubes: [{ cube: 'cube-1', group: 'rig-laser-1', lines: 2 }, { cube: 'cube-2', group: 'rig-laser-2', lines: 1 }] } })
    const state = await (await fetch(`${base}/laser/api/state`)).json()
    expect(state.show).toMatchObject({ playing: true, project: 'show', out: 'show:show', groups: ['rig-laser-1', 'rig-laser-2'] })
    expect(state.cubes[0].lastFrameAt).toBeGreaterThan(0)
    // The frame it keeps is the room's: both lines of cube 1 joined with blank moves, the zone applied.
    const frames = await (await fetch(`${base}/laser/api/frames`)).json()
    const kept = frames.byCube?.['cube-1'] || frames.cubes?.find?.((c) => c.id === 'cube-1')
    expect((JSON.stringify(kept).match(/,0\.5,1,1,1\]/g) || []).length).toBe(2) // the two lines' lit points
    expect((JSON.stringify(kept).match(/,0\.5,0,0,0\]/g) || []).length).toBe(4) // each with its blank move and blank end
    // A Nodes editor Out on the same cube is refused: the show holds it.
    expect(await (await post(`${base}/laser/api/frame`, { cube: 'cube-1', points: [[0, 0.5, 1, 1, 1]], out: 'out-9' })).json()).toMatchObject({ ok: false })
    expect(await (await post(`${base}/laser/api/show/stop`, {})).json()).toMatchObject({ ok: true, stopped: true, show: { playing: false } })
    expect((await (await fetch(`${base}/laser/api/state`)).json()).show).toEqual({ playing: false })
  })

  it('approves the show\'s still beams per cube only with the sign-off phrase, writes them and reloads disarmed', async () => {
    delete process.env.NODE_ENV
    const aim = (yawDeg) => [-Math.PI / 2, 0, (yawDeg * Math.PI) / 180]
    const line = (id, yawDeg, list) => ({ id, type: 'spotLight', components: { transform: { rotation: aim(yawDeg) }, beam: { laser: { mW: [1], nm: [525], frames: { period: 10, list } } } } })
    const doc = { entities: [line('rig-laser-1a', -2, [[[0, 0.5, 1, 1, 1]]]), line('rig-laser-1b', 2, [[[0, 0.5, 1, 1, 1]]]), line('rig-laser-2a', 0, [[[0, 0.5, 1, 0, 0]], [[0.5, 0.5, 1, 0, 0]]])] }
    const { base } = await boot({ loadDocument: async (id) => (id === 'show' ? doc : null) })
    const refused = await post(`${base}/laser/api/show/still`, { project: 'show' })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ ok: false, needsPhrase: true, wouldApprove: { 'cube-1': 2, 'cube-2': 2 } })
    expect((await post(`${base}/laser/api/show/still`, { project: 'nope', confirm: ARM_PHRASE })).status).toBe(404)
    const ok = await post(`${base}/laser/api/show/still`, { project: 'show', confirm: ARM_PHRASE })
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(body).toMatchObject({ ok: true, approved: { 'cube-1': 2, 'cube-2': 2 }, total: { 'cube-1': 2, 'cube-2': 2, 'cube-3': 0 }, disarmed: true })
    expect(JSON.parse(fs.readFileSync(body.file, 'utf8')).cubes.find((c) => c.id === 'cube-1').stillBeams).toHaveLength(2)
    // Approved again (the same show): nothing doubles. The engine knows them.
    expect(await (await post(`${base}/laser/api/show/still`, { project: 'show', confirm: ARM_PHRASE })).json()).toMatchObject({ total: { 'cube-1': 2, 'cube-2': 2 } })
    expect((await (await fetch(`${base}/laser/api/state`)).json()).cubes[0]).toMatchObject({ id: 'cube-1', stillBeams: 2 })
  })

  it('answers 501 for the show when this server cannot read projects', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    expect((await post(`${base}/laser/api/show`, { project: 'x' })).status).toBe(501)
  })

  // The desk page's tiles play the looks with lib/laser.js (2026-10-29): it must draw what the desk sends the cubes.
  it('serves the desk\'s drawing code to the page as one script, drawing every seed look as the server does', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const res = await fetch(`${base}/laser/lib/laser.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    const window = {}
    vm.runInNewContext(await res.text(), { window })
    const { lookPointsAt, SEED_LOOKS } = require('../laser/laserDesk.js')
    const clock = { bpm: 128, zero: 0 }
    for (const look of SEED_LOOKS) {
      for (const t of [0, 777, 5432]) expect(window.DiLaser.lookPointsAt(look, { t, clock }), `${look.id} at ${t}`).toEqual(lookPointsAt(look, { t, clock }))
    }
    expect(window.DiLaser.LASER_SHAPES).toEqual(require('../../../shared/laserShapes.cjs').LASER_SHAPES)
    expect(window.DiLaser.lookBox(SEED_LOOKS[0])).toHaveLength(4)
  })
})
