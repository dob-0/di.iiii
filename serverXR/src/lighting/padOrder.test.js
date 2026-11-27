import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const require = createRequire(import.meta.url)
const { lookBrightness, cellLights, brightnessOrder, sanitizePadOrder, describePadOrder, PAD_SLOTS } = require('./padOrder.js')
const { createDesk } = require('./desk.js')
const mc = require('./ui/midiCues.js')
const { apc40View } = require('./ui/apc40draw.js')

// A look with one step and one fixture of 2 cells (r1.. and r2..): brightness = level.
const mk = (id, level, extra = {}) => ({ id, name: 'Look ' + id, steps: [{ values: { f1: { dimmer: 255, r1: level, g1: 0, b1: 0, w1: 0, ...extra } } }] })
const looks = (n) => Array.from({ length: n }, (_, i) => mk('l' + i, (i * 37) % 251))   // scrambled levels

describe('brightness metric', () => {
  it('dimmer/255 x (r+g+b+1.5w)/255 per cell, mean over steps, fixtures and cells', () => {
    expect(cellLights({ dimmer: 255, r: 255, g: 0, b: 0, w: 0 })).toEqual([1])
    expect(cellLights({ dimmer: 128, r: 255, g: 255, b: 255, w: 0 })[0]).toBeCloseTo(128 / 255 * 3, 10)
    expect(cellLights({ dimmer: 255, w: 255 })[0]).toBeCloseTo(1.5, 10)
    expect(cellLights({ r: 255 })).toEqual([1])                       // no dimmer role = full dimmer
    expect(cellLights({ dimmer: 255, r1: 255, r2: 0 })).toEqual([1, 0])   // a pixel bar: one cell per number
  })
  it('a 16-bit dimmer is dimmer + dimmer_fine/256', () => {
    expect(cellLights({ dimmer: 100, dimmer_fine: 128, r: 255 })[0]).toBeCloseTo(100.5 / 255, 10)
  })
  it('mean over every step and fixture; refs and an empty look count 0', () => {
    const l = { id: 'x', steps: [{ values: { a: { dimmer: 255, r: 255 }, b: { dimmer: 255, r: 0 } } }, { values: { a: { dimmer: 0, r: 255 } } }] }
    expect(lookBrightness(l)).toBeCloseTo(1 / 3, 10)
    expect(lookBrightness({ id: 'y', steps: [{ values: { a: { r: { ref: 'p' } } } }] })).toBe(0)
    expect(lookBrightness({ id: 'z', steps: [] })).toBe(0)
  })
  it('matches the numbers measured from the live show (x100: 0.5 and 92.2) when its checkpoint is on this machine', () => {
    const f = path.join(os.homedir(), '.cache/di-show/checkpoints/2026-11-27-034941/light-api-state.json')
    if (!fs.existsSync(f)) return
    const s = JSON.parse(fs.readFileSync(f, 'utf8'))
    const by = (n) => Math.round(lookBrightness(s.looks.find((l) => l.name === n)) * 1000) / 10
    expect(by('C2 Dream')).toBe(0.5)
    expect(by('6 Amethyst tide')).toBe(92.2)
  })
})

describe('band layout', () => {
  const L = looks(80)
  const sc = L.map(lookBrightness)
  const order = brightnessOrder(L, sc)
  it('80 looks: 80 slots, 2 pages, 10 looks in every column', () => {
    expect(order).toHaveLength(80)
    expect(new Set(order).size).toBe(80)
    for (let c = 0; c < 8; c++) expect(order.filter((_, i) => i % 8 === c)).toHaveLength(10)
  })
  it('column c holds only band c: every look in column c is brighter than every look in column c-1', () => {
    const val = new Map(L.map((l, i) => [l.id, sc[i]]))
    const col = (c) => order.filter((_, i) => i % 8 === c).map((id) => val.get(id))
    for (let c = 1; c < 8; c++) expect(Math.min(...col(c))).toBeGreaterThanOrEqual(Math.max(...col(c - 1)))
  })
  it('within a column rows keep the looks desk order', () => {
    const at = new Map(L.map((l, i) => [l.id, i]))
    for (let c = 0; c < 8; c++) { const ix = order.filter((_, i) => i % 8 === c).map((id) => at.get(id)); expect(ix).toEqual([...ix].sort((a, b) => a - b)) }
  })
  it('5 rows a page: slot 40 is the 6th row of column 1', () => {
    expect(order.slice(40, 48)).toEqual([...Array(8)].map((_, c) => order.filter((_, i) => i % 8 === c)[5]))
  })
  it('82 looks: columns of 11 and 10, short columns end in empty slots, 3 pages', () => {
    const l = looks(82); const o = brightnessOrder(l, l.map(lookBrightness))
    expect(o).toHaveLength(88)   // 11 rows of 8
    expect(o.filter((x) => x !== null)).toHaveLength(82)
    expect(o.filter((_, i) => i % 8 === 0)).toHaveLength(11)
    expect(o.slice(82).every((x) => x === null)).toBe(true)
    const s = sanitizePadOrder(o, l)
    expect(s).toHaveLength(82)
    expect(mc.lookPageCount(mc.padLooks(l, s).length)).toBe(3)
  })
  it('a tie keeps desk order, and no looks gives no slots', () => {
    const l = [mk('a', 5), mk('b', 5), mk('c', 5)]
    expect(brightnessOrder(l, l.map(lookBrightness)).filter(Boolean)).toEqual(['a', 'b', 'c'])
    expect(brightnessOrder([], [])).toEqual([])
  })
})

describe('sanitize', () => {
  const L = looks(3)
  it('unknown ids and junk dropped, a repeat kept, trailing empties cut, nothing left is null', () => {
    expect(sanitizePadOrder(['l1', 'nope', 7, 'l1', null, 'l2', null], L)).toEqual(['l1', 'l1', null, 'l2'])
    expect(sanitizePadOrder(['nope'], L)).toBeNull()
    expect(sanitizePadOrder([], L)).toBeNull()
    expect(sanitizePadOrder('x', L)).toBeNull()
    expect(sanitizePadOrder(null, L)).toBeNull()
  })
  it('describe: each pad with page, row, column, brightness x 100', () => {
    const d = describePadOrder(L, ['l2', null, 'l0'])
    expect(d[0]).toMatchObject({ slot: 0, page: 0, row: 0, column: 0, id: 'l2', name: 'Look l2' })
    expect(d[1].id).toBeNull()
    expect(d[2].brightness).toBe(Math.round(lookBrightness(L[0]) * 1000) / 10)
  })
})

describe('the mapping, LEDs, drawn pads, pages', () => {
  const L = looks(10)
  const order = ['l9', 'l8', null, 'l7', 'l9']   // l9 twice
  it('padLooks: desk order without an order, the order with one, unknown ids empty, looks untouched', () => {
    expect(mc.padLooks(L, null)).toBe(L)
    expect(mc.padLooks(L, [])).toBe(L)
    const p = mc.padLooks(L, ['l9', 'zz', null, 'l0', 'l9'])
    expect(p.map((l) => (l ? l.id : null))).toEqual(['l9', null, null, 'l0', 'l9'])
    expect(L.map((l) => l.id)).toEqual(looks(10).map((l) => l.id))
  })
  it('grid pad k on page p fires padOrder[40p+k]; an empty slot fires nothing', () => {
    const big = looks(100); const o = big.map((l) => l.id).reverse()   // 100 slots: 3 pages
    const p = mc.padLooks(big, o)
    expect(mc.lookPadFire(p, 0, 0).body.id).toBe('l99')
    expect(mc.lookPadFire(p, 1, 5).body.id).toBe(o[45])
    expect(mc.lookPadFire(p, 2, 19).body.id).toBe(o[99])
    expect(mc.lookPadFire(p, 2, 20)).toBeNull()
    expect(mc.lookPadFire(mc.padLooks(L, order), 0, 2)).toBeNull()
    expect(mc.lookPadFire(mc.padLooks(L, order), 0, 4).body.id).toBe('l9')
  })
  it('page count follows the order: longer than 80 means more pages', () => {
    const big = looks(80)
    expect(mc.lookPageCount(mc.padLooks(big, null).length)).toBe(2)
    const long = [...big.map((l) => l.id), ...big.map((l) => l.id).slice(0, 5)]   // 85 slots, repeats allowed
    expect(mc.lookPageCount(mc.padLooks(big, long).length)).toBe(3)
    expect(mc.clampLookPage(9, mc.padLooks(big, long).length)).toBe(2)
  })
  it('LED velocity follows the order: the on-air look is red on every pad that shows it, empty slots dark', () => {
    const map = Object.fromEntries(mc.lookPadTargets().map((t, k) => [t.key, { type: 'note', ch: 1, num: mc.apc40PadNote(k) }]))
    const lights = mc.apc40Lights(map, { list: [] }, {}, { looks: mc.padLooks(L, order), page: 0, activeId: 'l9' })
    const v = (k) => lights.find((x) => x.note === mc.apc40PadNote(k)).vel
    expect(v(0)).toBe(mc.APC40_COLOUR.running); expect(v(4)).toBe(mc.APC40_COLOUR.running)
    expect(v(1)).toBe(mc.APC40_COLOUR.cue); expect(v(2)).toBe(mc.APC40_COLOUR.off); expect(v(3)).toBe(mc.APC40_COLOUR.cue); expect(v(5)).toBe(mc.APC40_COLOUR.off)
  })
  it('the LED painter lights the padOrder slots (it reads the mapped list)', () => {
    const map = Object.fromEntries(mc.lookPadTargets().map((t, k) => [t.key, { type: 'note', ch: 1, num: mc.apc40PadNote(k) }]))
    const sent = []; let page = 0
    const p = mc.createLedPainter({ out: () => ({ send: (b) => sent.push([b[1], b[2]]) }), armed: () => true, map: () => map, cues: () => ({ list: [] }), state: () => ({}),
      looks: () => mc.padLooks(L, order), page: () => page, setPage: (x) => { page = x }, polledId: () => 'l8', now: () => 0 })
    p.paint()
    expect(sent.find((s) => s[0] === mc.apc40PadNote(1))[1]).toBe(mc.APC40_COLOUR.running)   // slot 1 = l8
    expect(sent.find((s) => s[0] === mc.apc40PadNote(2))[1]).toBe(mc.APC40_COLOUR.off)
  })
  it('the drawn APC40 names its pads by the order and shades its column headers dark to bright', () => {
    const keys = mc.lookPadTargets().map((t) => t.key)
    const map = Object.fromEntries(mc.apc40Preset(keys).map((m) => [m.key, { type: m.type, ch: m.ch, num: m.num }]))
    const big = looks(80); const o = brightnessOrder(big, big.map(lookBrightness))
    const bright = Object.fromEntries(big.map((l) => [l.id, lookBrightness(l) * 100]))
    const v = apc40View({ map, cues: { list: [] }, state: {}, looks: mc.padLooks(big, o), order: o, bright, page: 0, activeId: '' })
    expect(v.pads[0].name).toBe('Look ' + o[0]); expect(v.pads[7].name).toBe('Look ' + o[7])
    expect(v.pages).toBe(2); expect(v.ordered).toBe(true)
    const grey = v.columns.map((c) => Number(/\d+/.exec(c.hex)[0]))
    expect(v.columns.every((c) => c.shaded)).toBe(true)
    for (let c = 1; c < 8; c++) expect(grey[c]).toBeGreaterThan(grey[c - 1])
    const plain = apc40View({ map, cues: { list: [] }, state: {}, looks: big, page: 0, activeId: '' })
    expect(plain.columns.every((c) => !c.shaded && c.hex === null)).toBe(true)
    expect(plain.pads[0].name).toBe('Look l0')
  })
})

describe('route api/midi/padorder, saved with the show', () => {
  let dir, desk, server, base
  const call = async (method, route, body) => { const r = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined }); return { status: r.status, body: await r.json() } }
  const boot = async () => {
    desk = createDesk({ dataDir: dir, offline: true, bindPort: 0, outputEnabledDefault: false, log: () => {} })
    server = http.createServer((req, res) => desk.handle(req, res))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    base = 'http://127.0.0.1:' + server.address().port
  }
  const stop = async () => { desk.close(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)) }
  beforeAll(async () => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pad-order-')); await boot() })
  afterAll(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }) })

  it('brightness mode orders the pads, never the looks; GET lists each pad with its brightness', async () => {
    const L = looks(16)
    await call('POST', '/api/looks', { looks: L })
    const r = await call('POST', '/api/midi/padorder', { mode: 'brightness' })
    expect(r.status).toBe(200)
    expect(r.body.padOrder).toHaveLength(16)
    const st = await call('GET', '/api/state')
    expect(st.body.looks.map((l) => l.id)).toEqual(L.map((l) => l.id))   // desk order untouched
    expect(st.body.padOrder).toEqual(r.body.padOrder)
    const g = await call('GET', '/api/midi/padorder')
    expect(g.body.pads[0]).toMatchObject({ slot: 0, column: 0, row: 0 })
    expect(typeof g.body.pads[0].brightness).toBe('number')
    const col = (c) => g.body.pads.filter((p) => p.column === c).map((p) => p.brightness)
    expect(Math.max(...col(0))).toBeLessThanOrEqual(Math.min(...col(7)))
  })
  it('a hand order is sanitized, a bad body is refused, clear goes back to desk order', async () => {
    const r = await call('POST', '/api/midi/padorder', { order: ['l3', 'ghost', 'l3', 'l1'] })
    expect(r.body.padOrder).toEqual(['l3', 'l3', 'l1'])
    expect((await call('POST', '/api/midi/padorder', { nope: 1 })).status).toBe(400)
    expect((await call('POST', '/api/midi/padorder', { clear: true })).body.padOrder).toBeNull()
    expect((await call('GET', '/api/state')).body.padOrder).toBeNull()
  })
  it('survives save and reload; replacing the looks drops the ids that vanished', async () => {
    await call('POST', '/api/midi/padorder', { order: ['l3', 'l1', 'l2'] })
    const file = path.join(dir, 'show.json')
    const t = Date.now()
    while (Date.now() - t < 5000 && !(fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('"padOrder":["l3","l1","l2"]'))) await new Promise((r) => setTimeout(r, 25))
    expect(fs.readFileSync(file, 'utf8')).toContain('"padOrder":["l3","l1","l2"]')
    await stop(); await boot()
    expect((await call('GET', '/api/midi/padorder')).body.padOrder).toEqual(['l3', 'l1', 'l2'])
    await call('POST', '/api/looks', { looks: looks(16).filter((l) => l.id !== 'l1') })
    expect((await call('GET', '/api/midi/padorder')).body.padOrder).toEqual(['l3', 'l2'])
  })
})
