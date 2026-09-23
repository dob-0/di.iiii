// @vitest-environment node
//
// createRig's three visibility states, end to end through the real routes:
// which discovery mode each start gets, what /api/rig/visibility answers, and
// the one log line a private copy writes. Discovery itself is a fake here —
// its socket rules are discovery.test.js's and discovery.private.test.js's.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { createRig } = require('./index.js')

const ENV_KEYS = ['NODE_ENV', 'DI_LOCAL', 'DI_ALLOW_LAN_DEVICES']
const envBefore = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
const cleanups = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()()
  for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})

const quietLogger = () => {
  const lines = { info: [], warn: [], error: [] }
  return { lines, info: (m) => lines.info.push(String(m)), warn: (m) => lines.warn.push(String(m)), error: (m) => lines.error.push(String(m)) }
}

const boot = async ({ host, lanAllowed = false, local = true, env = {} } = {}) => {
  process.env.NODE_ENV = 'production'
  if (local) process.env.DI_LOCAL = '1'; else delete process.env.DI_LOCAL
  if (lanAllowed) process.env.DI_ALLOW_LAN_DEVICES = '1'; else delete process.env.DI_ALLOW_LAN_DEVICES
  // A non-local production server has no local runtime at all; for the
  // "source checkout" case (2026-09-24's third copy) NODE_ENV is unset.
  if (!local) delete process.env.NODE_ENV

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-index-'))
  const made = []
  const createDiscovery = (opts) => {
    const fake = { opts, started: false, start() { this.started = true }, stop() {}, stats: () => ({ listening: true, bindError: 0 }) }
    made.push(fake)
    return fake
  }
  const logger = quietLogger()
  const app = express()
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf } }))
  const rig = createRig({ app, dataRoot, env: { DI_MACHINE_NAME: 'test-box', ...(local ? { DI_LOCAL: '1' } : {}), ...env }, release: '0.5.0', port: 4000, host, logger, createDiscovery })
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => {
    rig.stop()
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(dataRoot, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${server.address().port}/serverXR/api/rig`
  return { rig, discovery: made[0] || null, logger, base }
}

describe('createRig visibility', () => {
  it('`di up --lan`: open discovery, visible, no warning', async () => {
    const { discovery, logger, base } = await boot({ host: '0.0.0.0', lanAllowed: true })
    expect(discovery.opts.mode).toBe('open')
    expect(discovery.started).toBe(true)
    const v = await (await fetch(`${base}/visibility`)).json()
    expect(v).toMatchObject({ visible: true, reason: 'open', discovery: 'on', members: 0, fix: null })
    expect(logger.lines.warn.filter((l) => l.includes('private'))).toEqual([])
    expect(logger.lines.info.join('\n')).toMatch(/discovery on/)
  })

  it('the 2026-09-24 case — bound to every interface, DI_ALLOW_LAN_DEVICES unset: private discovery, and it says so', async () => {
    const { discovery, logger, base } = await boot({ host: '0.0.0.0', lanAllowed: false, local: false })
    expect(discovery.opts.mode).toBe('private')
    const v = await (await fetch(`${base}/visibility`)).json()
    expect(v).toMatchObject({ visible: false, reason: 'devices-closed', discovery: 'listening' })
    expect(v.fix).toMatch(/DI_ALLOW_LAN_DEVICES=1/)
    const warn = logger.lines.warn.join('\n')
    expect(warn).toMatch(/\[rig\] this machine is private/)
    expect(warn).toMatch(/to join: restart it with DI_ALLOW_LAN_DEVICES=1/)
  })

  it('an empty HOST is config.js\'s default, every interface — the same private state', async () => {
    const { discovery } = await boot({ host: undefined, lanAllowed: false, local: false })
    expect(discovery.opts.mode).toBe('private')
  })

  it('a loopback `di up`: no socket on the network at all, private, and the fix is the di command', async () => {
    const { discovery, logger, base } = await boot({ host: '127.0.0.1', lanAllowed: false })
    expect(discovery).toBeNull()
    const v = await (await fetch(`${base}/visibility`)).json()
    expect(v).toMatchObject({ visible: false, reason: 'loopback', discovery: 'off', fix: 'di down, then di up --lan' })
    expect(logger.lines.warn.join('\n')).toMatch(/to join: di down, then di up --lan/)
    expect(logger.lines.info.join('\n')).toMatch(/discovery off/)
  })

  it('what a peer said hello to and got "loopback-only" back is listed as nearby and private', async () => {
    const { discovery, rig, base } = await boot({ host: '0.0.0.0', lanAllowed: true })
    // Stand up a private peer: a server whose /api/rig answers what the guard answers.
    const peer = express()
    peer.post('/serverXR/api/rig/hello', (_req, res) => res.status(403).json({ error: 'local runtime is loopback-only', detail: 'x' }))
    const peerServer = http.createServer(peer)
    await new Promise((resolve) => peerServer.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise((resolve) => peerServer.close(resolve)))

    const answer = await discovery.opts.sayHello('127.0.0.1', peerServer.address().port, '/serverXR', { scheme: 'http', id: 'ponyo-id', name: 'ponyo' })
    expect(answer).toBeNull()
    expect(rig.members.list()).toEqual([])
    const v = await (await fetch(`${base}/visibility`)).json()
    expect(v.nearby).toEqual([expect.objectContaining({ id: 'ponyo-id', name: 'ponyo', address: '127.0.0.1', open: false, via: 'refused' })])
  })

  it('DI_RIG=0 builds nothing and serves no visibility route', async () => {
    const { rig, base } = await boot({ host: '0.0.0.0', lanAllowed: true, env: { DI_RIG: '0' } })
    expect(rig.visibility).toBeUndefined()
    expect((await fetch(`${base}/visibility`)).status).toBe(404)
  })
})
