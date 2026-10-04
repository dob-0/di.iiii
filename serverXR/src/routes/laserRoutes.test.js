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

const boot = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-laser-'))
  const app = express()
  const lane = registerLaserRoutes(app, { dataDir: dir, log: null })
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
})
