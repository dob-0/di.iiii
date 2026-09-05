// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerLightingRoutes } = require('./lightingRoutes.js')

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
})

const envBefore = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL, DI_ALLOW_LAN_DEVICES: process.env.DI_ALLOW_LAN_DEVICES }
const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
  for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})

const boot = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-light-'))
  const app = express()
  const lane = registerLightingRoutes(app, { dataDir: dir, offline: true, log: () => {} })
  // What index.js does after the lane: the JSON parser must not have eaten the body.
  app.use(express.json())
  const { server, base } = await listen(app)
  cleanups.push(() => new Promise((r) => { lane.close(); server.close(r); fs.rmSync(dir, { recursive: true, force: true }) }))
  return { base, lane, dir }
}

describe('the lighting desk at /light', () => {
  it('is dormant until asked, then answers with output OFF and an empty patch', async () => {
    delete process.env.NODE_ENV
    const { base, lane } = await boot()
    const res = await fetch(`${base}/light/api/summary`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fixtures).toBe(0)
    expect(body.output.enabled).toBe(false)
    expect(lane.getDesk().state.output.enabled).toBe(false)
  })

  it('serves its interface under the mount with relative addresses, and /light redirects to /light/', async () => {
    delete process.env.NODE_ENV
    const { base } = await boot()
    const bare = await fetch(`${base}/light`, { redirect: 'manual' })
    expect(bare.status).toBe(302)
    expect(bare.headers.get('location')).toBe('/light/')
    const page = await fetch(`${base}/light/`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('<script src="app.js">')
    expect(html).not.toContain('src="/app.js"')
    const css = await fetch(`${base}/light/style.css`)
    expect(css.status).toBe(200)
  })

  it('reads its own POST bodies past the parser and writes the show under dataDir/lighting', async () => {
    delete process.env.NODE_ENV
    const { base, dir, lane } = await boot()
    const res = await fetch(`${base}/light/api/master`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ master: 100 })
    })
    expect(res.status).toBe(200)
    const sum = await (await fetch(`${base}/light/api/summary`)).json()
    expect(sum.master).toBe(100)
    lane.getDesk().writeShow()
    const show = JSON.parse(fs.readFileSync(path.join(dir, 'lighting', 'show.json'), 'utf8'))
    expect(show.master).toBe(100)
    expect(show.output.enabled).toBe(false)
  })

  it('does not exist on a hosted server', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DI_LOCAL
    const { base } = await boot()
    const res = await fetch(`${base}/light/api/summary`)
    expect(res.status).toBe(404)
  })

  it('exists on a di up install even in production mode', async () => {
    process.env.NODE_ENV = 'production'
    process.env.DI_LOCAL = '1'
    const { base } = await boot()
    const res = await fetch(`${base}/light/api/summary`)
    expect(res.status).toBe(200)
  })
})
