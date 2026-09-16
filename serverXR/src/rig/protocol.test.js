// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { PROTOCOL, readHello, buildHello, readCue, readBlackout, kindMismatch, sign, verify } = require('./protocol.js')
const { LOCAL_FEATURES } = require('./features.js')

const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'protocol-1')
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'))

describe('rig protocol 1 readers', () => {
  it('is generation 1', () => {
    expect(PROTOCOL).toBe(1)
  })

  it('fills every §2.1 default for a minimal hello', () => {
    expect(readHello(fixture('hello.minimal.json'), { port: 4000 })).toEqual({
      rig: 1,
      kind: 'hello',
      release: 'unknown',
      machine: { id: 'minimal-0001', name: 'minimal-0001' },
      part: 'studio',
      room: null,
      http: { port: 4000, base: '/serverXR', scheme: 'http', tls: null },
      features: {},
      sentAt: null
    })
  })

  it('refuses a hello without rig 1 or without a usable machine.id', () => {
    expect(readHello(null)).toBeNull()
    expect(readHello([])).toBeNull()
    expect(readHello({ machine: { id: 'x' } })).toBeNull()
    expect(readHello({ rig: 2, machine: { id: 'x' } })).toBeNull()
    expect(readHello({ rig: '1', machine: { id: 'x' } })).toBeNull()
    expect(readHello({ rig: 1 })).toBeNull()
    expect(readHello({ rig: 1, machine: { id: '' } })).toBeNull()
    expect(readHello({ rig: 1, machine: { id: 42 } })).toBeNull()
    expect(readHello({ rig: 1, machine: { id: 'x'.repeat(129) } })).toBeNull()
    expect(readHello({ rig: 1, machine: { id: 'x'.repeat(128) } })).not.toBeNull()
  })

  it('reads odd optional fields as their defaults rather than refusing', () => {
    const hello = readHello({ rig: 1, machine: { id: 'a', name: 7 }, release: 5, part: {}, room: 3, http: { port: 'x', base: 1 }, features: 'all', sentAt: 'now' })
    expect(hello).toMatchObject({ release: 'unknown', machine: { id: 'a', name: 'a' }, part: 'studio', room: null, http: { port: null, base: '/serverXR' }, features: {}, sentAt: null })
  })

  // §4 rule 1, 2, 4
  it('reads the future hello: unknown fields dropped, unknown features kept for display', () => {
    const hello = readHello(fixture('hello.future.json'))
    expect(hello.machine).toEqual({ id: '0b5c2f5e-9d0a-4c61-8f5e-future000001', name: 'future-box' })
    expect(hello.release).toBe('3.2.0')
    expect(hello.http).toEqual({ port: 4000, base: '/serverXR', scheme: 'http', tls: null })
    expect(hello.features).toMatchObject({ card: 3, pictures: 4, hold: 1, 'drivers.dijet': 2 })
    // a nested object where a version belongs is not kept
    expect(hello.features.showmode).toBeUndefined()
    expect(hello.mode).toBeUndefined()
    expect(hello.lanes).toBeUndefined()
  })

  it('reads the future cue and blackout', () => {
    const cue = readCue(fixture('cue.future.json'))
    expect(cue).toMatchObject({ rig: 1, kind: 'cue', name: 'ping', id: 'c7a1d7a2-0000-4000-8000-future000001', from: { id: '0b5c2f5e-9d0a-4c61-8f5e-future000001', name: 'future-box' } })
    expect(cue.args).toEqual({ fade: { ms: 500, curve: 's' } })
    expect(cue.lane).toBeUndefined()
    expect(readBlackout(fixture('blackout.future.json'))).toEqual({ on: true, from: { id: '0b5c2f5e-9d0a-4c61-8f5e-future000001', name: 'future-box' } })
  })

  it('every fixture is valid JSON with rig 1 and its own kind (append-only set)', () => {
    const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))
    for (const required of ['hello.future.json', 'card.future.json', 'cue.future.json', 'blackout.future.json', 'hello.minimal.json']) {
      expect(files).toContain(required)
    }
    for (const file of files) {
      const body = fixture(file)
      expect(body.rig).toBe(1)
      const kind = file.split('.')[0]
      expect(kindMismatch(body, kind)).toBe(false)
    }
    const card = fixture('card.future.json')
    expect(card.machine.id).toBeTruthy()
  })

  it('refuses a cue without a name, and defaults the rest', () => {
    expect(readCue({ rig: 1 })).toBeNull()
    expect(readCue({ rig: 1, name: '' })).toBeNull()
    expect(readCue({ rig: 2, name: 'ping' })).toBeNull()
    expect(readCue({ rig: 1, name: 'ping' })).toEqual({ rig: 1, kind: 'cue', id: null, name: 'ping', args: {}, from: null, sentAt: null })
    expect(readCue({ rig: 1, name: 'ping', args: [1] }).args).toEqual({})
  })

  it('reads a blackout: on defaults to true, non-boolean on is refused', () => {
    expect(readBlackout({ rig: 1 })).toEqual({ on: true, from: null })
    expect(readBlackout({ rig: 1, on: false })).toEqual({ on: false, from: null })
    expect(readBlackout({ rig: 1, on: 'false' })).toBeNull()
    expect(readBlackout({ on: true })).toBeNull()
  })

  // §4 rule 3
  it('a kind mismatch is only a present-and-different kind', () => {
    expect(kindMismatch({ rig: 1 }, 'hello')).toBe(false)
    expect(kindMismatch({ rig: 1, kind: 'hello' }, 'hello')).toBe(false)
    expect(kindMismatch({ rig: 1, kind: 'hello2' }, 'hello')).toBe(true)
    expect(kindMismatch({ rig: 1, kind: null }, 'hello')).toBe(true)
  })

  it('builds a hello that reads back as itself', () => {
    const hello = buildHello({ identity: { id: 'me', name: 'aylmo' }, release: '0.5.0', part: 'stage', room: 'club', port: 4000, base: '/serverXR', features: LOCAL_FEATURES, now: () => 123 })
    expect(hello).toEqual({ rig: 1, kind: 'hello', release: '0.5.0', machine: { id: 'me', name: 'aylmo' }, part: 'stage', room: 'club', http: { port: 4000, base: '/serverXR', scheme: 'http', tls: null }, features: { ...LOCAL_FEATURES }, sentAt: 123 })
    expect(readHello(JSON.parse(JSON.stringify(hello)))).toEqual(hello)
  })
})

describe('rig room key (§5)', () => {
  const body = Buffer.from('{"rig":1,"kind":"blackout","on":true}')

  it('signs as HMAC-SHA256 hex over the raw bytes', () => {
    const expected = crypto.createHmac('sha256', 'secret').update(body).digest('hex')
    expect(sign('secret', body)).toBe(expected)
    expect(sign('secret', body.toString())).toBe(expected)
  })

  it('verifies the right signature and refuses anything else without throwing', () => {
    const sig = sign('secret', body)
    expect(verify('secret', body, sig)).toBe(true)
    expect(verify('secret', body, sig.toUpperCase())).toBe(true)
    expect(verify('other', body, sig)).toBe(false)
    expect(verify('secret', Buffer.from('{}'), sig)).toBe(false)
    for (const bad of [undefined, null, '', 'abc', sig.slice(2), `${sig}00`, 'z'.repeat(64), 5]) {
      expect(verify('secret', body, bad)).toBe(false)
    }
  })

  it('signs an empty body as the empty string', () => {
    expect(verify('k', undefined, sign('k', ''))).toBe(true)
  })
})

describe('hello http.scheme / http.tls (additive, 2026-09-16)', () => {
  it('reads https and a certificate name, and treats anything else as http', () => {
    const base = { rig: 1, machine: { id: 'a' } }
    expect(readHello({ ...base, http: { port: 443, scheme: 'https', tls: 'local.thedi.studio' } }).http)
      .toEqual({ port: 443, base: '/serverXR', scheme: 'https', tls: 'local.thedi.studio' })
    expect(readHello({ ...base, http: { scheme: 'gopher' } }).http.scheme).toBe('http')
    expect(readHello(base).http).toMatchObject({ scheme: 'http', tls: null })
  })
})

