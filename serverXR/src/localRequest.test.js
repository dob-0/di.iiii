// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  requestFromThisMachine,
  hostnameOf,
  createHostPolicy,
  certificateNames,
  isAllowedHost,
  isLocalhostOrigin,
  isWriteFromAllowedPage,
  isOwnPageOrNotABrowser,
  isLocalServer
} = require('./localRequest')

const from = (address, headers = {}) => ({ socket: { remoteAddress: address }, headers })

describe('requestFromThisMachine', () => {
  it('a direct connection over loopback is this machine; any other peer is not', () => {
    expect(requestFromThisMachine(from('127.0.0.1'))).toBe(true)
    expect(requestFromThisMachine(from('127.0.0.53'))).toBe(true)
    expect(requestFromThisMachine(from('::1'))).toBe(true)
    expect(requestFromThisMachine(from('::ffff:127.0.0.1'))).toBe(true)
    expect(requestFromThisMachine(from('192.168.88.10'))).toBe(false)
    expect(requestFromThisMachine(from(''))).toBe(false)
    expect(requestFromThisMachine({})).toBe(false)
  })

  it('X-Forwarded-For is read with the loopback trust rule (every hop on this machine)', () => {
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-for': '127.0.0.1' }))).toBe(true)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-for': '::1, 127.0.0.1' }))).toBe(true)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-for': '192.168.88.140' }))).toBe(false)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-for': '127.0.0.1, 192.168.88.140' }))).toBe(false)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-for': ', 127.0.0.1' }))).toBe(false)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-for': ['127.0.0.1', '203.0.113.9'] }))).toBe(false)
  })

  it('a client address in any header this server does not read means not this machine', () => {
    for (const name of ['forwarded', 'x-real-ip', 'cf-connecting-ip', 'cf-connecting-ipv6', 'true-client-ip', 'x-client-ip', 'fastly-client-ip', 'x-cluster-client-ip']) {
      expect({ name, local: requestFromThisMachine(from('127.0.0.1', { [name]: '127.0.0.1' })) }).toEqual({ name, local: false })
    }
    for (const name of ['via', 'cdn-loop', 'cf-ray']) {
      expect({ name, local: requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-for': '127.0.0.1', [name]: 'x' })) }).toEqual({ name, local: false })
    }
  })

  it('forwarding details without X-Forwarded-For mean a proxy left the client out', () => {
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-host': 'local.thedi.studio' }))).toBe(false)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-proto': 'https' }))).toBe(false)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-port': '443' }))).toBe(false)
    expect(requestFromThisMachine(from('127.0.0.1', { 'x-forwarded-host': '' }))).toBe(true)
  })
})

describe('host names', () => {
  it('hostnameOf strips port, brackets, case and the trailing dot', () => {
    expect(hostnameOf('DIIII.Localhost.:80')).toBe('diiii.localhost')
    expect(hostnameOf('[::1]:4000')).toBe('::1')
    expect(hostnameOf('127.0.0.1:443')).toBe('127.0.0.1')
    expect(hostnameOf('')).toBe('')
    expect(hostnameOf('[::1')).toBe('')
  })

  it('always answers IP addresses, localhost and *.localhost', () => {
    const policy = createHostPolicy({ hostname: 'aylmo' })
    for (const host of ['127.0.0.1', '192.168.15.53:443', '[::1]:4000', '[fe80::1]', 'localhost', 'localhost:5173', 'diiii.localhost', 'land.diiii.localhost:80', 'aylmo', 'aylmo.local:4000']) {
      expect({ host, ok: isAllowedHost(host, policy) }).toEqual({ host, ok: true })
    }
    for (const host of ['other-site.example', 'localhost.other-site.example', 'notlocalhost', 'diiii.localhost.other-site.example', 'aylmo.other-site.example']) {
      expect({ host, ok: isAllowedHost(host, policy) }).toEqual({ host, ok: false })
    }
  })

  it('answers configured names, CORS origins\' hosts, and a leading dot for every name under one', () => {
    const policy = createHostPolicy({
      allowedHosts: ['local.thedi.studio', '.venue.example.test', '*.stage.example.test', 'https://door.example.test:8443'],
      corsOrigins: ['https://dev.diiii.xyz', '*'],
      hostname: 'aylmo'
    })
    for (const host of ['local.thedi.studio', 'LOCAL.thedi.studio:443', 'venue.example.test', 'a.b.venue.example.test', 'x.stage.example.test', 'stage.example.test', 'door.example.test', 'dev.diiii.xyz']) {
      expect({ host, ok: isAllowedHost(host, policy) }).toEqual({ host, ok: true })
    }
    for (const host of ['lights.thedi.studio', 'xvenue.example.test', 'venue.example.test.other-site.example', 'diiii.xyz']) {
      expect({ host, ok: isAllowedHost(host, policy) }).toEqual({ host, ok: false })
    }
  })

  it('DI_ALLOWED_HOSTS=* answers any name', () => {
    expect(isAllowedHost('other-site.example', createHostPolicy({ allowedHosts: ['*'] }))).toBe(true)
  })

  it('a missing Host is not a browser; an empty-name Host is refused', () => {
    const policy = createHostPolicy({ hostname: 'aylmo' })
    expect(isAllowedHost(undefined, policy)).toBe(true)
    expect(isAllowedHost('', policy)).toBe(true)
    expect(isAllowedHost(':80', policy)).toBe(false)
  })

  const hasOpenssl = (() => { try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); return true } catch { return false } })()
  it.skipIf(!hasOpenssl)('reads the DNS names on the server\'s own certificate', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dii-cert-'))
    try {
      const cert = path.join(dir, 'cert.pem')
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-keyout', path.join(dir, 'key.pem'), '-out', cert, '-subj', '/CN=local.example.test',
        '-addext', 'subjectAltName=DNS:local.example.test,DNS:*.rig.example.test,IP:192.168.1.5'], { stdio: 'ignore' })
      expect(certificateNames(cert)).toEqual(['local.example.test', '.rig.example.test'])
      const policy = createHostPolicy({ certPath: cert, hostname: 'aylmo' })
      expect(isAllowedHost('local.example.test', policy)).toBe(true)
      expect(isAllowedHost('stage.rig.example.test', policy)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('an unreadable certificate adds no names and does not throw', () => {
    expect(certificateNames('/nonexistent/cert.pem')).toEqual([])
    expect(certificateNames('')).toEqual([])
  })
})

describe('which page sent a write', () => {
  const policy = createHostPolicy({ allowedHosts: ['local.thedi.studio'], hostname: 'aylmo' })
  const write = (headers) => ({ method: 'POST', headers: { host: '127.0.0.1:4000', ...headers } })

  it('isLocalhostOrigin: localhost, *.localhost, 127/8 and ::1 at any port, nothing else', () => {
    for (const origin of ['http://localhost', 'https://localhost:5173', 'http://land.diiii.localhost', 'http://127.0.0.1:4000', 'http://127.1.2.3', 'http://[::1]:5173']) {
      expect({ origin, ok: isLocalhostOrigin(origin) }).toEqual({ origin, ok: true })
    }
    for (const origin of ['null', '', 'file://', 'http://localhost.other-site.example', 'http://other-site.example/x.localhost', 'http://user@localhost', 'ws://localhost', 'http://192.168.88.140']) {
      expect({ origin, ok: isLocalhostOrigin(origin) }).toEqual({ origin, ok: false })
    }
  })

  it('Fetch Metadata same-origin or none is the server\'s own page or the person', () => {
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:4000' }), policy)).toBe(true)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'none' }), policy)).toBe(true)
  })

  it('a page of another site is refused unless it is this machine\'s or configured', () => {
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'cross-site', origin: 'https://other-site.example' }), policy)).toBe(false)
    expect(isWriteFromAllowedPage(write({ origin: 'https://other-site.example' }), policy)).toBe(false)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'cross-site', origin: 'null' }), policy)).toBe(false)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'cross-site' }), policy)).toBe(false)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'same-site' }), policy)).toBe(false)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'cross-site', origin: 'http://192.168.88.140' }), policy)).toBe(false)

    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'same-site', origin: 'http://land.diiii.localhost' }), policy)).toBe(true)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'cross-site', origin: 'https://local.thedi.studio' }), policy)).toBe(true)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'cross-site', origin: 'https://studio.example.test' }), policy, ['https://studio.example.test'])).toBe(true)
    expect(isWriteFromAllowedPage(write({ 'sec-fetch-site': 'cross-site', origin: 'https://other-site.example' }), policy, ['*'])).toBe(true)
  })

  it('a browser with no Fetch Metadata on the server\'s own address is its own page', () => {
    expect(isWriteFromAllowedPage({ headers: { host: '192.168.88.231', origin: 'https://192.168.88.231' } }, policy)).toBe(true)
    expect(isWriteFromAllowedPage({ headers: { host: '192.168.88.231', origin: 'https://192.168.88.140' } }, policy)).toBe(false)
  })

  it('no Origin and no Fetch Metadata is not a browser', () => {
    expect(isWriteFromAllowedPage(write({}), policy)).toBe(true)
  })

  it('routes that start programs want the server\'s own page exactly', () => {
    expect(isOwnPageOrNotABrowser({ headers: { 'sec-fetch-site': 'same-origin' } })).toBe(true)
    expect(isOwnPageOrNotABrowser({ headers: {} })).toBe(true)
    expect(isOwnPageOrNotABrowser({ headers: { origin: 'http://localhost:5173' } })).toBe(true)
    expect(isOwnPageOrNotABrowser({ headers: { 'sec-fetch-site': 'same-site', origin: 'http://other.diiii.localhost' } })).toBe(false)
    expect(isOwnPageOrNotABrowser({ headers: { 'sec-fetch-site': 'cross-site' } })).toBe(false)
    expect(isOwnPageOrNotABrowser({ headers: { origin: 'https://other-site.example' } })).toBe(false)
  })
})

describe('isLocalServer', () => {
  it('a personal install or any non-production server', () => {
    expect(isLocalServer({ NODE_ENV: 'production', DI_LOCAL: '1' })).toBe(true)
    expect(isLocalServer({ NODE_ENV: 'development' })).toBe(true)
    expect(isLocalServer({})).toBe(true)
    expect(isLocalServer({ NODE_ENV: 'production' })).toBe(false)
    expect(isLocalServer({ NODE_ENV: 'Production', DI_LOCAL: '0' })).toBe(false)
  })
})
