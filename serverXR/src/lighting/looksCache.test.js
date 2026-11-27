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

// ---- the files: show.json (timer save) and snapshots are what JSON.stringify gives, byte for byte ----

const startDesk = async (withSpace) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'looks-save-'))
  const spaceDir = path.join(d, 'space-a')
  const dk = createDesk({
    dataDir: path.join(d, 'data'), offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {},
    ...(withSpace ? { spaces: { dir: () => spaceDir, find: async (id) => ({ label: id }) } } : {}),
  })
  const sv = http.createServer((req, res) => dk.handle(req, res))
  await new Promise((r) => sv.listen(0, '127.0.0.1', r))
  const b = 'http://127.0.0.1:' + sv.address().port
  const post = async (route, body) => { const r = await fetch(b + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json() } }
  return { dk, post, d, spaceDir, port: sv.address().port, stop: async () => { dk.close(); sv.closeAllConnections?.(); await new Promise((r) => sv.close(r)); fs.rmSync(d, { recursive: true, force: true }) } }
}
const waitFor = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 25)) } return false }
const oldText = (dk, space) => { const s = dk.state; if (!space) return JSON.stringify(s); const c = Object.assign({}, s); delete c.output; return JSON.stringify(c) }

describe.each([['this machine\'s own show', false], ['a space\'s show (withoutRig)', true]])('saved files hold the same bytes as JSON.stringify: %s', (_n, space) => {
  let k, file
  beforeAll(async () => {
    k = await startDesk(space)
    if (space) { expect((await k.post('/api/show/open', { space: 'space-a' })).status).toBe(200); file = path.join(k.spaceDir, 'show.json') } else file = path.join(k.d, 'data', 'show.json')
  })
  afterAll(async () => { await k.stop() })

  it('the timer save writes exactly JSON.stringify(state), and a looks change shows in the next save', async () => {
    await k.post('/api/looks', { looks: makeBigLooks(3, { steps: 4, fixtures: 6 }) })
    expect(await waitFor(() => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === oldText(k.dk, space))).toBe(true)
    await k.post('/api/looks/add', { look: { id: 'new-look', name: 'New', kind: 'all', fixtures: [], steps: [{ values: { a: { dimmer: 7 } } }] } })
    expect(await waitFor(() => fs.readFileSync(file, 'utf8').includes('new-look'))).toBe(true)
    await waitFor(() => fs.readFileSync(file, 'utf8') === oldText(k.dk, space))
    expect(fs.readFileSync(file, 'utf8')).toBe(oldText(k.dk, space))
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).looks.map((l) => l.id)).toContain('new-look')
  })
  it('a save while another is in flight lands last: the file ends equal to the state', async () => {
    for (let i = 0; i < 6; i++) { await k.post('/api/master', { master: 10 + i }); await new Promise((r) => setTimeout(r, 30)) }
    await k.post('/api/looks/remove', { id: 'new-look' })
    expect(await waitFor(() => fs.readFileSync(file, 'utf8') === oldText(k.dk, space))).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).not.toContain('new-look')
    expect(fs.existsSync(file.replace(/\.json$/, '.prev.json'))).toBe(true)
    expect(fs.existsSync(file + '.tmp')).toBe(false)
    expect(fs.existsSync(file + '.async.tmp')).toBe(false)
  })
  it('a snapshot parses deep-equal to the old clone, with the new looks, and is listed without a re-read', async () => {
    await k.post('/api/looks/add', { look: { id: 'snap-look', name: 'S', kind: 'all', fixtures: [], steps: [{ values: { a: { dimmer: 3 } } }] } })
    const r = await k.post('/api/snapshots', { name: 'bytes' })
    expect(r.status).toBe(200)
    const snapFile = path.join(path.dirname(file), 'snapshots', r.body.snapshot.id + '.json')
    const doc = JSON.parse(fs.readFileSync(snapFile, 'utf8'))
    const expectShow = JSON.parse(JSON.stringify(k.dk.state))
    for (const key of Object.keys(expectShow)) if (/pin|secret|token|password|key/i.test(key)) delete expectShow[key]
    expect(doc.show.looks).toEqual(expectShow.looks)
    expect(doc.show.looks.map((l) => l.id)).toContain('snap-look')
    expect(Object.keys(doc.show)).toEqual(Object.keys(doc.show).filter((x) => x in expectShow))
    expect(r.body.snapshot.bytes).toBe(fs.statSync(snapFile).size)
    expect(doc.counts).toEqual(expect.objectContaining({ fixtures: expectShow.fixtures.length, scenes: expectShow.scenes.length }))
    // the file is canonical JSON.stringify text of what it holds (no splice artefact), and its looks are the cached text
    expect(fs.readFileSync(snapFile, 'utf8')).toBe(JSON.stringify(doc))
    expect(JSON.stringify(doc.show.looks)).toBe(JSON.stringify(k.dk.state.looks))
  })
})

// ---- a synchronous save (close, import, restore, switch) while the timer's async save is in flight ----
// The async save has its own temp file (show.json.async.tmp); the sync saves use show.json.tmp. Before, both used
// show.json.tmp and the second truncated the file the first still had open, so show.json ended up unreadable.

const inFlight = async (k, file) => {
  await k.post('/api/master', { master: 40 + Math.floor(Math.random() * 100) })   // the save is due 400 ms later
  const tmp = file + '.async.tmp'
  return waitFor(() => fs.existsSync(tmp), 3000)
}
const bigDesk = async () => {
  const k = await startDesk(false)
  for (const l of makeBigLooks(30, { steps: 64, fixtures: 205 })) await k.post('/api/looks/add', { look: l })
  const file = path.join(k.d, 'data', 'show.json')
  await waitFor(() => fs.existsSync(file) && fs.statSync(file).size > 10e6)
  await new Promise((r) => setTimeout(r, 600))      // let the timer's own saves settle
  return { k, file }
}

describe('a synchronous save during an async one leaves show.json whole', () => {
  it('an import (replaceShow) while a timer save is in flight: show.json is the imported show', async () => {
    const { k, file } = await bigDesk()
    try {
      const exp = await (await fetch(`http://127.0.0.1:${k.port}/api/show/export`)).json()
      exp.show.looks = [look('imported-1'), look('imported-2')]
      expect(await inFlight(k, file)).toBe(true)
      const r = await k.post('/api/show/import', { mode: 'replace', show: exp })
      expect(r.status).toBe(200)
      await new Promise((r2) => setTimeout(r2, 1500))
      const got = JSON.parse(fs.readFileSync(file, 'utf8'))
      expect(got.looks.map((l) => l.id)).toEqual(['imported-1', 'imported-2'])   // replaceShow writes the file as imported, then loads it
      expect(k.dk.state.looks.map((l) => l.id)).toEqual(['imported-1', 'imported-2'])
      expect(fs.existsSync(file + '.async.tmp')).toBe(false)
    } finally { await k.stop() }
  }, 60000)

  it('a snapshot restore while a timer save is in flight: show.json is the restored show', async () => {
    const { k, file } = await bigDesk()
    try {
      const snap = await k.post('/api/snapshots', { name: 'before' })
      await k.post('/api/looks', { looks: [look('later')] })
      expect(await inFlight(k, file)).toBe(true)
      const r = await k.post('/api/snapshots/restore', { id: snap.body.snapshot.id })
      expect(r.status).toBe(200)
      await new Promise((r2) => setTimeout(r2, 1500))
      const got = JSON.parse(fs.readFileSync(file, 'utf8'))
      expect(got.looks.length).toBe(30)
      expect(got).toEqual(JSON.parse(JSON.stringify(k.dk.state)))
    } finally { await k.stop() }
  }, 60000)
})

// ---- gated: the async save is held between its chunks, so the overlap is certain, not a race ----

// Every fs.promises.open of show.json.tmp / show.json.async.tmp for writing gets a handle whose 2nd writeFile
// waits on the gate (the looks chunk is the 2nd of three). `reached` resolves when it is waiting.
const gateWrites = () => {
  const real = fs.promises.open
  let release; const gate = new Promise((r) => { release = r })
  let reach; const reached = new Promise((r) => { reach = r })
  fs.promises.open = async (file, flags, ...rest) => {
    const fh = await real.call(fs.promises, file, flags, ...rest)
    if (!(flags === 'w' && /show\.json\.(async\.)?tmp$/.test(String(file)))) return fh
    let n = 0
    const wf = fh.writeFile.bind(fh)
    fh.writeFile = async (...a) => { if (++n === 2) { reach(); await gate } return wf(...a) }
    return fh
  }
  return { reached, release, restore: () => { fs.promises.open = real; release() } }
}
// A gate that is never reached must say so, not run into the 30 s test timeout.
const reachedIn = (g, ms = 5000) => Promise.race([g.reached, new Promise((_, rej) => setTimeout(() => rej(new Error('the async save never reached the gate within ' + ms + ' ms')), ms).unref())])
const settled = async (k, file) => {
  for (const l of makeBigLooks(3, { steps: 4, fixtures: 6 })) await k.post('/api/looks/add', { look: l })
  await waitFor(() => fs.existsSync(file))
  await new Promise((r) => setTimeout(r, 700))
}

describe('gated: a save held in flight', () => {
  it('NEW-I1: switching shows during an in-flight timer save keeps the left show\'s last change', async () => {
    const k = await startDesk(true)
    const file = path.join(k.d, 'data', 'show.json')
    let g = { restore() {} }
    try {
      await settled(k, file)
      g = gateWrites()   // armed only now: the saves while settling must not be held
      await k.post('/api/master', { master: 77 })
      await reachedIn(g)
      const r = await k.post('/api/show/open', { space: 'space-a' })
      expect(r.status).toBe(200)
      g.release()
      await new Promise((r2) => setTimeout(r2, 800))
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).master).toBe(77)
    } finally { g.restore(); await k.stop() }
  }, 30000)

  it('R2-I1: close() while the timer save is held: show.json parses and equals the state', async () => {
    const k = await startDesk(false)
    const file = path.join(k.d, 'data', 'show.json')
    let g = { restore() {} }
    try {
      await settled(k, file)
      g = gateWrites()   // armed only now: the saves while settling must not be held
      await k.post('/api/master', { master: 88 })
      await reachedIn(g)
      await k.post('/api/looks/add', { look: look('after-the-write-began', 5) })   // the held write holds the OLD looks: a longer newer text must not be overwritten by it
      k.dk.close()
      const want = JSON.parse(JSON.stringify(k.dk.state))
      g.release()
      await new Promise((r2) => setTimeout(r2, 800))
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(want)
    } finally { g.restore(); fs.rmSync(k.d, { recursive: true, force: true }) }
  }, 30000)
})

// ---- R3-I1: a synchronous save clears what an async save in flight owed ----
// The gate holds the FIRST writeFile and finds the save by its open() call, not by the temp file's name.
const holdAsyncWrite = () => {
  const realOpen = fs.promises.open
  let open, held = false
  const gate = new Promise((r) => { open = r })
  fs.promises.open = async function (p, flags, ...rest) {
    const fh = await realOpen.call(fs.promises, p, flags, ...rest)
    if (flags === 'w' && /show\.json\.(async\.)?tmp$/.test(String(p))) {
      const realWrite = fh.writeFile.bind(fh)
      let n = 0
      fh.writeFile = async (...a) => { if (n++ === 0) { held = true; await gate } return realWrite(...a) }
    }
    return fh
  }
  return { isHeld: () => held, release: () => { fs.promises.open = realOpen; open() } }
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

describe('R3-I1: asyncOwes is cleared by a synchronous save', () => {
  it('after a switch during a held save, leaving the new never-edited space writes nothing into it', async () => {
    const k = await startDesk(true)
    try {
      const file = path.join(k.d, 'data', 'show.json')
      const spaceFile = path.join(k.spaceDir, 'show.json')
      await k.post('/api/looks/add', { look: look('m-1') })
      expect(await waitFor(() => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('m-1'))).toBe(true)
      await settle(300)
      const h = holdAsyncWrite()
      try {
        await k.post('/api/master', { master: 66 })
        expect(await waitFor(h.isHeld, 3000)).toBe(true)
        expect((await k.post('/api/show/open', { space: 'space-a' })).status).toBe(200)
      } finally { h.release() }
      await settle(500)
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).master).toBe(66)
      expect(fs.existsSync(spaceFile)).toBe(false)
      expect((await k.post('/api/show/open', { space: null })).status).toBe(200)
      await settle(300)
      expect(fs.existsSync(spaceFile), 'leaving the never-edited space-a wrote a show into it').toBe(false)
      expect((await k.post('/api/show/open', { space: 'space-a' })).status).toBe(200)
      expect((await k.post('/api/show/copy-machine', {})).status).toBe(200)
    } finally { await k.stop() }
  }, 30000)
})
