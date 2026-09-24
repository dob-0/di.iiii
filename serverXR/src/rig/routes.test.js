// @vitest-environment node
//
// /api/rig/* against fakes: every rule of PROTOCOL-1.md §2, §4 and §5 that is
// the route's to keep. The real card, members and sinks are other lanes'; here
// they are the smallest objects that honour their interfaces.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerRigRoutes, BODY_LIMIT } = require('./routes.js')
const { sign } = require('./protocol.js')
const { LOCAL_FEATURES } = require('./features.js')

const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'protocol-1')
const fixtureText = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8')

const envBefore = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL, DI_ALLOW_LAN_DEVICES: process.env.DI_ALLOW_LAN_DEVICES }
const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
  for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})

const fakeMembers = () => {
  const map = new Map()
  return {
    upserts: [],
    upsert(hello, meta) { this.upserts.push({ hello, meta }); map.set(hello.machine.id, { ...hello, ...meta }) },
    list: () => [...map.values()],
    get: (id) => map.get(id) || null,
    expire() {},
    on() {}
  }
}

const fakeSinks = () => {
  let blackout = false
  return {
    calls: [],
    setBlackout(on, from) { this.calls.push({ on, from }); blackout = on },
    isBlackout: () => blackout,
    async runCue(cue) {
      this.calls.push(cue)
      if (cue.name === 'ping') return { accepted: true, result: { at: 1 } }
      if (cue.name === 'boom') throw new Error('boom')
      return { accepted: false, reason: 'unknown-cue' }
    }
  }
}

// `globalParser` mirrors index.js: express.json with verify has already run and
// captured rawBody before the rig router sees the request.
const boot = async ({ globalParser = true, trustProxy = false, ...deps } = {}) => {
  delete process.env.NODE_ENV
  const app = express()
  if (trustProxy) app.set('trust proxy', true)
  if (globalParser) app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf } }))
  let clock = 1_000_000
  const members = fakeMembers()
  const sinks = fakeSinks()
  const router = express.Router()
  registerRigRoutes(router, {
    identity: { id: 'self-id', name: 'aylmo' },
    release: '0.5.0',
    part: () => 'studio',
    room: null,
    key: null,
    features: LOCAL_FEATURES,
    cardSource: { read: async () => ({ part: 'stage', partReason: '2 cores', ports: { screens: [] }, health: { tempC: 40 }, shows: [] }) },
    members,
    sinks,
    port: 4000,
    base: '/serverXR',
    now: () => clock,
    ...deps
  })
  app.use('/serverXR', router)
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  cleanups.push(() => new Promise((r) => server.close(r)))
  const base = `http://127.0.0.1:${server.address().port}/serverXR/api/rig`
  const post = (route, body, headers = {}) => fetch(`${base}/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
  return { base, post, members, sinks, tick: (ms) => { clock += ms } }
}

const HELLO = { rig: 1, kind: 'hello', release: '0.6.0', machine: { id: 'peer-1', name: 'asuz' }, part: 'stage', room: null, http: { port: 4000, base: '/serverXR' }, features: { card: 2, cue: 1, pictures: 3 }, sentAt: 5 }

describe('POST /api/rig/hello', () => {
  it('answers with our own hello plus agreed, and records the sender as a member', async () => {
    const { post, members } = await boot()
    const res = await post('hello', HELLO)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ rig: 1, kind: 'hello', release: '0.5.0', machine: { id: 'self-id', name: 'aylmo' }, part: 'studio', room: null, http: { port: 4000, base: '/serverXR' }, features: LOCAL_FEATURES })
    expect(body.agreed).toEqual({ card: 1, cue: 1 })
    expect(members.upserts).toHaveLength(1)
    expect(members.upserts[0].meta).toEqual({ address: '127.0.0.1', via: 'hello' })
    expect(members.upserts[0].hello).toMatchObject({ machine: { id: 'peer-1', name: 'asuz' }, agreed: { card: 1, cue: 1 } })
    // §4 rule 2: unknown features kept for display
    expect(members.upserts[0].hello.features.pictures).toBe(3)
  })

  it('accepts a minimal hello and fills http.port from the socket', async () => {
    const { post, members } = await boot()
    const res = await post('hello', fixtureText('hello.minimal.json'))
    expect(res.status).toBe(200)
    expect((await res.json()).agreed).toEqual({})
    expect(members.upserts[0].hello).toMatchObject({ release: 'unknown', part: 'studio', http: { base: '/serverXR' } })
    expect(members.upserts[0].hello.http.port).toBeGreaterThan(0)
  })

  // §4 rules 1, 2, 4
  it('accepts the future hello fixture', async () => {
    const { post } = await boot()
    const res = await post('hello', fixtureText('hello.future.json'))
    expect(res.status).toBe(200)
    expect((await res.json()).agreed).toEqual({ card: 1, cue: 1, blackout: 1, members: 1, discovery: 1 })
  })

  it('409 other-room when rooms differ, both ways', async () => {
    const open = await boot()
    let res = await open.post('hello', { ...HELLO, room: 'club' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ rig: 1, error: 'other-room' })
    expect(open.members.upserts).toHaveLength(0)

    const club = await boot({ room: 'club' })
    res = await club.post('hello', HELLO)
    expect(res.status).toBe(409)
    res = await club.post('hello', { ...HELLO, room: 'club' })
    expect(res.status).toBe(200)
    expect((await res.json()).room).toBe('club')
  })

  it('400 wrong-kind only when kind is present and different (§4 rule 3)', async () => {
    const { post } = await boot()
    let res = await post('hello', { ...HELLO, kind: 'hello2' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ rig: 1, error: 'wrong-kind' })
    const { kind, ...noKind } = HELLO
    res = await post('hello', noKind)
    expect(res.status).toBe(200)
  })

  it('400 malformed without rig 1 or machine.id', async () => {
    const { post } = await boot()
    for (const body of [{ ...HELLO, rig: 2 }, { ...HELLO, machine: {} }, { kind: 'hello' }]) {
      const res = await post('hello', body)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('malformed')
    }
  })

  it('answers our own echo but never lists ourselves', async () => {
    const { post, members } = await boot()
    const res = await post('hello', { ...HELLO, machine: { id: 'self-id', name: 'aylmo' } })
    expect(res.status).toBe(200)
    expect(members.upserts).toHaveLength(0)
  })
})

describe('size (§4 rule 5)', () => {
  for (const globalParser of [true, false]) {
    it(`413 over 64 KB (${globalParser ? 'after the server parser' : 'rig parser'})`, async () => {
      const { post, members } = await boot({ globalParser })
      const big = { ...HELLO, padding: 'x'.repeat(BODY_LIMIT) }
      const res = await post('hello', big)
      expect(res.status).toBe(413)
      expect(await res.json()).toEqual({ rig: 1, error: 'too-large' })
      expect(members.upserts).toHaveLength(0)
      const blackout = await post('blackout', { rig: 1, on: true, padding: 'x'.repeat(BODY_LIMIT) })
      expect(blackout.status).toBe(413)
    })

    it(`accepts a body just under 64 KB (${globalParser ? 'server parser' : 'rig parser'})`, async () => {
      const { post } = await boot({ globalParser })
      const base = JSON.stringify({ ...HELLO, padding: '' })
      const res = await post('hello', { ...HELLO, padding: 'x'.repeat(BODY_LIMIT - base.length) })
      expect(res.status).toBe(200)
    })
  }

  it('the rig parser reads its own body when nothing parsed before it', async () => {
    const { post, members } = await boot({ globalParser: false })
    expect((await post('hello', HELLO)).status).toBe(200)
    expect(members.upserts).toHaveLength(1)
    const res = await post('hello', '{ not json')
    expect(res.status).toBe(400)
  })
})

describe('room key (§5)', () => {
  const KEY = 'room-secret'
  const signed = async (ctx, route, body, sigKey = KEY) => {
    const text = JSON.stringify(body)
    return ctx.post(route, text, { 'x-di-rig-sig': sign(sigKey, text) })
  }

  for (const route of ['hello', 'cue', 'blackout', 'picture']) {
    it(`${route}: 403 room-key without or with a wrong signature, accepted with the right one`, async () => {
      const ctx = await boot({ key: KEY })
      const body = route === 'hello' ? HELLO : route === 'cue' ? { rig: 1, id: `c-${route}`, name: 'ping' } : { rig: 1, on: true }
      let res = await ctx.post(route, body)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ rig: 1, error: 'room-key' })
      res = await signed(ctx, route, body, 'wrong')
      expect(res.status).toBe(403)
      res = await signed(ctx, route, body)
      expect(res.status).toBe(200)
    })
  }

  it('the signature covers the exact bytes, not a re-serialisation', async () => {
    const ctx = await boot({ key: KEY })
    const text = '{"rig":1,  "on":true}'
    const res = await ctx.post('blackout', text, { 'x-di-rig-sig': sign(KEY, JSON.stringify(JSON.parse(text))) })
    expect(res.status).toBe(403)
    const ok = await ctx.post('blackout', text, { 'x-di-rig-sig': sign(KEY, text) })
    expect(ok.status).toBe(200)
  })

  it('GET routes do not need the key', async () => {
    const ctx = await boot({ key: KEY })
    expect((await fetch(`${ctx.base}/card`)).status).toBe(200)
    expect((await fetch(`${ctx.base}/members`)).status).toBe(200)
  })

  it('without a key, a signature header is ignored', async () => {
    const ctx = await boot()
    expect((await ctx.post('blackout', { rig: 1, on: true }, { 'x-di-rig-sig': 'nonsense' })).status).toBe(200)
  })
})

describe('POST /api/rig/cue', () => {
  it('runs a known cue', async () => {
    const { post, sinks } = await boot()
    const res = await post('cue', { rig: 1, kind: 'cue', id: 'c1', name: 'ping', args: {}, from: { id: 'peer-1', name: 'asuz' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rig: 1, accepted: true, result: { at: 1 } })
    expect(sinks.calls[0]).toEqual({ id: 'c1', name: 'ping', args: {}, from: { id: 'peer-1', name: 'asuz' } })
  })

  it('an unknown cue name is 200 accepted:false unknown-cue, not an error', async () => {
    const { post } = await boot()
    const res = await post('cue', { rig: 1, id: 'c2', name: 'from-the-future' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rig: 1, accepted: false, reason: 'unknown-cue' })
  })

  it('the same id within 60 s is a duplicate and is not run again; after 60 s it runs', async () => {
    const { post, sinks, tick } = await boot()
    const cue = { rig: 1, id: 'dup', name: 'ping' }
    expect((await (await post('cue', cue)).json()).accepted).toBe(true)
    tick(59_999)
    expect(await (await post('cue', cue)).json()).toEqual({ rig: 1, accepted: false, reason: 'duplicate' })
    expect(sinks.calls).toHaveLength(1)
    tick(60_000)
    expect((await (await post('cue', cue)).json()).accepted).toBe(true)
    expect(sinks.calls).toHaveLength(2)
  })

  it('cues without an id are never duplicates', async () => {
    const { post, sinks } = await boot()
    await post('cue', { rig: 1, name: 'ping' })
    await post('cue', { rig: 1, name: 'ping' })
    expect(sinks.calls).toHaveLength(2)
  })

  it('accepts the future cue fixture; refuses wrong-kind and a nameless cue', async () => {
    const { post } = await boot()
    expect((await (await post('cue', fixtureText('cue.future.json'))).json()).accepted).toBe(true)
    let res = await post('cue', { rig: 1, kind: 'blackout', name: 'ping' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('wrong-kind')
    res = await post('cue', { rig: 1, id: 'x' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('malformed')
  })

  it('a cue that throws is a 500, not a crash', async () => {
    const { post } = await boot()
    const res = await post('cue', { rig: 1, name: 'boom' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ rig: 1, error: 'cue-failed' })
  })
})

describe('POST /api/rig/blackout', () => {
  it('is always accepted: from anyone, from any room, on and off', async () => {
    const { post, sinks } = await boot({ room: 'club' })
    let res = await post('blackout', { rig: 1, kind: 'blackout', on: true, from: { id: 'stranger', name: 'x' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rig: 1, blackout: true })
    expect(sinks.calls[0]).toEqual({ on: true, from: { id: 'stranger', name: 'x' } })
    res = await post('blackout', { rig: 1, on: false })
    expect(await res.json()).toEqual({ rig: 1, blackout: false })
    res = await post('blackout', { rig: 1 })
    expect(await res.json()).toEqual({ rig: 1, blackout: true })
  })

  it('accepts the future blackout fixture and refuses a wrong kind', async () => {
    const { post } = await boot()
    expect(await (await post('blackout', fixtureText('blackout.future.json'))).json()).toEqual({ rig: 1, blackout: true })
    const res = await post('blackout', { rig: 1, kind: 'cue', on: true })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/rig/picture', () => {
  it('claims the name: not-yet', async () => {
    const { post } = await boot()
    const res = await post('picture', { rig: 1, kind: 'picture', streamId: 's', codec: 'h264', transport: 'webrtc', signal: { sdp: '…' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rig: 1, accepted: false, reason: 'not-yet' })
    expect((await post('picture', { rig: 1, kind: 'cue' })).status).toBe(400)
  })
})

describe('GET /api/rig/card', () => {
  it('assembles the card from the card source, the sinks and our hello', async () => {
    const { base, post } = await boot()
    await post('blackout', { rig: 1, on: true })
    const card = await (await fetch(`${base}/card`)).json()
    expect(card).toMatchObject({ rig: 1, kind: 'card', release: '0.5.0', machine: { id: 'self-id', name: 'aylmo' }, part: 'stage', partReason: '2 cores', mode: 'jam', caller: null, blackout: true, ports: { screens: [] }, health: { tempC: 40 }, shows: [], features: LOCAL_FEATURES })
    expect(typeof card.sentAt).toBe('number')
  })

  it('a failing probe is a card of nulls, never a missing card', async () => {
    const { base } = await boot({ cardSource: { read: async () => { throw new Error('no /sys') } } })
    const res = await fetch(`${base}/card`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ part: 'studio', partReason: null, ports: null, health: null, shows: [], blackout: false })
  })
})

describe('GET /api/rig/members', () => {
  it('lists self and the members hello recorded', async () => {
    const { base, post } = await boot()
    await post('hello', HELLO)
    const body = await (await fetch(`${base}/members`)).json()
    expect(body.rig).toBe(1)
    expect(body.self).toMatchObject({ kind: 'hello', machine: { id: 'self-id' } })
    expect(body.members).toHaveLength(1)
    expect(body.members[0]).toMatchObject({ machine: { id: 'peer-1' }, address: '127.0.0.1', via: 'hello', agreed: { card: 1, cue: 1 } })
  })
})

describe('who can reach it (requireLocalRuntime)', () => {
  it('a hosted server answers 404 to every rig route', async () => {
    const { base, post } = await boot()
    process.env.NODE_ENV = 'production'
    delete process.env.DI_LOCAL
    expect((await post('hello', HELLO)).status).toBe(404)
    expect((await post('blackout', { rig: 1 })).status).toBe(404)
    expect((await fetch(`${base}/card`)).status).toBe(404)
    expect((await fetch(`${base}/members`)).status).toBe(404)
  })

  it('a local install (production + DI_LOCAL=1) answers loopback', async () => {
    const { post } = await boot()
    process.env.NODE_ENV = 'production'
    process.env.DI_LOCAL = '1'
    expect((await post('hello', HELLO)).status).toBe(200)
  })

  it('refuses the LAN unless DI_ALLOW_LAN_DEVICES=1, and records the LAN address when allowed', async () => {
    const { post, members } = await boot({ trustProxy: true })
    delete process.env.DI_ALLOW_LAN_DEVICES
    const lan = { 'x-forwarded-for': '192.168.88.179' }
    let res = await post('hello', HELLO, lan)
    expect(res.status).toBe(403)
    res = await post('blackout', { rig: 1 }, lan)
    expect(res.status).toBe(403)
    process.env.DI_ALLOW_LAN_DEVICES = '1'
    res = await post('hello', HELLO, lan)
    expect(res.status).toBe(200)
    expect(members.upserts[0].meta).toEqual({ address: '192.168.88.179', via: 'hello' })
  })
})
