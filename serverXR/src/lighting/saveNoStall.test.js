// @vitest-environment node
//
// The save after a fire or a look edit must not re-serialise the looks that did not change (at 42 MB of looks that was
// a 0.4 s stall of the DMX loop on every pad press / edit), and the file it writes must be the same bytes as ever:
// JSON.stringify(state). desk.js keeps one JSON text per look OBJECT (a WeakMap); looksEdited() drops them all.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createDesk } = require('./desk.js')
const { makeBigLooks } = require('./tests/bigLooks.js')

let desk, server, base, dir, file
const post = async (route, body) => {
  const r = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  await r.text()
  return r.status
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// The save is on a 400 ms timer and then asynchronous: wait until the file on disk is what the desk would write now.
const settled = async (why) => {
  const want = JSON.stringify(desk.state)
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === want) return want
    await wait(50)
  }
  throw new Error('the show file never became the desk state: ' + why)
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-no-stall-'))
  file = path.join(dir, 'show.json')
  desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} })
  server = http.createServer((req, res) => desk.handle(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = 'http://127.0.0.1:' + server.address().port
  const looks = makeBigLooks(24, { steps: 16, fixtures: 40 })
  looks[3].name = 'unicode é中😀 "quotes" \\ \n'
  expect(await post('/api/looks', { looks })).toBe(200)
  await settled('boot')
})
afterAll(async () => {
  desk.close()
  server.closeAllConnections?.()
  await new Promise((r) => server.close(r))
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the saved file is byte-identical to JSON.stringify(state)', () => {
  it('after a fire', async () => {
    expect(await post('/api/looks/fire', { id: 'big-5' })).toBe(200)
    const bytes = await settled('fire')
    expect(Buffer.from(bytes).equals(fs.readFileSync(file))).toBe(true)
  })
  it('after a look edit (one new object in the list)', async () => {
    expect(await post('/api/looks/add', { look: { ...desk.state.looks[7], name: 'edited seven' } })).toBe(200)
    await settled('edit')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).looks[7].name).toBe('edited seven')
  })
  it('after a look is removed and one added', async () => {
    await post('/api/looks/remove', { id: 'big-9' })
    await post('/api/looks/add', { look: { id: 'fresh', name: 'fresh', kind: 'all', fixtures: [], steps: [{ values: { a: { dimmer: 3 } } }] } })
    await settled('remove+add')
  })
  it('after an edit in place followed by looksEdited() (the contract)', async () => {
    desk.state.looks[2].name = 'changed in place'
    desk.looksEdited()
    expect(await post('/api/looks/fire', { id: 'big-1' })).toBe(200)
    await settled('in place')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).looks[2].name).toBe('changed in place')
  })
})

describe('a save serialises only the looks that changed', () => {
  const stringified = (spy, objs) => spy.mock.calls.filter((c) => objs.includes(c[0])).length
  it('a fire does not touch any look', async () => {
    await settled('before fire')
    const looks = desk.state.looks.slice()
    const real = JSON.stringify
    const spy = vi.spyOn(JSON, 'stringify').mockImplementation((...a) => real(...a))
    expect(await post('/api/looks/fire', { id: 'big-11' })).toBe(200)
    await settled('fire')
    const n = stringified(spy, [...looks, desk.state.looks])
    spy.mockRestore()
    expect(n).toBe(0)
  })
  it('a look edit serialises that one look and no other', async () => {
    await settled('before edit')
    const others = desk.state.looks.filter((l) => l.id !== 'big-13')
    const real = JSON.stringify
    const spy = vi.spyOn(JSON, 'stringify').mockImplementation((...a) => real(...a))
    expect(await post('/api/looks/add', { look: { ...desk.state.looks.find((l) => l.id === 'big-13'), name: 'edited thirteen' } })).toBe(200)
    await settled('edit')
    const mine = desk.state.looks.find((l) => l.id === 'big-13')
    const nOthers = stringified(spy, [...others, desk.state.looks])
    const nMine = stringified(spy, [mine])
    spy.mockRestore()
    expect(nOthers).toBe(0)
    expect(nMine).toBe(1)
  })
})
