// @vitest-environment node
//
// Looks up to 320 steps and the optional linear blend (2026-11-27, "i want to see each pixel").
// Desks here are throwaway: their own temp folder, an ephemeral HTTP port, Art-Net OFF
// (offline:true). Nothing touches a running desk.
import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const { createDesk } = require('./desk')
const { MAX_STEPS, sanitizeLook, stepBlend, evalLook } = require('./looks')
const { makeLook, makeHeavyLook, engineFor, frame, rig } = require('./lookSteps.fixture')
const golden = require('./lookSteps.golden.json')

const open = []
async function deskOn(dir) {
  const desk = createDesk({ dataDir: dir, offline: true, log: () => {} })
  const server = http.createServer((q, r) => desk.handle(q, r))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const call = (method, p, body) => new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const q = http.request({ host: '127.0.0.1', port: server.address().port, path: p, method,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
    (r) => { let d = ''; r.on('data', (c) => { d += c }); r.on('end', () => { try { res({ status: r.statusCode, body: JSON.parse(d) }) } catch (e) { rej(e) } }) })
    q.on('error', rej)
    q.end(data)
  })
  const h = { desk, post: (p, b) => call('POST', p, b || {}), get: (p) => call('GET', p), stop: () => { desk.close(); server.close() } }
  open.push(h)
  return h
}
afterEach(() => { while (open.length) open.pop().stop() })
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'desk-steps-'))

describe('a look of 320 steps', () => {
  it('the cap is 320 and anything above is still cut there', () => {
    expect(MAX_STEPS).toBe(320)
    expect(sanitizeLook(makeLook(320)).steps).toHaveLength(320)
    expect(sanitizeLook({ ...makeLook(10), steps: Array.from({ length: 400 }, () => ({ values: { '*': { r: 1 } } })) }).steps).toHaveLength(320)
  })

  it('survives looks/add, a save, a load and a snapshot restore with all 320 steps', async () => {
    const dir = tmp()
    const look = makeHeavyLook(320, 33, { id: 'tunnel', blend: 'linear' })
    const body = JSON.stringify({ look })
    expect(body.length).toBeGreaterThan(300_000)

    const a = await deskOn(dir)
    const added = await a.post('/api/looks/add', { look })
    expect(added.status).toBe(200)
    expect(added.body.look.steps).toHaveLength(320)
    expect(added.body.look.blend).toBe('linear')
    expect((await a.get('/api/looks')).body.looks[0].steps).toHaveLength(320)

    // save, then a fresh desk on the same folder loads it
    a.desk.writeShow()
    a.stop(); open.splice(open.indexOf(a), 1)
    const b = await deskOn(dir)
    const loaded = (await b.get('/api/looks')).body.looks.find((l) => l.id === 'tunnel')
    expect(loaded.steps).toHaveLength(320)
    expect(loaded.steps[319]).toEqual(look.steps[319])
    expect(loaded.blend).toBe('linear')

    // snapshot, clear the library, restore the snapshot
    const snap = await b.post('/api/snapshots', { name: 'with tunnel' })
    expect(snap.body.ok).toBe(true)
    expect((await b.post('/api/looks/remove', { id: 'tunnel' })).status).toBe(200)
    expect((await b.get('/api/looks')).body.looks).toHaveLength(0)
    const back = await b.post('/api/snapshots/restore', { id: snap.body.snapshot.id })
    expect(back.status).toBe(200)
    const restored = (await b.get('/api/looks')).body.looks.find((l) => l.id === 'tunnel')
    expect(restored.steps).toHaveLength(320)
    expect(restored.blend).toBe('linear')
  }, 60000)

  it('the whole-library route (looks replace) takes one 320-step look too', async () => {
    const a = await deskOn(tmp())
    const r = await a.post('/api/looks', { looks: [makeLook(320, { id: 'big' })] })
    expect(r.status).toBe(200)
    expect((await a.get('/api/looks')).body.looks[0].steps).toHaveLength(320)
  }, 60000)
})

describe('a look without blend plays exactly as before', () => {
  it('matches the frames taken from origin/dev b02fb15e3 before the change', () => {
    const { engine, state } = engineFor(makeLook(12))
    golden.times.forEach((t, i) => {
      expect(frame(engine, state, t).slice(0, 33 * 4)).toEqual(golden.frames[i])
    })
    // the golden is not trivially flat: pixels differ from each other and over time
    expect(new Set(golden.frames[3]).size).toBeGreaterThan(8)
    expect(golden.frames[0]).not.toEqual(golden.frames[5])
  })

  it("'cosine' and no blend field are the same look", () => {
    const a = engineFor(makeLook(12)), b = engineFor(makeLook(12, { blend: 'cosine' }))
    expect(makeLook(12, { blend: 'cosine' }).blend).toBeUndefined()
    for (const t of golden.times) expect(frame(b.engine, b.state, t)).toEqual(frame(a.engine, a.state, t))
  })
})

describe("blend: 'linear'", () => {
  // Two steps, full transition, equal width, one fixture: position p in [0,1) of the loop.
  // Step 0 -> step 1 is the first half, so the quarter-of-a-step marks sit at p = 1/8, 2/8, 3/8 of the loop.
  const two = (blend) => sanitizeLook({
    id: 'two', name: 'two', measure: 1, blend,
    steps: [{ values: { '*': { r: 0 } }, width: 1, transition: 1 }, { values: { '*': { r: 200 } }, width: 1, transition: 1 }],
  })
  it('gives t = 0.25, 0.5, 0.75 at those fractions of a step (cosine does not)', () => {
    const lin = two('linear'), cos = two(undefined)
    for (const q of [0.25, 0.5, 0.75]) {
      expect(stepBlend(lin, q * 0.5).t).toBeCloseTo(q, 12)
    }
    expect(stepBlend(cos, 0.25 * 0.5).t).toBeCloseTo((1 - Math.cos(Math.PI / 4)) / 2, 12)
    expect(stepBlend(cos, 0.25 * 0.5).t).not.toBeCloseTo(0.25, 3)
  })

  it('the output is the exact linear mix of the two step values', () => {
    const f = rig(1)
    // measure 1 beat at 120 bpm = 500 ms loop; step 0 -> 1 runs over the first 250 ms
    for (const [ms, want] of [[62.5, 50], [125, 100], [187.5, 150]]) {
      const out = evalLook(two('linear'), f, ms, { bpm: 120 })
      expect(out.get('px0').r).toBe(want)
    }
    const cosOut = evalLook(two(undefined), f, 62.5, { bpm: 120 }).get('px0').r
    expect(cosOut).not.toBe(50)
  })

  it('a travelling pixel steps by equal amounts (no pulse) with linear', () => {
    const steps = Array.from({ length: 8 }, (_, i) => ({ values: { '*': { r: i * 30 } }, width: 1, transition: 1 }))
    const look = sanitizeLook({ id: 'ramp', name: 'ramp', measure: 8, blend: 'linear', steps: steps.slice(0, 8) })
    const f = rig(1)
    const seq = Array.from({ length: 8 * 4 }, (_, k) => evalLook(look, f, (k / 32) * 4000, { bpm: 120 }).get('px0').r)
    const d = seq.slice(1, 28).map((v, i) => v - seq[i])
    expect(Math.max(...d) - Math.min(...d)).toBeLessThanOrEqual(1)
  })
})

describe('what it costs (measured, printed)', () => {
  const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1]
  const perFrame = (steps) => {
    const { engine, state } = engineFor(makeHeavyLook(steps, 33, { blend: 'linear' }), 33)
    for (let i = 0; i < 20; i++) frame(engine, state, i * 25)
    const t = []
    for (let i = 0; i < 200; i++) { const a = performance.now(); engine.render(state, 1000 + i * 25); t.push(performance.now() - a) }
    return median(t)
  }
  it('64 vs 320 steps on 33 fixtures, median of 200 frames, and the JSON of one 320-step look', () => {
    const m64 = perFrame(64), m320 = perFrame(320)
    const json = JSON.stringify(makeHeavyLook(320)).length
    console.log(`MEASURED engine.render per frame, 33 fixtures, median of 200: 64 steps ${(m64 * 1000).toFixed(1)} us; 320 steps ${(m320 * 1000).toFixed(1)} us; JSON of one 320-step look ${json} bytes`)
    // a frame is 25 ms at 40 Hz: both must be a small part of it
    expect(m320).toBeLessThan(5)
  })
})
