// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN, ZONE, claimOne, fakeWorld, makeKey, signHeaders, signed } from './helpers.js'
import { LIMITS, privateAddressType, whoFrom } from '../src/worker.js'

const accounts = {
  'tok-dob': { id: 'u-dob', name: 'dob' },
  'tok-ponyo': { id: 'u-ponyo', name: 'Ponyo Fish' },
  'tok-mail': { id: 'u-mail', name: 'kiara.r@example.com' }
}

let world
let key
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  world = fakeWorld({ accounts })
  key = await makeKey()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const cfCalls = () => world.calls.filter((c) => c.host === 'api.cloudflare.com')

describe('health', () => {
  it('answers ok, the zone and the version', async () => {
    const res = await world.send('GET', '/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, zone: ZONE, version: expect.stringMatching(/^\d+\.\d+\.\d+$/) })
  })
  it('answers JSON errors for unknown paths and methods', async () => {
    const missing = await world.send('GET', '/nope')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'not found' })
    const wrong = await world.send('GET', '/v1/claim')
    expect(wrong.status).toBe(405)
    expect((await wrong.json()).error).toBeTruthy()
  })
})

describe('claim', () => {
  it('checks the login with the dev tier and makes <who>-<4> with a loopback A record', async () => {
    const { res, data } = await claimOne(world, key)
    expect(res.status).toBe(201)
    expect(data.label).toMatch(/^dob-[a-z2-7]{4}$/)
    expect(data).toEqual({ label: data.label, zone: ZONE, name: `${data.label}.${ZONE}`, record: '127.0.0.1' })
    const who = world.calls.find((c) => c.host === 'dev.diiii.xyz')
    expect(who.path).toBe('/serverXR/api/auth/cli/whoami')
    expect(who.headers.authorization).toBe('Bearer tok-dob')
    expect(world.records).toEqual([
      { id: 'r1', type: 'A', name: `${data.label}.${ZONE}`, content: '127.0.0.1', ttl: 60, proxied: false }
    ])
    const stored = JSON.parse(world.env.LABELS.map.get(`label:${data.label}`))
    expect(stored).toEqual({ account: 'u-dob', pubkey: key.pubkey, createdAt: expect.any(String) })
  })
  it('uses only the first word of a display name or email, never the whole name', async () => {
    const a = await claimOne(world, key, { token: 'tok-ponyo' })
    expect(a.data.label).toMatch(/^ponyo-[a-z2-7]{4}$/)
    const b = await claimOne(world, key, { token: 'tok-mail' })
    expect(b.data.label).toMatch(/^kiara-[a-z2-7]{4}$/)
  })
  it('takes a labelHint as the handle, cleaned to [a-z0-9-]', async () => {
    const { data } = await claimOne(world, key, { labelHint: 'Studio_Laptop!' })
    expect(data.label).toMatch(/^studio-laptop-[a-z2-7]{4}$/)
  })
  it('refuses a login the dev tier does not know with 401', async () => {
    const { res, data } = await claimOne(world, key, { token: 'tok-nobody' })
    expect(res.status).toBe(401)
    expect(data).toEqual({ error: 'login token not accepted' })
    expect(world.records).toHaveLength(0)
  })
  it('refuses a malformed pubkey and a missing token with 400', async () => {
    const bad = await world.send('POST', '/v1/claim', { body: JSON.stringify({ pubkey: 'abc', loginToken: 'tok-dob' }) })
    expect(bad.status).toBe(400)
    const none = await world.send('POST', '/v1/claim', { body: JSON.stringify({ pubkey: key.pubkey }) })
    expect(none.status).toBe(400)
    const notJson = await world.send('POST', '/v1/claim', { body: 'not json' })
    expect(notJson.status).toBe(400)
    expect(world.calls).toHaveLength(0)
  })
  it('makes a label unique: a taken suffix is drawn again', async () => {
    const spy = vi.spyOn(crypto, 'getRandomValues')
    spy.mockImplementationOnce((arr) => arr.fill(0)) // dob-aaaa
    spy.mockImplementationOnce((arr) => arr.fill(0)) // dob-aaaa again, taken
    const first = await claimOne(world, key)
    expect(first.data.label).toBe('dob-aaaa')
    const second = await claimOne(world, key)
    expect(second.res.status).toBe(201)
    expect(second.data.label).not.toBe('dob-aaaa')
    expect(new Set(world.records.map((r) => r.name)).size).toBe(2)
  })
  it(`holds at most ${LIMITS.labelsPerAccount} labels per account (409 above)`, async () => {
    for (let i = 0; i < 3; i += 1) expect((await claimOne(world, key)).res.status).toBe(201)
    const fourth = await claimOne(world, key)
    expect(fourth.res.status).toBe(409)
    expect(fourth.data.error).toMatch(/at most 3/)
    expect(world.records).toHaveLength(3)
    expect((await claimOne(world, key, { token: 'tok-ponyo' })).res.status).toBe(201)
  })
  it('stores nothing when the DNS write fails', async () => {
    world = fakeWorld({ accounts, failDns: true })
    const { res } = await claimOne(world, key)
    expect(res.status).toBe(502)
    expect([...world.env.LABELS.map.keys()]).toEqual([])
  })
  it('never writes the login token or the Cloudflare token to the log', async () => {
    await claimOne(world, key)
    const lines = console.log.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(lines).toContain('"op":"claim"')
    expect(lines).not.toContain('tok-dob')
    expect(lines).not.toContain('cf-token-for-tests')
  })
})

describe('signatures', () => {
  let label
  beforeEach(async () => {
    label = (await claimOne(world, key)).data.label
  })
  const txtPath = () => `/v1/labels/${label}/txt`

  it('accepts a good signature', async () => {
    const res = await signed(world, key, label, 'PUT', txtPath(), { name: '_acme-challenge', value: 'tok1' })
    expect(res.status).toBe(204)
  })
  it('refuses a signature from another key with 401', async () => {
    const other = await makeKey()
    const res = await signed(world, other, label, 'PUT', txtPath(), { name: '_acme-challenge', value: 'tok1' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'bad signature' })
  })
  it('refuses a body that differs from the signed one', async () => {
    const headers = await signHeaders(key, label, 'PUT', txtPath(), JSON.stringify({ name: '_acme-challenge', value: 'a' }))
    const res = await world.send('PUT', txtPath(), { headers, body: JSON.stringify({ name: '_acme-challenge', value: 'b' }) })
    expect(res.status).toBe(401)
  })
  it('refuses a timestamp outside ±120 s', async () => {
    const body = JSON.stringify({ name: '_acme-challenge', value: 'a' })
    const old = await signHeaders(key, label, 'PUT', txtPath(), body, Math.floor(Date.now() / 1000) - 121)
    expect((await world.send('PUT', txtPath(), { headers: old, body })).status).toBe(401)
    const ahead = await signHeaders(key, label, 'PUT', txtPath(), body, Math.floor(Date.now() / 1000) + 121)
    expect((await world.send('PUT', txtPath(), { headers: ahead, body })).status).toBe(401)
  })
  it('refuses a replayed signature with 401', async () => {
    const body = JSON.stringify({ name: '_acme-challenge', value: 'a' })
    const headers = await signHeaders(key, label, 'PUT', txtPath(), body)
    expect((await world.send('PUT', txtPath(), { headers, body })).status).toBe(204)
    expect((await world.send('PUT', txtPath(), { headers, body })).status).toBe(401)
  })
  it('refuses a call under another label with 403, and an unknown label with 401', async () => {
    const other = (await claimOne(world, key, { token: 'tok-ponyo' })).data.label
    const headers = await signHeaders(key, label, 'DELETE', `/v1/labels/${other}/txt`)
    expect((await world.send('DELETE', `/v1/labels/${other}/txt`, { headers })).status).toBe(403)
    const ghost = await signed(world, key, 'ghost-aaaa', 'DELETE', '/v1/labels/ghost-aaaa/txt')
    expect(ghost.status).toBe(401)
  })
  it(`blocks a label with 429 after ${LIMITS.badSignaturesPerHour} bad signatures in an hour`, async () => {
    const other = await makeKey()
    for (let i = 0; i < 20; i += 1) {
      expect((await signed(world, other, label, 'DELETE', txtPath())).status).toBe(401)
    }
    const blocked = await signed(world, key, label, 'DELETE', txtPath())
    expect(blocked.status).toBe(429)
  })
  it('lifts the block in the next hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
    const other = await makeKey()
    for (let i = 0; i < 20; i += 1) await signed(world, other, label, 'DELETE', txtPath())
    expect((await signed(world, key, label, 'DELETE', txtPath())).status).toBe(429)
    vi.setSystemTime(new Date('2026-10-28T11:00:01Z'))
    expect((await signed(world, key, label, 'DELETE', txtPath())).status).toBe(204)
  })
})

describe('TXT for the certificate', () => {
  let label
  beforeEach(async () => {
    label = (await claimOne(world, key)).data.label
  })
  it('sets _acme-challenge.<label>.<zone>, TTL 60, and deletes it', async () => {
    const path = `/v1/labels/${label}/txt`
    expect((await signed(world, key, label, 'PUT', path, { name: '_acme-challenge', value: 'abc_DEF-1' })).status).toBe(204)
    const txt = world.records.find((r) => r.type === 'TXT')
    expect(txt).toMatchObject({ name: `_acme-challenge.${label}.${ZONE}`, content: '"abc_DEF-1"', ttl: 60, proxied: false })
    expect((await signed(world, key, label, 'DELETE', path)).status).toBe(204)
    expect(world.records.filter((r) => r.type === 'TXT')).toHaveLength(0)
  })
  it('refuses another record name or a value that is not base64url', async () => {
    const path = `/v1/labels/${label}/txt`
    expect((await signed(world, key, label, 'PUT', path, { name: 'www', value: 'abc' })).status).toBe(400)
    expect((await signed(world, key, label, 'PUT', path, { name: '_acme-challenge', value: 'a b"c' })).status).toBe(400)
  })
  it(`allows ${LIMITS.ordersPerWeek} orders per label per week (429 on the fifth)`, async () => {
    const path = `/v1/labels/${label}/txt`
    for (let i = 0; i < 4; i += 1) {
      expect((await signed(world, key, label, 'PUT', path, { name: '_acme-challenge', value: `v${i}` })).status).toBe(204)
    }
    const fifth = await signed(world, key, label, 'PUT', path, { name: '_acme-challenge', value: 'v5' })
    expect(fifth.status).toBe(429)
    expect((await fifth.json()).error).toMatch(/4 certificate orders/)
  })
})

describe('address', () => {
  let label
  beforeEach(async () => {
    label = (await claimOne(world, key)).data.label
  })
  const put = (address) => signed(world, key, label, 'PUT', `/v1/labels/${label}/address`, { address })
  const aRecord = () => world.records.find((r) => r.name === `${label}.${ZONE}` && r.type === 'A')

  it.each([
    ['127.0.0.0/8', '127.0.1.1'],
    ['10/8', '10.20.30.40'],
    ['172.16/12', '172.31.255.1'],
    ['192.168/16', '192.168.15.53'],
    ['100.64/10', '100.100.1.2']
  ])('accepts %s (%s) and moves the A record', async (_range, address) => {
    expect((await put(address)).status).toBe(204)
    expect(aRecord()).toMatchObject({ content: address, ttl: 60, proxied: false })
    expect(world.records.filter((r) => r.name === `${label}.${ZONE}`)).toHaveLength(1)
  })
  it.each([
    ['::1', '::1'],
    ['fc00::/7', 'fd12:3456:789a::1']
  ])('accepts %s (%s) as AAAA and drops the A record', async (_range, address) => {
    expect((await put(address)).status).toBe(204)
    const own = world.records.filter((r) => r.name === `${label}.${ZONE}`)
    expect(own).toEqual([expect.objectContaining({ type: 'AAAA', content: address })])
  })
  it.each(['8.8.8.8', '2606:4700::1111', '172.32.0.1', '100.128.0.1', 'example.com'])('refuses %s with 400', async (address) => {
    const res = await put(address)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'address must be private' })
    expect(aRecord().content).toBe('127.0.0.1')
  })
  it(`allows ${LIMITS.addressesPerHour} address changes per hour (429 above)`, async () => {
    for (let i = 0; i < 60; i += 1) {
      expect((await put(`192.168.1.${(i % 250) + 1}`)).status).toBe(204)
    }
    expect((await put('192.168.2.1')).status).toBe(429)
  })
  it('classifies addresses without the network', () => {
    expect(privateAddressType('192.168.0.1')).toBe('A')
    expect(privateAddressType('fe80::1')).toBe(null)
    expect(privateAddressType('010.0.0.1')).toBe(null)
    expect(privateAddressType('::ffff:8.8.8.8')).toBe(null)
  })
})

describe('admin revoke', () => {
  it('deletes the records and the KV entry with the admin token', async () => {
    const label = (await claimOne(world, key)).data.label
    await signed(world, key, label, 'PUT', `/v1/labels/${label}/txt`, { name: '_acme-challenge', value: 'x' })
    const res = await world.send('DELETE', `/v1/labels/${label}`, { headers: { 'x-di-admin': ADMIN } })
    expect(res.status).toBe(204)
    expect(world.records).toHaveLength(0)
    expect(world.env.LABELS.map.has(`label:${label}`)).toBe(false)
    expect(world.env.LABELS.map.has('account:u-dob')).toBe(false)
    expect((await signed(world, key, label, 'DELETE', `/v1/labels/${label}/txt`)).status).toBe(401)
  })
  it('refuses without the admin token, or with a wrong one', async () => {
    const label = (await claimOne(world, key)).data.label
    expect((await world.send('DELETE', `/v1/labels/${label}`)).status).toBe(401)
    expect((await world.send('DELETE', `/v1/labels/${label}`, { headers: { 'x-di-admin': 'nope' } })).status).toBe(401)
    expect(world.records).toHaveLength(1)
  })
  it('frees a place under the account limit', async () => {
    const labels = []
    for (let i = 0; i < 3; i += 1) labels.push((await claimOne(world, key)).data.label)
    await world.send('DELETE', `/v1/labels/${labels[0]}`, { headers: { 'x-di-admin': ADMIN } })
    expect((await claimOne(world, key)).res.status).toBe(201)
    expect(cfCalls().length).toBeGreaterThan(0)
  })
})

describe('whoFrom', () => {
  it('cuts to a handle of at most 35 chars and falls back to "di"', () => {
    expect(whoFrom(undefined, 'x'.repeat(60))).toHaveLength(35)
    expect(whoFrom('', '***')).toBe('di')
    expect(whoFrom('--a--', '')).toBe('a')
  })
})
