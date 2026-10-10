// @vitest-environment node

import { describe, expect, it } from 'vitest'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { registerStatusRoutes } = require('./statusRoutes')
const { loadReleaseInfo } = require('../releaseInfo')

// The routes register themselves on whatever router they are given; a stub that keeps the
// handlers is enough to call them with the requests a real deploy sees.
const routes = () => {
  const handlers = {}
  registerStatusRoutes({ get: (path, fn) => { handlers[path] = fn } }, { recentEvents: [], startedAt: 0, releaseInfo: {} })
  return handlers
}
const call = (handler, req) => {
  const res = { statusCode: 200, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  handler({ headers: {}, ...req }, res)
  return res
}

describe('GET /api/follows — names other machines, so only the person at this one sees it', () => {
  it('answers a browser talking straight to the server on loopback', () => {
    const res = call(routes()['/api/follows'], { socket: { remoteAddress: '127.0.0.1' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty('follows')
  })

  it('does not answer another address', () => {
    const res = call(routes()['/api/follows'], { socket: { remoteAddress: '192.168.1.20' } })
    expect(res.statusCode).toBe(404)
  })

  // nginx, cloudflared, Caddy, ssh -L — a proxy on the same machine re-originates every visitor
  // from loopback. Behind a tunnel on the host that is the whole internet. The proxy's own
  // headers are the one honest sign, as in localOwner.js.
  it.each([
    ['x-forwarded-for', '203.0.113.9'],
    ['forwarded', 'for=203.0.113.9'],
    ['x-real-ip', '203.0.113.9'],
    ['x-forwarded-host', 'diiii.xyz']
  ])('does not answer loopback that came through a proxy (%s)', (header, value) => {
    const res = call(routes()['/api/follows'], { socket: { remoteAddress: '127.0.0.1' }, headers: { [header]: value } })
    expect(res.statusCode).toBe(404)
  })
})

// An installed di keeps its stamp at the version root (~/.di/versions/<version>/release.json,
// written by scripts/pack-runtime.mjs) with the server in serverXR/ beside it. Health answered
// release = all null there until the loader looked one folder up (releaseInfo.test.js has the
// loader on its own; this has the route, so a route that stopped passing the stamp on fails too).
describe('GET /api/health — says which release this server is', () => {
  const withInstalledDi = (run) => {
    const versionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'health-release-'))
    try {
      fs.mkdirSync(path.join(versionRoot, 'serverXR'))
      // The shape of the file aylmo's 0.4.4-dev.5b37c82f carries, read 2026-10-10.
      fs.writeFileSync(path.join(versionRoot, 'release.json'), JSON.stringify({
        version: '0.4.4-dev.5b37c82f',
        profile: 'local',
        gitCommit: '5b37c82fcd8c5a4446f536090e3868a4f248c43c',
        works: ['wcc', 'algovrithm'],
        schemaVersion: 1,
        packedAt: '2026-10-09T13:58:49.745Z',
        node: 'v22.23.3'
      }))
      const handlers = {}
      registerStatusRoutes({ get: (route, fn) => { handlers[route] = fn } }, {
        recentEvents: [],
        startedAt: 0,
        releaseInfo: loadReleaseInfo(path.join(versionRoot, 'serverXR'))
      })
      return run(handlers['/api/health'])
    } finally {
      fs.rmSync(versionRoot, { recursive: true, force: true })
    }
  }

  it('carries the version and commit an installed di was packed with', () => {
    const res = withInstalledDi((health) => call(health, { socket: { remoteAddress: '127.0.0.1' } }))

    expect(res.body.ok).toBe(true)
    expect(res.body.release).toMatchObject({
      version: '0.4.4-dev.5b37c82f',
      gitCommit: '5b37c82fcd8c5a4446f536090e3868a4f248c43c',
      releaseId: '0.4.4-dev.5b37c82f',
      generatedAt: '2026-10-09T13:58:49.745Z'
    })
  })

  it('tells a visitor the same, and still keeps the paths to the person at the machine', () => {
    // dev.diiii.xyz already publishes its release block to anyone; the folders stay loopback-only.
    const res = withInstalledDi((health) => call(health, {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.9' }
    }))

    expect(res.body.release.gitCommit).toBe('5b37c82fcd8c5a4446f536090e3868a4f248c43c')
    expect(res.body).not.toHaveProperty('serverRoot')
    expect(res.body).not.toHaveProperty('dataRoot')
  })
})
