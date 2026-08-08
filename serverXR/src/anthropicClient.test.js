// @vitest-environment node

// Pins streamChatCompletion to the real Anthropic SSE wire shape: a local
// https server replays a captured-format /v1/messages event stream
// (message_start → content_block_delta* → message_delta → message_stop) over a
// real TLS socket, deliberately split at awkward chunk boundaries.

import { createRequire } from 'node:module'
import https from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { streamChatCompletion } = require('./anthropicClient.js')

// The fixture server needs a throwaway self-signed cert (openssl, per run);
// rejectUnauthorized: false on the client side makes its contents moot.

let server
let port
let tmpDir
let lastRequest

const SSE_EVENTS = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-sonnet-5","usage":{"input_tokens":12}}}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo from the fixture"}}\n\n',
  'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n'
]

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'anthropic-fixture-'))
  const keyPath = path.join(tmpDir, 'key.pem')
  const certPath = path.join(tmpDir, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath,
    '-out', certPath, '-days', '1', '-nodes', '-subj', '/CN=localhost'], { stdio: 'ignore' })

  server = https.createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      lastRequest = { headers: req.headers, body: JSON.parse(body), path: req.url }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      // stream with a mid-event split to prove buffering across chunks works
      const whole = SSE_EVENTS.join('')
      const cut = whole.indexOf('lo from') + 3
      res.write(whole.slice(0, cut))
      setTimeout(() => {
        res.write(whole.slice(cut))
        res.end()
      }, 20)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('anthropicClient against a wire-shaped fixture', () => {
  it('parses a real SSE stream: deltas in order, usage, stop reason', async () => {
    const deltas = []
    const result = await streamChatCompletion({
      apiKey: 'sk-ant-fixture',
      model: 'claude-sonnet-5',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: (t) => deltas.push(t),
      transport: { host: '127.0.0.1', port, rejectUnauthorized: false }
    })

    expect(deltas).toEqual(['Hel', 'lo from the fixture'])
    expect(result).toEqual({
      text: 'Hello from the fixture',
      model: 'claude-sonnet-5',
      inputTokens: 12,
      outputTokens: 9,
      stopReason: 'end_turn'
    })
    // request shape Anthropic requires
    expect(lastRequest.path).toBe('/v1/messages')
    expect(lastRequest.headers['x-api-key']).toBe('sk-ant-fixture')
    expect(lastRequest.headers['anthropic-version']).toBe('2023-06-01')
    expect(lastRequest.body).toMatchObject({
      model: 'claude-sonnet-5',
      stream: true,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(lastRequest.body.max_tokens).toBe(16000) // 5-family default: thinking + reply share the cap
  })

  it('clamps a disallowed model to the default and caps max_tokens', async () => {
    await streamChatCompletion({
      apiKey: 'sk-ant-fixture',
      model: 'claude-2.0-totally-not-allowed',
      maxTokens: 999999,
      messages: [{ role: 'user', content: 'hi' }],
      transport: { host: '127.0.0.1', port, rejectUnauthorized: false }
    })
    expect(lastRequest.body.model).toBe('claude-sonnet-5')
    expect(lastRequest.body.max_tokens).toBe(64000)
  })
})
