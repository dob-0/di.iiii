// @vitest-environment node
//
// The desk caches the looks as JSON text and splices them into GET /api/state (desk.js looksJson), and a page that
// sends ?looksRev=<the one it holds> gets the reply without looks while they are unchanged. These tests hold the
// cache to the truth: after every path that changes a look, the cached reply, parsed, equals a fresh stringify.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createDesk } = require('./desk.js')
const { makeBigLooks } = require('./tests/bigLooks.js')

let desk, server, base, dir
const call = async (method, route, body) => {
  const r = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  return { status: r.status, text, body: JSON.parse(text) }
}
const GET = (r) => call('GET', r)
const POST = (r, b) => call('POST', r, b || {})
const look = (id, v = 1) => ({ id, name: id, kind: 'all', fixtures: [], steps: [{ values: { a: { dimmer: v } } }] })
// The truth: what the desk really holds, stringified fresh, parsed.
const truth = () => JSON.parse(JSON.stringify(desk.state.looks))
const expectCacheIsTruth = async (why) => {
  const s = await GET('/api/state')
  expect(s.body.looks, why).toEqual(truth())
  expect(s.body.looksRev, why).toEqual(expect.any(Number))
  return s.body.looksRev
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'looks-cache-'))
  desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} })
  server = http.createServer((req, res) => desk.handle(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = 'http://127.0.0.1:' + server.address().port
})
afterAll(async () => {
  desk.close()
  server.closeAllConnections?.()
  await new Promise((r) => server.close(r))
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the cached looks JSON is always the real looks', () => {
  it('starts empty', async () => { await expectCacheIsTruth('empty') })

  it('replace-all (POST /api/looks)', async () => {
    await POST('/api/looks', { looks: [look('a'), look('b'), look('c')] })
    await expectCacheIsTruth('replace-all')
  })
  it('upsert adds (POST /api/looks/add)', async () => {
    await POST('/api/looks/add', { look: look('d') })
    await expectCacheIsTruth('add')
  })
  it('upsert replaces in place of the same id (new object, same length)', async () => {
    const before = await expectCacheIsTruth('before replace')
    await POST('/api/looks/add', { look: look('b', 99) })
    const after = await expectCacheIsTruth('replace')
    expect(after).not.toBe(before)
    expect(truth().find((l) => l.id === 'b').steps[0].values.a.dimmer).toBe(99)
  })
  it('capture (POST /api/looks/capture) after patching a light', async () => {
    await POST('/api/fixtures/add', { profile: 'dimmer', count: 1 })
    const r = await POST('/api/looks/capture', { id: 'cap', name: 'Cap' })
    expect(r.status).toBe(200)
    await expectCacheIsTruth('capture')
  })
  it('remove (POST /api/looks/remove)', async () => {
    await POST('/api/looks/remove', { id: 'a' })
    await expectCacheIsTruth('remove')
    expect(truth().some((l) => l.id === 'a')).toBe(false)
  })
  it('a fader move (save) leaves the cache and the rev alone', async () => {
    const before = await expectCacheIsTruth('before fader')
    await POST('/api/master', { value: 0.5 })
    expect(await expectCacheIsTruth('after fader')).toBe(before)
  })
  it('layer + fire change layers, not looks: rev unchanged, looks still true', async () => {
    const before = await expectCacheIsTruth('before fire')
    await POST('/api/looks/fire', { id: 'b' })
    expect(await expectCacheIsTruth('after fire')).toBe(before)
  })
  it('an element swapped for a new object is seen', async () => {
    const before = await expectCacheIsTruth('before swap')
    desk.state.looks[0] = { ...desk.state.looks[0], name: 'swapped' }
    const after = await expectCacheIsTruth('swap')
    expect(after).not.toBe(before)
  })
  it('an edit in place is seen once looksEdited() is called (and only then: that is the contract)', async () => {
    const before = await expectCacheIsTruth('before in-place')
    desk.state.looks[0].name = 'edited in place'
    expect((await GET('/api/state')).body.looksRev).toBe(before)
    desk.looksEdited()
    const after = await expectCacheIsTruth('in-place')
    expect(after).not.toBe(before)
  })
  it('a reordered list (new array) is seen', async () => {
    const before = await expectCacheIsTruth('before reorder')
    desk.state.looks = desk.state.looks.slice().reverse()
    const after = await expectCacheIsTruth('reorder')
    expect(after).not.toBe(before)
  })
  it('show import, replace mode, loads other looks', async () => {
    const exp = await GET('/api/show/export')
    const doc = exp.body
    doc.show.looks = [look('imp1'), look('imp2')]
    const r = await POST('/api/show/import', { mode: 'replace', show: doc })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    await expectCacheIsTruth('import')
    expect(truth().map((l) => l.id)).toEqual(['imp1', 'imp2'])
  })
  it('snapshot restore brings the earlier looks back', async () => {
    await POST('/api/looks', { looks: [look('snap1'), look('snap2')] })
    const saved = await POST('/api/snapshots', { name: 'looks test' })
    const id = saved.body.snapshot.id
    await POST('/api/looks', { looks: [look('other')] })
    await expectCacheIsTruth('before restore')
    const r = await POST('/api/snapshots/restore', { id })
    expect(r.status, r.text.slice(0, 200)).toBe(200)
    await expectCacheIsTruth('restore')
    expect(truth().map((l) => l.id)).toEqual(['snap1', 'snap2'])
  })
})

describe('GET /api/state?looksRev=N', () => {
  it('current rev: looks left out, looksRev kept, reply small', async () => {
    await POST('/api/looks', { looks: makeBigLooks(3, { steps: 8, fixtures: 20 }) })
    const full = await GET('/api/state')
    const skip = await GET('/api/state?looksRev=' + full.body.looksRev)
    expect('looks' in skip.body).toBe(false)
    expect(skip.body.looksRev).toBe(full.body.looksRev)
    expect(skip.text.length).toBeLessThan(full.text.length / 2)
    const { looks, ...rest } = full.body
    const { ...skipRest } = skip.body
    expect(Object.keys(skipRest).sort()).toEqual(Object.keys(rest).sort())
  })
  it('without the parameter the reply is the full state, looks included', async () => {
    const full = await GET('/api/state')
    expect(full.body.looks).toEqual(truth())
  })
  it('a stale or junk rev gets the full looks', async () => {
    const cur = (await GET('/api/state')).body.looksRev
    for (const q of [cur - 1, 'x', '', 'NaN']) {
      const r = await GET('/api/state?looksRev=' + q)
      expect(r.body.looks, String(q)).toEqual(truth())
    }
  })
  it('after a looks change the old rev gets the full looks and a new rev', async () => {
    const old = (await GET('/api/state')).body.looksRev
    await POST('/api/looks/add', { look: look('fresh') })
    const r = await GET('/api/state?looksRev=' + old)
    expect(r.body.looks).toEqual(truth())
    expect(r.body.looksRev).not.toBe(old)
    const again = await GET('/api/state?looksRev=' + r.body.looksRev)
    expect('looks' in again.body).toBe(false)
  })
  it('works under a space prefix too (the page asks relative to space/<id>/)', async () => {
    const cur = (await GET('/api/state')).body.looksRev
    const r = await GET('/api/state?looksRev=' + cur)
    expect(r.status).toBe(200)
  })
})

describe('the numbers (80 looks of ~670 kB, Art-Net off)', () => {
  it('a reply with current looksRev is small and skips the stringify', async () => {
    const looks = makeBigLooks(80, { steps: 64, fixtures: 205 })
    for (const l of looks) expect((await POST('/api/looks/add', { look: l })).status).toBe(200)
    const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1]
    const time = async (q) => { const t = performance.now(); const r = await fetch(base + '/api/state' + q); await r.text(); return performance.now() - t }
    const rev = (await GET('/api/state?looksRev=0')).body.looksRev
    const full = []; for (let i = 0; i < 20; i++) full.push(await time(''))
    const skip = []; for (let i = 0; i < 20; i++) skip.push(await time('?looksRev=' + rev))
    console.log(`median full ${median(full).toFixed(1)} ms, median looksRev=current ${median(skip).toFixed(1)} ms`)
    expect(median(skip)).toBeLessThan(median(full))
    expect((await GET('/api/state?looksRev=' + rev)).text.length).toBeLessThan(200000)
  }, 120000)
})
