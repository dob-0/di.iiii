// @vitest-environment node

// The request log keeps only answers that went wrong (accessLog.js). These run the real
// morgan with the same 'tiny' format index.js uses, so a morgan upgrade that changes when
// skip() is asked (it must be at the END of the response, once the status is known) fails here.

import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const express = require('express')
const morgan = require('morgan')
const { accessLogSkip } = require('./accessLog.js')

const serve = async (env, lines) => {
  const app = express()
  app.use(morgan('tiny', { skip: accessLogSkip(env), stream: { write: (line) => lines.push(line.trim()) } }))
  app.get('/ok', (_req, res) => res.json({ ok: true }))
  app.get('/same', (_req, res) => res.status(304).end())
  app.get('/broken', (_req, res) => res.status(500).json({ error: 'broken' }))
  // a route that decides its status late, after async work — the follower's meta probes do
  app.get('/late', (_req, res) => setTimeout(() => res.status(404).json({ error: 'no such file' }), 20))
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

describe('request log: only answers that went wrong', () => {
  const lines = []
  let quiet
  beforeAll(async () => { quiet = await serve({}, lines) })
  afterAll(() => new Promise((resolve) => quiet.server.close(resolve)))

  it('writes nothing for 200 and 304, one line each for 404 and 500', async () => {
    for (const path of ['/ok', '/same', '/ok', '/late', '/broken']) await fetch(quiet.base + path)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^GET \/late 404 /)
    expect(lines[1]).toMatch(/^GET \/broken 500 /)
  })
})

describe('request log: DI_ACCESS_LOG=all', () => {
  const lines = []
  let loud
  beforeAll(async () => { loud = await serve({ DI_ACCESS_LOG: 'all' }, lines) })
  afterAll(() => new Promise((resolve) => loud.server.close(resolve)))

  it('writes a line for every answer', async () => {
    for (const path of ['/ok', '/same', '/broken']) await fetch(loud.base + path)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(lines.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual(['GET /ok 200', 'GET /same 304', 'GET /broken 500'])
  })
})

describe('accessLogSkip', () => {
  it('skips below 400 and keeps 400 and up', () => {
    const skip = accessLogSkip({})
    for (const statusCode of [200, 201, 204, 206, 301, 302, 304, 399]) expect(skip({}, { statusCode })).toBe(true)
    for (const statusCode of [400, 401, 403, 404, 409, 429, 500, 502, 503]) expect(skip({}, { statusCode })).toBe(false)
  })

  it('reads the switch once, when the log is set up', () => {
    const env = {}
    const skip = accessLogSkip(env)
    env.DI_ACCESS_LOG = 'all'
    expect(skip({}, { statusCode: 200 })).toBe(true)
  })
})
