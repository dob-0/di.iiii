// @vitest-environment node

// The request log keeps only answers that went wrong, or never came (accessLog.js). These run
// the real morgan with the same 'tiny' format and the same order as index.js (morgan, then
// express.json), so a morgan upgrade that changes when skip() is asked — it must be at the END
// of the response, once the status is known — fails here.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const express = require('express')
const morgan = require('morgan')
const { accessLogSkip } = require('./accessLog.js')

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

const serve = async (env, lines) => {
  const app = express()
  app.use(morgan('tiny', { skip: accessLogSkip(env), stream: { write: (line) => lines.push(line.trim()) } }))
  app.use(express.json({ limit: '1kb' }))
  app.get('/ok', (_req, res) => res.json({ ok: true }))
  app.get('/same', (_req, res) => res.status(304).end())
  app.get('/broken', (_req, res) => res.status(500).json({ error: 'broken' }))
  // a route that decides its status late, after async work — the follower's meta probes do
  app.get('/late', (_req, res) => setTimeout(() => res.status(404).json({ error: 'no such file' }), 20))
  // a route that answers after the client has given up
  app.get('/slow', (_req, res) => setTimeout(() => { if (!res.writableEnded) res.json({ ok: true }) }, 300))
  app.post('/echo', (req, res) => res.json(req.body))
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: 'bad request' }))
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

const post = (base, body) => fetch(`${base}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })

describe('request log: only answers that went wrong', () => {
  const lines = []
  let quiet
  beforeAll(async () => { quiet = await serve({}, lines) })
  afterAll(() => new Promise((resolve) => quiet.server.close(resolve)))

  it('writes nothing for 200 and 304, one line each for a late 404 and a 500', async () => {
    lines.length = 0
    for (const path of ['/ok', '/same', '/ok', '/late', '/broken']) await fetch(quiet.base + path)
    await settle()
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^GET \/late 404 /)
    expect(lines[1]).toMatch(/^GET \/broken 500 /)
  })

  it('writes a line for a body that fails to parse (400) or is too large (413), none for a good one', async () => {
    lines.length = 0
    await post(quiet.base, '{"a":1}')
    await post(quiet.base, '{not json')
    await post(quiet.base, JSON.stringify({ a: 'x'.repeat(4096) }))
    await settle()
    expect(lines.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual(['POST /echo 400', 'POST /echo 413'])
  })

  it('writes a line for a request the client gave up on before any answer', async () => {
    lines.length = 0
    const gaveUp = new AbortController()
    const asked = fetch(`${quiet.base}/slow`, { signal: gaveUp.signal }).catch(() => 'aborted')
    await settle(50)
    gaveUp.abort()
    expect(await asked).toBe('aborted')
    await settle(400)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^GET \/slow - /)
  })
})

describe('request log: DI_ACCESS_LOG', () => {
  for (const value of ['1', 'all']) {
    it(`=${value} writes a line for every answer`, async () => {
      const lines = []
      const loud = await serve({ DI_ACCESS_LOG: value }, lines)
      try {
        for (const path of ['/ok', '/same', '/broken']) await fetch(loud.base + path)
        await settle()
        expect(lines.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual(['GET /ok 200', 'GET /same 304', 'GET /broken 500'])
      } finally {
        await new Promise((resolve) => loud.server.close(resolve))
      }
    })
  }
})

describe('accessLogSkip', () => {
  const answered = (statusCode) => ({ statusCode, headersSent: true })

  it('skips answers below 400 and keeps 400 and up', () => {
    const skip = accessLogSkip({})
    for (const statusCode of [200, 201, 204, 206, 301, 302, 304, 399]) expect(skip({}, answered(statusCode))).toBe(true)
    for (const statusCode of [400, 401, 403, 404, 409, 413, 429, 500, 502, 503]) expect(skip({}, answered(statusCode))).toBe(false)
  })

  it('keeps a request that got no answer, though its status still reads 200', () => {
    expect(accessLogSkip({})({}, { statusCode: 200, headersSent: false })).toBe(false)
  })

  it('reads the switch once, when the log is set up', () => {
    const env = {}
    const skip = accessLogSkip(env)
    env.DI_ACCESS_LOG = '1'
    expect(skip({}, answered(200))).toBe(true)
  })
})

describe('index.js mounts the request log in the right place', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const at = (needle) => {
    const index = source.indexOf(needle)
    expect(index, needle).toBeGreaterThan(-1)
    return index
  }

  it('after the NDI routes (an MJPEG reconnect is not worth a line) and ahead of express.json', () => {
    const ndi = at('registerNdiRoutes(app')
    const log = at("app.use(morgan('tiny', { skip: accessLogSkip() }))")
    const json = at('app.use(express.json(')
    expect(ndi).toBeLessThan(log)
    expect(log).toBeLessThan(json)
  })
})
