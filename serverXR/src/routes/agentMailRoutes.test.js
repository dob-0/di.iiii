// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('../db.js')
const { registerAgentMailRoutes } = require('./agentMailRoutes.js')

const makeRouter = () => {
    const routes = {}
    const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers.at(-1) }
    return { routes, get: record('get'), post: record('post') }
}
const makeRes = () => ({
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this },
    set(k, v) { this.headers[k] = v; return this },
    json(payload) { this.body = payload; return this }
})

const people = {
    ana: { id: 'ana', username: 'ana', spaces: ['s1'] },
    kiara: { id: 'kiara', username: 'kiara', spaces: ['s1', 's2'] },
    eter: { id: 'eter', username: 'eter', spaces: ['s2'] },
    stranger: { id: 'stranger', username: 'sam', spaces: ['x'] },
    stranger2: { id: 'stranger2', username: 'sue', spaces: ['y'] }
}
for (const n of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) people[n] = { id: n, username: n, spaces: [`z-${n}`] }

let router
beforeEach(() => {
    initDb(':memory:')
    router = makeRouter()
    registerAgentMailRoutes(router, {
        deps: { users: { findUserById: (id) => people[id] || null, listUsers: () => Object.values(people) } }
    })
})
afterEach(() => closeDb())

const as = (id) => ({ authenticated: true, type: 'session', subject: id, spaces: people[id]?.spaces || [] })
const call = async (route, { user, body = {}, query = {}, params = {} } = {}) => {
    const res = makeRes()
    await router.routes[route]({ authState: user ? as(user) : null, body, query, params }, res)
    return res
}
const send = (from, to, body = 'hello', extra = {}) => call('post /api/agent-mail', { user: from, body: { to, body, ...extra } })

describe('signed in only', () => {
    it('answers 401 to nobody, a guest and a bare token on every route', async () => {
        for (const route of ['post /api/agent-mail', 'get /api/agent-mail/inbox', 'post /api/agent-mail/:id/read', 'get /api/agent-mail/contacts', 'post /api/agent-mail/contacts']) {
            for (const authState of [null, { authenticated: true, type: 'session', subject: 'guest:abc' }, { authenticated: true, type: 'token', subject: 'api' }]) {
                const res = makeRes()
                await router.routes[route]({ authState, body: {}, query: {}, params: {} }, res)
                expect(res.statusCode).toBe(401)
            }
        }
    })
})

describe('people who share a space', () => {
    it('deliver directly, with the agent name, and mark read', async () => {
        const sent = await send('ana', 'kiara', 'the scene is ready', { fromAgent: 'ana-laptop', toAgent: 'main' })
        expect(sent.statusCode).toBe(201)
        expect(sent.body.status).toBe('delivered')
        const box = await call('get /api/agent-mail/inbox', { user: 'kiara', query: { unread: '1' } })
        expect(box.body.messages).toHaveLength(1)
        expect(box.body.messages[0]).toMatchObject({ from: 'ana', fromAgent: 'ana-laptop', toAgent: 'main', body: 'the scene is ready' })
        expect(box.body.requests).toEqual([])
        const read = await call('post /api/agent-mail/:id/read', { user: 'kiara', params: { id: sent.body.id } })
        expect(read.body.message.readAt).toBeTypeOf('number')
        const again = await call('get /api/agent-mail/inbox', { user: 'kiara', query: { unread: '1' } })
        expect(again.body.messages).toHaveLength(0)
    })

    it('only the recipient can read a message', async () => {
        const sent = await send('ana', 'kiara')
        const res = await call('post /api/agent-mail/:id/read', { user: 'eter', params: { id: sent.body.id } })
        expect(res.statusCode).toBe(404)
    })

    it('strips control characters, refuses empty and over-long bodies, refuses an email as recipient', async () => {
        const sent = await send('ana', 'kiara', 'a\u001b[31mb\u0000c\nd')
        const box = await call('get /api/agent-mail/inbox', { user: 'kiara' })
        expect(box.body.messages[0].body).toBe('a[31mbc\nd')
        expect((await send('ana', 'kiara', '  \u0001 ')).statusCode).toBe(400)
        const long = await send('ana', 'kiara', 'x'.repeat(4001))
        expect(long.statusCode).toBe(400)
        expect(long.body.max).toBe(4000)
        expect((await send('ana', 'kiara@example.org')).statusCode).toBe(404)
        expect(sent.statusCode).toBe(201)
    })
})

describe('a stranger', () => {
    it('lands one request, shown separately with a capped preview, then is refused until allowed', async () => {
        const first = await send('stranger', 'ana', 'y'.repeat(900))
        expect(first.statusCode).toBe(201)
        expect(first.body.status).toBe('request_sent')
        const box = await call('get /api/agent-mail/inbox', { user: 'ana' })
        expect(box.body.messages).toEqual([])
        expect(box.body.requests).toHaveLength(1)
        expect(box.body.requests[0].from).toBe('sam')
        expect(box.body.requests[0].preview.length).toBeLessThanOrEqual(201)

        const second = await send('stranger', 'ana', 'hello??')
        expect(second.statusCode).toBe(409)
        expect(second.body.error).toBe('request_pending')

        const held = await call('post /api/agent-mail/:id/read', { user: 'ana', params: { id: first.body.id } })
        expect(held.statusCode).toBe(409)

        const allow = await call('post /api/agent-mail/contacts', { user: 'ana', body: { user: 'sam', state: 'allowed' } })
        expect(allow.statusCode).toBe(200)
        const after = await call('get /api/agent-mail/inbox', { user: 'ana' })
        expect(after.body.messages).toHaveLength(1)
        expect(after.body.requests).toEqual([])
        expect((await send('stranger', 'ana', 'thanks')).statusCode).toBe(201)
    })

    it('is let through when the receiver answers', async () => {
        const first = await send('stranger', 'ana', 'hi')
        const reply = await send('ana', 'sam', 'hi back', { replyTo: first.body.id })
        expect(reply.statusCode).toBe(201)
        expect(reply.body.threadId).toBe(first.body.threadId)
        expect((await send('stranger', 'ana', 'and more')).statusCode).toBe(201)
    })

    it('blocked: 403 with nothing about the receiver, and the held request is gone', async () => {
        await send('stranger', 'ana', 'hi')
        await call('post /api/agent-mail/contacts', { user: 'ana', body: { user: 'sam', state: 'blocked' } })
        const res = await send('stranger', 'ana', 'again')
        expect(res.statusCode).toBe(403)
        expect(res.body).toEqual({ error: 'blocked' })
        const box = await call('get /api/agent-mail/inbox', { user: 'ana' })
        expect(box.body.requests).toEqual([])
        // A blocked space-mate is blocked too.
        await call('post /api/agent-mail/contacts', { user: 'kiara', body: { user: 'ana', state: 'blocked' } })
        expect((await send('ana', 'kiara')).statusCode).toBe(403)
        const list = await call('get /api/agent-mail/contacts', { user: 'kiara' })
        expect(list.body.contacts).toMatchObject([{ user: 'ana', state: 'blocked' }])
    })

    it('contacts take only allowed or blocked, and a known person', async () => {
        expect((await call('post /api/agent-mail/contacts', { user: 'ana', body: { user: 'sam', state: 'maybe' } })).statusCode).toBe(400)
        expect((await call('post /api/agent-mail/contacts', { user: 'ana', body: { user: 'nobody', state: 'allowed' } })).statusCode).toBe(404)
    })
})

describe('rate limits', () => {
    it('30 messages an hour per sender, then 429 with Retry-After', async () => {
        for (let i = 0; i < 30; i += 1) expect((await send('ana', 'kiara', `m${i}`)).statusCode).toBe(201)
        const res = await send('ana', 'kiara', 'one too many')
        expect(res.statusCode).toBe(429)
        expect(res.headers['Retry-After']).toBeDefined()
        // another sender is unaffected
        expect((await send('eter', 'kiara')).statusCode).toBe(201)
    })

    it('5 new strangers a day, then 429', async () => {
        for (const n of ['r1', 'r2', 'r3', 'r4', 'r5']) expect((await send('stranger2', n)).statusCode).toBe(201)
        expect((await send('stranger2', 'r6')).statusCode).toBe(429)
        // a person they share a space with is not a new stranger
        people.stranger2.spaces = ['y', 'z-r6']
        people.r6.spaces = ['z-r6', 'y']
        expect((await send('stranger2', 'r6')).statusCode).toBe(201)
    })
})
