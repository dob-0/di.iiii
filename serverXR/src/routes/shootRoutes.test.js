import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const { applyShootOps, cleanLink, hashKey, isKnownKey, registerShootRoutes, SHOOT_KEY_HASHES } = require('./shootRoutes')
const { readJson, writeJson } = require('../jsonStore')
const express = require('express')

const plan = () => ({
  title: 'Test shoot',
  cast: [
    { id: 'police', role: 'Police', items: [{ id: 'r', text: 'Radio', note: '', link: '', done: false }, { id: 'w', text: 'Whistle', note: '', link: '', done: false }] },
    { id: 'barber', role: 'Barber', items: [{ id: 's', text: 'Scissors', note: '', link: '', done: false }] }
  ],
  lists: [{ id: 'gear', title: 'Gear', items: [] }],
  schedule: '',
  notes: ''
})

describe('crew edits to a shoot sheet', () => {
  it('ticks one prop and writes a note under another without touching the rest', () => {
    const p = plan()
    applyShootOps(p, [
      { op: 'item.set', list: 'cast:police', item: 'r', done: true },
      { op: 'item.set', list: 'cast:police', item: 'w', note: 'it is in the van' }
    ])
    expect(p.cast[0].items[0].done).toBe(true)
    expect(p.cast[0].items[1]).toMatchObject({ done: false, note: 'it is in the van' })
    expect(p.cast[1].items[0].done).toBe(false)
  })

  it('adds and removes props, on an actor and on a shared list', () => {
    const p = plan()
    applyShootOps(p, [
      { op: 'item.add', list: 'cast:barber', text: '  Hair gel  ' },
      { op: 'item.add', list: 'gear', text: 'Extension cable' },
      { op: 'item.remove', list: 'cast:police', item: 'w' }
    ])
    expect(p.cast[1].items.map((i) => i.text)).toEqual(['Scissors', 'Hair gel'])
    expect(p.lists[0].items[0].text).toBe('Extension cable')
    expect(p.cast[0].items.map((i) => i.id)).toEqual(['r'])
  })

  it('"actor has everything" ticks every prop, and unticking one turns it off', () => {
    const p = plan()
    applyShootOps(p, [{ op: 'cast.set', cast: 'police', allSet: true }])
    expect(p.cast[0].allSet).toBe(true)
    expect(p.cast[0].items.every((i) => i.done)).toBe(true)
    applyShootOps(p, [{ op: 'item.set', list: 'cast:police', item: 'r', done: false }])
    expect(p.cast[0].allSet).toBe(false)
  })

  it('skips ops it cannot place instead of failing the batch', () => {
    const p = plan()
    const applied = applyShootOps(p, [
      { op: 'item.set', list: 'cast:nobody', item: 'r', done: true },
      { op: 'item.set', list: 'cast:police', item: 'missing', done: true },
      { op: 'text.set', field: 'title', value: 'hijack' },
      { op: 'item.set', list: 'cast:police', item: 'r', done: true }
    ])
    expect(applied).toBe(1)
    expect(p.title).toBe('Test shoot')
  })

  it('stores only http(s) links, so a note can never carry a script', () => {
    expect(cleanLink('list.am/ru/item/1')).toBe('https://list.am/ru/item/1')
    expect(cleanLink('javascript:alert(1)')).toBe('')
    expect(cleanLink('data:text/html,hi')).toBe('')
    const p = plan()
    applyShootOps(p, [{ op: 'item.set', list: 'cast:police', item: 'r', link: 'javascript:alert(1)' }])
    expect(p.cast[0].items[0].link).toBe('')
  })

  it('only listed keys open a sheet, and the committed list holds hashes, not keys', () => {
    expect(isKnownKey('short')).toBe(false)
    expect(isKnownKey('x'.repeat(24))).toBe(false)
    for (const h of SHOOT_KEY_HASHES) expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('the shoot routes, mounted the way index.js mounts them', () => {
  const key = 'test_key_for_shoot_sheet_01'
  let dataDir
  let server
  let base

  beforeAll(async () => {
    process.env.SHOOT_KEY_HASHES = hashKey(key)
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoot-'))
    const app = express()
    app.use(express.json({ limit: '10mb' }))
    const router = express.Router()
    const pass = (req, res, next) => next()
    registerShootRoutes(router, { dataDir, readJson, writeJson, readLimiter: pass, writeLimiter: pass, fileLimiter: pass })
    app.use('/serverXR', router)
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${server.address().port}/serverXR/api/shoot`
  })

  afterAll(() => {
    delete process.env.SHOOT_KEY_HASHES
    server?.close()
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  const json = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })

  it('answers a wrong key exactly like a missing sheet', async () => {
    expect((await fetch(`${base}/not_the_right_key_at_all_0`)).status).toBe(404)
    expect((await fetch(`${base}/${key}`)).status).toBe(404)
  })

  it('seeds a plan, takes crew ops, and tells a polling phone when nothing changed', async () => {
    const seeded = await (await json('PUT', `${base}/${key}/plan`, { plan: plan() })).json()
    expect(seeded.rev).toBe(1)
    const after = await (await json('POST', `${base}/${key}/ops`, { ops: [{ op: 'item.set', list: 'cast:police', item: 'r', done: true }] })).json()
    expect(after.rev).toBe(2)
    expect(after.plan.cast[0].items[0].done).toBe(true)
    expect(await (await fetch(`${base}/${key}?rev=2`)).json()).toEqual({ rev: 2, unchanged: true })
    expect((await (await fetch(`${base}/${key}?rev=1`)).json()).plan.cast[0].items[0].done).toBe(true)
  })

  it('lands two edits sent at the same moment', async () => {
    await Promise.all([
      json('POST', `${base}/${key}/ops`, { ops: [{ op: 'item.set', list: 'cast:police', item: 'w', note: 'Ani brings it' }] }),
      json('POST', `${base}/${key}/ops`, { ops: [{ op: 'item.set', list: 'cast:barber', item: 's', done: true }] })
    ])
    const sheet = await (await fetch(`${base}/${key}`)).json()
    expect(sheet.plan.cast[0].items[1].note).toBe('Ani brings it')
    expect(sheet.plan.cast[1].items[0].done).toBe(true)
  })

  it('stores and serves a photo, and refuses names that could leave its folder', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex')
    const put = await fetch(`${base}/${key}/files/cast-police.png`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png })
    expect(put.status).toBe(204)
    const got = await fetch(`${base}/${key}/files/cast-police.png`)
    expect(got.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await got.arrayBuffer()).equals(png)).toBe(true)
    const bad = await fetch(`${base}/${key}/files/..%2Fsheet.json`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png })
    expect(bad.status).toBe(400)
    expect((await fetch(`${base}/${key}/files/sheet.json`)).status).toBe(404)
  })

  it('refuses a plan with no cast', async () => {
    expect((await json('PUT', `${base}/${key}/plan`, { plan: { title: 'x' } })).status).toBe(400)
  })
})
