// @vitest-environment node

import { createRequire } from 'node:module'
import http from 'node:http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const require = createRequire(import.meta.url)
const { streamLocalModel, describeLocalModel, isNetworkFailure, visibleSoFar } = require('./localModelClient')

// An OpenAI-style streaming server the way llama.cpp answers, including a
// reasoning model's <think> block split across chunks.
let server
let port
let lastRequest = null
const chunks = (pieces, { model = 'qwen3-4b', usage } = {}) => pieces.map((content, i) => (
  `data: ${JSON.stringify({ model, choices: [{ delta: { content }, finish_reason: i === pieces.length - 1 ? 'stop' : null }], ...(i === pieces.length - 1 && usage ? { usage } : {}) })}\n\n`
))

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      lastRequest = { path: req.url, body: JSON.parse(body) }
      if (req.url !== '/v1/chat/completions') {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'no such route' } }))
        return
      }
      if (lastRequest.body.messages.at(-1).content === 'refuse') {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'bad prompt' } }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const pieces = lastRequest.body.messages.at(-1).content === 'think'
        ? ['<thi', 'nk>weighing', ' it</think>', 'Welcome, ', 'traveller.']
        : ['Hel', 'lo.']
      for (const c of chunks(pieces, { usage: { prompt_tokens: 12, completion_tokens: 5 } })) res.write(c)
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const env = () => ({ baseUrl: `http://127.0.0.1:${port}`, model: 'qwen3-4b' })

describe('describeLocalModel', () => {
  it('is null with no LLM_BASE_URL and names the box otherwise', () => {
    expect(describeLocalModel({ baseUrl: '', model: '' })).toBeNull()
    expect(describeLocalModel({ baseUrl: 'http://127.0.0.1:8090', model: 'qwen3-4b' }))
      .toEqual({ baseUrl: 'http://127.0.0.1:8090', model: 'qwen3-4b' })
    expect(describeLocalModel({ baseUrl: 'http://127.0.0.1:8090', model: '' }).model).toBeNull()
  })
})

describe('streamLocalModel', () => {
  it('streams an OpenAI-shaped reply and reports usage', async () => {
    const deltas = []
    const result = await streamLocalModel({
      system: 'be brief',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (d) => deltas.push(d),
      env: env()
    })
    expect(deltas.join('')).toBe('Hello.')
    expect(result).toMatchObject({ text: 'Hello.', model: 'qwen3-4b', inputTokens: 12, outputTokens: 5, stopReason: 'stop' })
    expect(lastRequest.path).toBe('/v1/chat/completions')
    expect(lastRequest.body.messages[0]).toEqual({ role: 'system', content: 'be brief' })
    expect(lastRequest.body.stream).toBe(true)
  })

  it('drops a <think> block even when its tags arrive split across chunks', async () => {
    const deltas = []
    const result = await streamLocalModel({
      messages: [{ role: 'user', content: 'think' }],
      onDelta: (d) => deltas.push(d),
      env: env()
    })
    expect(result.text).toBe('Welcome, traveller.')
    expect(deltas.join('')).toBe('Welcome, traveller.')
  })

  it('rejects with the server\'s status and message when it refuses', async () => {
    await expect(streamLocalModel({ messages: [{ role: 'user', content: 'refuse' }], env: env() }))
      .rejects.toMatchObject({ status: 400, message: 'bad prompt' })
  })

  it('reports a box that is not there as 503 with the connection code kept', async () => {
    const closed = http.createServer()
    await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const deadPort = closed.address().port
    await new Promise((resolve) => closed.close(resolve))
    const error = await streamLocalModel({ messages: [{ role: 'user', content: 'hi' }], env: { baseUrl: `http://127.0.0.1:${deadPort}`, model: '' } })
      .catch((e) => e)
    expect(error.status).toBe(503)
    expect(error.code).toBe('ECONNREFUSED')
    expect(isNetworkFailure(error)).toBe(true)
  })

  it('refuses to run with nothing configured', async () => {
    await expect(streamLocalModel({ messages: [], env: { baseUrl: '', model: '' } }))
      .rejects.toMatchObject({ status: 503 })
  })
})

describe('isNetworkFailure', () => {
  it('names the unreachable-host errors and nothing else', () => {
    expect(isNetworkFailure({ code: 'ENOTFOUND' })).toBe(true)
    expect(isNetworkFailure({ cause: { code: 'EAI_AGAIN' } })).toBe(true)
    expect(isNetworkFailure({ status: 401 })).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
  })
})

describe('visibleSoFar', () => {
  it('holds back a tag that may still be opening', () => {
    expect(visibleSoFar('abc<thi')).toBe('abc')
    expect(visibleSoFar('abc<think>x</think>def')).toBe('abcdef')
    expect(visibleSoFar('abc<think>x')).toBe('abc')
  })
})
