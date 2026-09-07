// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerAiChatRoutes } = require('./aiChatRoutes.js')
const { initDb, closeDb } = require('../db.js')
const aiConnectionStore = require('../aiConnectionStore.js')

// Fake router in the style of aiConnectionRoutes.test.js, plus a response
// that records the SSE frames the message route writes.
function makeFakeRouter() {
  const routes = {}
  const record = (method) => (routePath, ...handlers) => { routes[`${method} ${routePath}`] = handlers }
  return { routes, get: record('get'), post: record('post'), patch: record('patch'), delete: record('delete') }
}

function makeRes() {
  let finish
  const ended = new Promise((resolve) => { finish = resolve })
  return {
    statusCode: 200,
    body: null,
    events: [],
    ended,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; finish(); return this },
    set() { return this },
    flushHeaders() {},
    on() {},
    write(chunk) {
      const m = /^event: (\w+)\ndata: (.*)\n\n$/s.exec(chunk)
      if (m) this.events.push({ event: m[1], data: JSON.parse(m[2]) })
    },
    end() { finish() }
  }
}

async function run(handlers, req) {
  const res = makeRes()
  for (let i = 0; i < handlers.length; i += 1) {
    let called = false
    await handlers[i](req, res, () => { called = true })
    if (!called) break
  }
  await res.ended
  return res
}

const localReq = (extra = {}) => ({
  authState: { subject: 'user-1' },
  socket: { remoteAddress: '127.0.0.1' },
  body: {},
  params: {},
  ...extra
})

const streamOk = (model) => vi.fn(async ({ onDelta }) => {
  onDelta('Hel'); onDelta('lo.')
  return { text: 'Hello.', model, inputTokens: 3, outputTokens: 2, stopReason: 'stop' }
})

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb(); vi.restoreAllMocks() })

const setup = (opts) => {
  const router = makeFakeRouter()
  const deps = {
    streamFn: vi.fn(async () => { throw Object.assign(new Error('unexpected anthropic call'), { status: 500 }) }),
    localRunFn: vi.fn(async () => { throw new Error('unexpected local claude call') }),
    localAvailableFn: () => false,
    localModelStreamFn: streamOk('qwen3-4b'),
    localModelFn: () => ({ baseUrl: 'http://127.0.0.1:8090', model: 'qwen3-4b' }),
    ...opts
  }
  registerAiChatRoutes(router, deps)
  return { routes: router.routes, deps }
}

const openChat = async (routes) => {
  const created = await run(routes['post /api/ai/chats'], localReq({ body: { title: 't' } }))
  return created.body.chat.id
}

describe('aiChatRoutes — the model on this machine', () => {
  it('names the local model to the local operator, and to nobody else', async () => {
    const { routes } = setup()
    const here = await run(routes['get /api/ai/providers'], localReq())
    expect(here.body).toEqual({ keyConnected: false, localClaude: false, localModel: { baseUrl: 'http://127.0.0.1:8090', model: 'qwen3-4b' } })
    const elsewhere = await run(routes['get /api/ai/providers'], localReq({ socket: { remoteAddress: '10.0.0.7' } }))
    expect(elsewhere.body.localModel).toBeNull()
  })

  it('answers from the local model when there is no key and no local claude', async () => {
    const { routes, deps } = setup()
    const chatId = await openChat(routes)
    const res = await run(routes['post /api/ai/chats/:chatId/messages'], localReq({ params: { chatId }, body: { text: 'hi' } }))
    expect(deps.localModelStreamFn).toHaveBeenCalledTimes(1)
    expect(deps.streamFn).not.toHaveBeenCalled()
    expect(res.events.map((e) => e.event)).toEqual(['accepted', 'delta', 'delta', 'done'])
    expect(res.events.at(-1).data.assistantMessage).toMatchObject({ role: 'assistant', content: 'Hello.', model: 'qwen3-4b' })
  })

  it('tells the local model its own name, never Claude\'s', async () => {
    const { routes, deps } = setup()
    const chatId = await openChat(routes)
    await run(routes['post /api/ai/chats/:chatId/messages'], localReq({ params: { chatId }, body: { text: 'who are you?' } }))
    const { system } = deps.localModelStreamFn.mock.calls[0][0]
    expect(system).toMatch(/^You are qwen3-4b, running on this machine/)
    expect(system).not.toMatch(/You are Claude/)
    expect(system).toMatch(/di\.iiii holds spaces/)
  })

  it('refuses with no-ai-connection when nothing at all can answer', async () => {
    const { routes } = setup({ localModelFn: () => null })
    const chatId = await openChat(routes)
    const res = await run(routes['post /api/ai/chats/:chatId/messages'], localReq({ params: { chatId }, body: { text: 'hi' } }))
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('no-ai-connection')
  })

  it('falls back to the local model when Claude cannot be reached, with a notice', async () => {
    const offline = Object.assign(new Error('getaddrinfo ENOTFOUND api.anthropic.com'), { code: 'ENOTFOUND' })
    const { routes, deps } = setup({ streamFn: vi.fn(async () => { throw offline }) })
    aiConnectionStore.saveKey('user-1', 'claude', 'sk-ant-test')
    const chatId = await openChat(routes)
    const res = await run(routes['post /api/ai/chats/:chatId/messages'], localReq({ params: { chatId }, body: { text: 'hi' } }))
    expect(deps.streamFn).toHaveBeenCalledTimes(1)
    expect(deps.localModelStreamFn).toHaveBeenCalledTimes(1)
    expect(res.events.map((e) => e.event)).toEqual(['accepted', 'notice', 'delta', 'delta', 'done'])
    expect(res.events[1].data.text).toMatch(/qwen3-4b on this machine/)
    expect(res.events.at(-1).data.assistantMessage.model).toBe('qwen3-4b')
  })

  it('does not fall back when Claude answered and refused the key', async () => {
    const rejected = Object.assign(new Error('invalid x-api-key'), { status: 401 })
    const { routes, deps } = setup({ streamFn: vi.fn(async () => { throw rejected }) })
    aiConnectionStore.saveKey('user-1', 'claude', 'sk-ant-bad')
    const chatId = await openChat(routes)
    const res = await run(routes['post /api/ai/chats/:chatId/messages'], localReq({ params: { chatId }, body: { text: 'hi' } }))
    expect(deps.localModelStreamFn).not.toHaveBeenCalled()
    expect(res.events.at(-1).event).toBe('error')
    expect(res.events.at(-1).data.message).toMatch(/rejected/)
  })

  it('falls back from a local claude that cannot run', async () => {
    const { routes, deps } = setup({
      localAvailableFn: () => true,
      localRunFn: vi.fn(async () => { throw Object.assign(new Error('claude exited 1'), { status: 502 }) })
    })
    const chatId = await openChat(routes)
    const res = await run(routes['post /api/ai/chats/:chatId/messages'], localReq({ params: { chatId }, body: { text: 'hi' } }))
    expect(deps.localRunFn).toHaveBeenCalledTimes(1)
    expect(deps.localModelStreamFn).toHaveBeenCalledTimes(1)
    expect(res.events.map((e) => e.event)).toEqual(['accepted', 'notice', 'delta', 'delta', 'done'])
  })

  it('never hands a half-streamed Claude reply to the local model', async () => {
    const cut = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    const { routes, deps } = setup({ streamFn: vi.fn(async ({ onDelta }) => { onDelta('Half'); throw cut }) })
    aiConnectionStore.saveKey('user-1', 'claude', 'sk-ant-test')
    const chatId = await openChat(routes)
    const res = await run(routes['post /api/ai/chats/:chatId/messages'], localReq({ params: { chatId }, body: { text: 'hi' } }))
    expect(deps.localModelStreamFn).not.toHaveBeenCalled()
    expect(res.events.at(-1).event).toBe('error')
  })
})
