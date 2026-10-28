// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { createSpaceStore } = require('../spaceStore.js')
const { initDb, closeDb } = require('../db.js')
const { createMachineHub } = require('../machines/hub.js')
const { registerJoinCodeDoor, registerFollowManagement } = require('./followRoutes.js')
const { createAttemptLimiter } = require('../joinCodeStore.js')
const { listSyncKeys } = require('../syncKeyStore.js')

const SPACE = 'moxir'
const HERE = { id: 'machine-here', name: 'aylmo' }
const OWNER = { authenticated: true, type: 'session', role: 'editor', subject: 'owner-1', spaces: [SPACE] }
const STRANGER = { authenticated: true, type: 'session', role: 'editor', subject: 'someone-else', spaces: [SPACE] }
const GUEST = { authenticated: true, type: 'guest', role: 'editor', subject: 'guest:abc', spaces: [SPACE] }
const ADMIN = { authenticated: true, type: 'session', role: 'admin', subject: 'admin-1' }

const cleanups = []
beforeEach(() => { initDb(':memory:') })
afterEach(async () => {
    while (cleanups.length) await cleanups.pop()()
    closeDb()
})

const boot = async ({ auth = null, atMachine = true, follows = {}, followStates = [], linkStates = [], limiter, reach } = {}) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-followroutes-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const store = createSpaceStore({ spacesDir: dir, blankScene: { objects: [] } })
    await store.saveSpaceMeta(SPACE, store.buildMeta(SPACE, { ownerUserId: 'owner-1' }))
    const hub = createMachineHub()
    const state = { follows: { ...follows }, removed: [], changed: 0 }
    const app = express()
    app.use(express.json())
    app.use((req, res, next) => { req.authState = auth || { authenticated: true, type: 'disabled', role: 'admin', subject: 'auth-disabled' }; next() })
    const router = express.Router()
    // The route's `:spaceId` is the canonical id in production (router.param); here it already is.
    registerJoinCodeDoor(router, {
        machine: () => HERE,
        describeSpace: async (id) => (id === SPACE ? { label: 'MOXIR', projects: 16 } : null),
        limiter: limiter || createAttemptLimiter({ perClient: 4, overall: 50 })
    })
    registerFollowManagement(router, {
        requireAuth: () => Boolean(auth),
        atTheMachine: () => atMachine,
        isOwnerOrAdmin: (s, meta) => s.role === 'admin' || (s.type === 'session' && meta.ownerUserId === s.subject),
        isAdmin: (s) => s.role === 'admin',
        loadSpaceMeta: async (id) => store.loadSpaceMeta(id),
        machine: () => HERE,
        hub,
        followStates: () => followStates,
        linkStates: () => linkStates,
        readFollows: () => state.follows,
        addFollow: async (_dir, id, entry) => { state.follows[id] = entry },
        removeFollow: async (_dir, id) => { const had = Boolean(state.follows[id]); delete state.follows[id]; if (had) state.removed.push(id); return { removed: had } },
        dataDir: () => dir,
        reach: reach || (() => ({ lan: true, urls: ['http://192.168.1.9:3000'] })),
        spaceExistsHere: async () => false,
        ensureSpace: async () => {},
        followsChanged: () => { state.changed += 1 }
    })
    app.use(router)
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    cleanups.push(() => new Promise((resolve) => server.close(resolve)))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = async (method, route, body) => {
        const response = await fetch(`${base}${route}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
        return { status: response.status, body: await response.json().catch(() => null) }
    }
    return { call, hub, state }
}

describe('the join code door (anonymous: the code is the credential)', () => {
    it('peek says what is behind a live code and spends nothing; redeem spends it and returns the key once', async () => {
        const { call } = await boot()
        const issued = (await call('POST', `/api/spaces/${SPACE}/join-codes`)).body
        const peek = await call('POST', '/api/join-codes/peek', { code: issued.code })
        expect(peek).toMatchObject({ status: 200, body: { spaceId: SPACE, label: 'MOXIR', projects: 16, machine: HERE } })
        expect(JSON.stringify(peek.body)).not.toContain('dii_sync_')
        expect((await call('POST', '/api/join-codes/peek', { code: issued.code })).status).toBe(200)

        const redeemed = await call('POST', '/api/join-codes/redeem', { code: issued.code, machine: { name: 'ponyo' } })
        expect(redeemed.status).toBe(201)
        expect(redeemed.body.token.startsWith('dii_sync_')).toBe(true)
        expect(listSyncKeys(SPACE)).toHaveLength(1)

        const again = await call('POST', '/api/join-codes/redeem', { code: issued.code })
        expect(again.status).toBe(404)
        expect(again.body.code).toBe('invalid-code')
    })

    it('answers an unknown code and a used one the same way', async () => {
        const { call } = await boot()
        const issued = (await call('POST', `/api/spaces/${SPACE}/join-codes`)).body
        await call('POST', '/api/join-codes/redeem', { code: issued.code })
        const used = await call('POST', '/api/join-codes/peek', { code: issued.code })
        const wrong = await call('POST', '/api/join-codes/peek', { code: 'acid acorn acre acts' })
        expect(used).toEqual(wrong)
    })

    it('stops guessing: after the allowance every attempt is 429 with a Retry-After, right codes too', async () => {
        const { call } = await boot({ limiter: createAttemptLimiter({ perClient: 3, overall: 50 }) })
        const issued = (await call('POST', `/api/spaces/${SPACE}/join-codes`)).body
        for (let i = 0; i < 3; i += 1) expect((await call('POST', '/api/join-codes/redeem', { code: 'acid acorn acre acts' })).status).toBe(404)
        const blocked = await call('POST', '/api/join-codes/redeem', { code: issued.code })
        expect(blocked.status).toBe(429)
        expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0)
        expect(listSyncKeys(SPACE)).toHaveLength(0)
    })
})

describe('managing sync (owner or admin; on an install without auth, the person at the machine)', () => {
    it('lets the space owner and an admin make a code; refuses a stranger, a guest and a sync key', async () => {
        for (const [who, expected] of [[OWNER, 201], [ADMIN, 201], [STRANGER, 403], [GUEST, 403], [{ authenticated: true, type: 'sync-key', role: 'editor', subject: 'sync-key:k' }, 403]]) {
            const { call } = await boot({ auth: who })
            expect((await call('POST', `/api/spaces/${SPACE}/join-codes`)).status, who.type + who.subject).toBe(expected)
        }
    })

    it('does not tell a visitor anything about the follow — 403 with auth, 404 without it when not at the machine', async () => {
        const follow = { remote: 'http://ponyo/serverXR', token: 'dii_sync_x.y', followedAt: 'now' }
        const guarded = await boot({ auth: STRANGER, follows: { [SPACE]: follow } })
        expect((await guarded.call('GET', `/api/spaces/${SPACE}/sync`)).status).toBe(403)
        const open = await boot({ atMachine: false, follows: { [SPACE]: follow } })
        const seen = await open.call('GET', `/api/spaces/${SPACE}/sync`)
        expect(seen.status).toBe(404)
        expect(JSON.stringify(seen.body)).not.toContain('ponyo')
        // …and every changing route is closed the same way.
        expect((await open.call('POST', `/api/spaces/${SPACE}/join-codes`)).status).toBe(404)
        expect((await open.call('DELETE', `/api/spaces/${SPACE}/follow`)).status).toBe(404)
        expect((await open.call('POST', '/api/follows/join', { address: 'x', code: 'y' })).status).toBe(404)
        expect(open.state.follows[SPACE]).toBeTruthy()
    })

    it('reports the follow, the followers and the live code — and never the key', async () => {
        const follow = { remote: 'http://ponyo:3000/serverXR', token: 'dii_sync_SECRET.KEY', followedAt: '2026-10-01T04:43:00Z' }
        const states = [{ spaceId: SPACE, status: 'following', hostAnswering: true, lastAnswerAt: 10, latencyMs: 90, converged: 1, convergedAt: [5], files: { pending: 2, failed: 0, carried: 3, bytesPending: 1 } }]
        const { call, hub } = await boot({ follows: { [SPACE]: follow }, followStates: states, linkStates: [{ spaceId: SPACE, host: { id: 'h', name: 'ponyo' } }] })
        hub.noteFollower(SPACE, 'machine-bbbb', 'asuz')
        await call('POST', `/api/spaces/${SPACE}/join-codes`)
        const { status, body } = await call('GET', `/api/spaces/${SPACE}/sync`)
        expect(status).toBe(200)
        expect(body.follows).toMatchObject({ host: { name: 'ponyo' }, status: 'following', latencyMs: 90, clashes: 1, files: { pending: 2 } })
        expect(body.followers).toMatchObject([{ machineId: 'machine-bbbb', name: 'asuz' }])
        expect(body.code.id).toBeTruthy()
        expect(JSON.stringify(body)).not.toContain('SECRET')
        // The words are shown once, to the person who asked, and are not kept to be re-read.
        expect(JSON.stringify(body)).not.toMatch(/words|"code":"/)
    })

    it('a code response says what to type on the other machine, and says so when nothing can reach this one', async () => {
        const lan = await boot()
        const first = (await lan.call('POST', `/api/spaces/${SPACE}/join-codes`)).body
        expect(first).toMatchObject({ ttlSeconds: 600, addresses: ['http://192.168.1.9:3000'], lan: true, machine: 'aylmo' })
        expect(first.code).toMatch(/^[A-Z]+ · [A-Z]+ · [A-Z]+ · [A-Z]+$/)
        const shut = await boot({ reach: () => ({ lan: false, urls: [] }) })
        expect((await shut.call('POST', `/api/spaces/${SPACE}/join-codes`)).body).toMatchObject({ lan: false, addresses: [] })
    })

    it('revokes an unused code, and refuses to revoke one that is used', async () => {
        const { call } = await boot()
        const one = (await call('POST', `/api/spaces/${SPACE}/join-codes`)).body
        expect((await call('DELETE', `/api/spaces/${SPACE}/join-codes/${one.id}`)).status).toBe(200)
        expect((await call('POST', '/api/join-codes/redeem', { code: one.code })).status).toBe(404)
        const two = (await call('POST', `/api/spaces/${SPACE}/join-codes`)).body
        await call('POST', '/api/join-codes/redeem', { code: two.code })
        expect((await call('DELETE', `/api/spaces/${SPACE}/join-codes/${two.id}`)).status).toBe(404)
    })

    it('stop following forgets the follow and starts nothing new — and a space not followed answers 404', async () => {
        const { call, state } = await boot({ follows: { [SPACE]: { remote: 'http://ponyo', token: 't' } } })
        expect((await call('DELETE', `/api/spaces/${SPACE}/follow`)).status).toBe(200)
        expect(state.removed).toEqual([SPACE])
        expect(state.changed).toBe(1)
        expect((await call('DELETE', `/api/spaces/${SPACE}/follow`)).status).toBe(404)
    })

    it('joining needs an admin when auth is on, and refuses a missing code or address with words', async () => {
        const stranger = await boot({ auth: STRANGER })
        expect((await stranger.call('POST', '/api/follows/join', { address: 'http://x', code: 'a b c d' })).status).toBe(403)
        const admin = await boot({ auth: ADMIN })
        const bad = await admin.call('POST', '/api/follows/join', { address: '', code: 'a b c d' })
        expect(bad.status).toBe(400)
        expect(bad.body.reason).toBe('bad-address')
        expect(bad.body.error).toMatch(/not an address/)
    })
})
