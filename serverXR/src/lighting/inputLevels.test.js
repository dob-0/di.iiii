// @vitest-environment node
// The desk's input levels as a reader outside the desk sees them (the Nodes editor's DMX In):
// the pure read on the merger, then the route on a real offline desk.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { InputMerger, inputLevels, LOSS_MS } = require('./dmxin.js')

const frameOf = (pairs) => { const d = new Uint8Array(512); for (const [ch, v] of pairs) d[ch - 1] = v; return d }
const pkt = (data, extra = {}) => ({ protocol: 'sacn', universe: 0, key: 'sacn:cid-a', name: 'console', ip: '127.0.0.1', priority: 100, sequence: 1, data, terminated: false, preview: false, ...extra })

describe('inputLevels', () => {
  it('says off, not-listened and waiting before anything arrives', () => {
    expect(inputLevels(new InputMerger({}), 0, 0).state).toBe('off')
    const m = new InputMerger({ enabled: true, universes: [{ universe: 0 }] })
    expect(inputLevels(m, 3, 0)).toMatchObject({ state: 'not-listened', levels: null })
    expect(inputLevels(m, 0, 0)).toMatchObject({ state: 'waiting', levels: null })
  })

  it('answers the 512 levels of a live universe', () => {
    const m = new InputMerger({ enabled: true, universes: [{ universe: 0 }] })
    m.feed(pkt(frameOf([[1, 255], [12, 128]])), 1000)
    const r = inputLevels(m, 0, 1010)
    expect(r.state).toBe('live')
    expect(r.levels.length).toBe(512)
    expect(r.levels[0]).toBe(255)
    expect(r.levels[11]).toBe(128)
    expect(r.ageMs).toBe(10)
  })

  it('on loss: "lost" without levels under release, the last frame "held" under hold', () => {
    const release = new InputMerger({ enabled: true, universes: [{ universe: 0 }], loss: 'release' })
    release.feed(pkt(frameOf([[1, 200]])), 0)
    inputLevels(release, 0, 10)
    expect(inputLevels(release, 0, LOSS_MS.sacn + 100)).toMatchObject({ state: 'lost', levels: null })
    const hold = new InputMerger({ enabled: true, universes: [{ universe: 0 }], loss: 'hold' })
    hold.feed(pkt(frameOf([[1, 200]])), 0)
    inputLevels(hold, 0, 10)
    const held = inputLevels(hold, 0, LOSS_MS.sacn + 100)
    expect(held.state).toBe('held')
    expect(held.levels[0]).toBe(200)
  })
})

describe('GET /light/api/input/levels on a real (offline) desk', () => {
  const cleanups = []
  afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

  it('reads what the input heard, and never switches the input on', async () => {
    delete process.env.NODE_ENV
    const express = require('express')
    const { registerLightingRoutes } = require('../routes/lightingRoutes.js')
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
