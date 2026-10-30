// @vitest-environment node
// Review E5 (2026-10-30): laser-play.mjs sends the laser token, so its frames pass the route's gate.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { laserPoster, laserToken } from './laser-play.mjs'

const require = createRequire(import.meta.url)
const routesFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../serverXR/src/routes/laserRoutes.js')
const express = createRequire(routesFile)('express')
const { registerLaserRoutes } = require(routesFile)
const cleanups = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

describe('laser-play.mjs and the laser token', () => {
  it('a frame posted by the script is 403 without the token and 200 with the token read from the data folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-play-'))
    const app = express()
    const lane = registerLaserRoutes(app, { dataDir: dir, log: null })
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
    cleanups.push(async () => { await lane.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }) })
    const laser = `http://127.0.0.1:${server.address().port}/laser/api`
    const body = { cube: 'all', points: [[0, 0, 0, 0, 0]] }
    expect((await laserPoster(laser, '')('frame', body)).status).toBe(403)
    const token = laserToken(null, { DATA_ROOT: dir })
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect((await laserPoster(laser, token)('frame', body)).status).toBe(200)
  })
})
