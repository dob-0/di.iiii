// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
    expect(JSON.stringify(kept)).toMatch(/0\.[12],0\.5,1,1,1\],\[0\.[12],0\.5,0,0,0\],\[0\.[12],0\.5,0,0,0\],\[0\.[12],0\.5,1,1,1/)
    // A Nodes editor Out on the same cube is refused: the show holds it.
    expect(await (await post(`${base}/laser/api/frame`, { cube: 'cube-1', points: [[0, 0.5, 1, 1, 1]], out: 'out-9' })).json()).toMatchObject({ ok: false })
    expect(await (await post(`${base}/laser/api/show/stop`, {})).json()).toMatchObject({ ok: true, stopped: true, show: { playing: false } })
    expect((await (await fetch(`${base}/laser/api/state`)).json()).show).toEqual({ playing: false })
  })

  it('answers 501 for the show when this server cannot read projects', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    expect((await post(`${base}/laser/api/show`, { project: 'x' })).status).toBe(501)
  })
})
