// @vitest-environment node
//
// /api/agent-runs starts a `claude -p` run on the developer's machine. It
// answers a browser only for a page of its own origin (Fetch Metadata
// `Sec-Fetch-Site`, else `Origin`), and a non-browser caller on loopback.
// Every request below carries no prompt: a request the gate lets through gets
// the route's own 400 ("prompt is required"), one it refuses gets 404 — so no
// process is ever started by this file.
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { TRUST_PROXY } = require('../proxyTrust')
const { registerAgentRunRoutes } = require('./agentRunRoutes')

const saved = { ...process.env }
let server, port

beforeAll(async () => {
  const app = express()
  app.set('trust proxy', TRUST_PROXY)
  app.use(express.json())
  const router = express.Router()
  const home = os.tmpdir()
  registerAgentRunRoutes(router, { homeDir: home, defaultCwd: path.join(home, 'di.iiii'), claudeBin: '/nonexistent/claude' })
  app.use(router)
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  port = server.address().port
})
afterAll(() => new Promise((resolve) => server.close(resolve)))
afterEach(() => { process.env = { ...saved } })

const post = (headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({
    host: '127.0.0.1',
    port,
    method: 'POST',
    path: '/api/agent-runs',
    headers: { 'content-type': 'application/json', ...headers }
  }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
  req.on('error', reject)
  req.end('{}')
})

describe('agent runs answer only their own page', () => {
  it('a page of the same origin reaches the route', async () => {
    delete process.env.NODE_ENV
    expect(await post({ 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173' })).toBe(400)
    // A di-dev tree: the page at <tree>.diiii.localhost, through the tree's vite.
    expect(await post({ 'sec-fetch-site': 'same-origin', origin: 'http://land.diiii.localhost', 'x-forwarded-for': '127.0.0.1' })).toBe(400)
  })

  it('a non-browser caller on this machine reaches the route', async () => {
    delete process.env.NODE_ENV
    expect(await post()).toBe(400)
  })

  it('a page of another site is refused', async () => {
    delete process.env.NODE_ENV
    expect(await post({ 'sec-fetch-site': 'cross-site', origin: 'https://other-site.example' })).toBe(404)
    expect(await post({ 'sec-fetch-site': 'same-site', origin: 'http://other.diiii.localhost' })).toBe(404)
    // A browser without Fetch Metadata still sends Origin on a POST.
    expect(await post({ origin: 'https://other-site.example' })).toBe(404)
    expect(await post({ origin: 'null' })).toBe(404)
  })
})
