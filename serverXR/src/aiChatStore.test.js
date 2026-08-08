// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const store = require('./aiChatStore.js')
const { initDb, closeDb } = require('./db.js')
const { registerAiChatRoutes } = require('./routes/aiChatRoutes.js')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('aiChatStore', () => {
  it('creates, lists, renames and deletes chats scoped to the user', () => {
    const chat = store.createChat('user-1', { title: 'first' })
    expect(chat.user_id).toBe('user-1')
    expect(store.listChats('user-1')).toHaveLength(1)
    expect(store.listChats('user-2')).toHaveLength(0)
    expect(store.getChat('user-2', chat.id)).toBeNull() // cross-user read blocked

    store.renameChat('user-1', chat.id, 'renamed')
    expect(store.getChat('user-1', chat.id).title).toBe('renamed')

    expect(store.deleteChat('user-2', chat.id)).toBe(false) // cross-user delete blocked
    expect(store.deleteChat('user-1', chat.id)).toBe(true)
    expect(store.listChats('user-1')).toHaveLength(0)
  })

  it('appends messages in order, cascades on chat delete, records usage', () => {
    const chat = store.createChat('user-1')
    store.appendMessage('user-1', chat.id, { role: 'user', content: 'hi' })
    store.appendMessage('user-1', chat.id, {
      role: 'assistant', content: 'hello', model: 'claude-sonnet-5', inputTokens: 10, outputTokens: 20
    })

    const messages = store.listMessages('user-1', chat.id)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(store.listMessages('user-2', chat.id)).toBeNull()

    const usage = store.usageSince('user-1', 0)
    expect(usage).toEqual({ inputTokens: 10, outputTokens: 20 })

    store.deleteChat('user-1', chat.id)
    expect(store.usageSince('user-1', 0)).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

// Route handlers captured from a fake router (authRoutes.test.js pattern) —
// no HTTP server needed to test gating and the streaming happy path.
function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers }
  return { routes, get: record('get'), post: record('post'), patch: record('patch'), delete: record('delete') }
}

async function runHandlers(handlers, req) {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    chunks: [],
    ended: false,
    status(code) { this.statusCode = code; return this },
    set(headers) { Object.assign(this.headers, headers); return this },
    json(value) { this.body = value; this.ended = true; return this },
    write(chunk) { this.chunks.push(chunk); return true },
    end() { this.ended = true },
    flushHeaders() {}
  }
  for (const handler of handlers) {
    if (res.ended && res.body !== null) break
    let nextCalled = false
    await handler(req, res, () => { nextCalled = true })
    if (!nextCalled && handler !== handlers[handlers.length - 1]) break
  }
  return res
}

const asUser = (subject, extra = {}) => ({ authState: { subject }, body: {}, params: {}, ...extra })

describe('aiChatRoutes', () => {
  it('rejects guests and anonymous sessions', async () => {
    const router = makeFakeRouter()
    registerAiChatRoutes(router, { streamFn: vi.fn() })

    const guest = await runHandlers(router.routes['get /api/ai/chats'], asUser('guest:abc'))
    expect(guest.statusCode).toBe(403)

    const anonymous = await runHandlers(router.routes['get /api/ai/chats'], { authState: null, body: {}, params: {} })
    expect(anonymous.statusCode).toBe(403)
  })

  it('403s message send when no key is connected and no local claude', async () => {
    const router = makeFakeRouter()
    registerAiChatRoutes(router, { streamFn: vi.fn(), localAvailableFn: () => false })
    const chat = store.createChat('user-1')

    const res = await runHandlers(
      router.routes['post /api/ai/chats/:chatId/messages'],
      asUser('user-1', { params: { chatId: chat.id }, body: { text: 'hello' }, socket: { remoteAddress: '127.0.0.1' } })
    )
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('no-ai-connection')
  })

  it('streams deltas over SSE and persists both turns with usage', async () => {
    const connections = require('./aiConnectionStore.js')
    connections.saveKey('user-1', 'claude', 'sk-ant-test-key', 'test')

    const streamFn = vi.fn(async ({ messages, onDelta }) => {
      expect(messages.at(-1)).toEqual({ role: 'user', content: 'hello' })
      onDelta('hel')
      onDelta('lo back')
      return { text: 'hello back', model: 'claude-sonnet-5', inputTokens: 5, outputTokens: 7, stopReason: 'end_turn' }
    })
    const router = makeFakeRouter()
    registerAiChatRoutes(router, { streamFn })
    const chat = store.createChat('user-1')

    const res = await runHandlers(
      router.routes['post /api/ai/chats/:chatId/messages'],
      asUser('user-1', { params: { chatId: chat.id }, body: { text: 'hello' }, socket: { remoteAddress: '127.0.0.1' } })
    )

    expect(res.headers['Content-Type']).toBe('text/event-stream')
    expect(res.headers['X-Accel-Buffering']).toBe('no')
    const events = res.chunks.join('')
    expect(events).toContain('event: accepted')
    expect(events).toContain('event: delta')
    expect(events).toContain('event: done')

    const messages = store.listMessages('user-1', chat.id)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[1].content).toBe('hello back')
    expect(messages[1].output_tokens).toBe(7)
  })

  it('falls back to the local claude CLI for a loopback operator with no key', async () => {
    const localRunFn = vi.fn(async ({ prompt, resumeSessionId, onDelta }) => {
      onDelta('local says hi')
      return {
        text: 'local says hi',
        model: 'claude (local)',
        sessionId: resumeSessionId || 'cc-session-1',
        inputTokens: 3,
        outputTokens: 4
      }
    })
    const router = makeFakeRouter()
    const previousEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      registerAiChatRoutes(router, { streamFn: vi.fn(), localRunFn, localAvailableFn: () => true })
      const chat = store.createChat('user-1')
      const request = () => asUser('user-1', {
        params: { chatId: chat.id }, body: { text: 'hello' }, socket: { remoteAddress: '127.0.0.1' }
      })

      const res = await runHandlers(router.routes['post /api/ai/chats/:chatId/messages'], request())
      expect(res.chunks.join('')).toContain('local says hi')
      expect(localRunFn).toHaveBeenCalledWith(expect.objectContaining({ resumeSessionId: null }))
      expect(store.getChat('user-1', chat.id).claude_session_id).toBe('cc-session-1')

      // the second turn resumes the Claude Code session
      await runHandlers(router.routes['post /api/ai/chats/:chatId/messages'], request())
      expect(localRunFn).toHaveBeenLastCalledWith(expect.objectContaining({ resumeSessionId: 'cc-session-1' }))

      // a non-loopback caller with no key still gets the 403, never the CLI
      const remote = await runHandlers(
        router.routes['post /api/ai/chats/:chatId/messages'],
        asUser('user-1', { params: { chatId: chat.id }, body: { text: 'hello' }, socket: { remoteAddress: '10.0.0.5' } })
      )
      expect(remote.statusCode).toBe(403)
    } finally {
      process.env.NODE_ENV = previousEnv
    }
  })

  it('reports a rejected key as a reconnect hint, not a bare 500', async () => {
    const connections = require('./aiConnectionStore.js')
    connections.saveKey('user-1', 'claude', 'sk-ant-revoked', 'test')

    const streamFn = vi.fn(async () => {
      throw Object.assign(new Error('invalid x-api-key'), { status: 401 })
    })
    const router = makeFakeRouter()
    registerAiChatRoutes(router, { streamFn })
    const chat = store.createChat('user-1')

    const res = await runHandlers(
      router.routes['post /api/ai/chats/:chatId/messages'],
      asUser('user-1', { params: { chatId: chat.id }, body: { text: 'hello' }, socket: { remoteAddress: '127.0.0.1' } })
    )
    const events = res.chunks.join('')
    expect(events).toContain('event: error')
    expect(events).toContain('reconnect it from your account menu')
  })
})
