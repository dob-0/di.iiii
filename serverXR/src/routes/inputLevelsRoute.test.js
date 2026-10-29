// @vitest-environment node
// GET /light/api/input/levels on a real offline desk: reads what the input heard, never switches it on.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

const frameOf = (pairs) => { const d = new Uint8Array(512); for (const [ch, v] of pairs) d[ch - 1] = v; return d }
const pkt = (data, extra = {}) => ({ protocol: 'sacn', universe: 0, key: 'sacn:cid-a', name: 'console', ip: '127.0.0.1', priority: 100, sequence: 1, data, terminated: false, preview: false, ...extra })

describe('GET /light/api/input/levels on a real (offline) desk', () => {
  const cleanups = []
  afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

  it('reads what the input heard, and never switches the input on', async () => {
    delete process.env.NODE_ENV
    const express = require('express')
    const { registerLightingRoutes } = require('./lightingRoutes.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-dmxin-levels-'))
    const app = express()
    const lane = registerLightingRoutes(app, { dataDir: dir, offline: true, log: () => {} })
    const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
    cleanups.push(() => new Promise((r) => { lane.close(); server.close(r); fs.rmSync(dir, { recursive: true, force: true }) }))
    const base = `http://127.0.0.1:${server.address().port}/light/api`
    const off = await (await fetch(`${base}/input/levels?universe=0`)).json()
    expect(off).toMatchObject({ universe: 0, state: 'off', levels: null })
    expect(lane.getDesk().input.merger.config.enabled).toBe(false)
    // Switch input on for U1 (desk universe 0) as Setup → Input would, then a console's frame arrives.
    lane.getDesk().input.merger.setConfig({ enabled: true, universes: [{ universe: 0 }] })
    lane.getDesk().input.merger.feed(pkt(frameOf([[5, 64]])), Date.now())
    const live = await (await fetch(`${base}/input/levels?universe=0`)).json()
    expect(live.state).toBe('live')
    expect(live.levels[4]).toBe(64)
  })
})

