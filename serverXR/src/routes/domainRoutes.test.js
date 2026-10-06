// @vitest-environment node

// Over real HTTP, so the host a request carries is the host the route reads —
// the whole feature turns on that one header.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const express = require('express')
const { initDb, closeDb, getDb } = require('../db.js')
const store = require('../domainStore.js')
const { createDomainService } = require('../domainService.js')
const { registerDomainRoutes } = require('./domainRoutes.js')

const SPACES = {
    taronx: { id: 'taronx', label: 'taronx', isPublic: true, ownerUserId: 'taron' },
    hidden: { id: 'hidden', label: 'hidden', isPublic: false, ownerUserId: 'taron' }
}

let server
let base

const boot = async () => {
    const app = express()
    app.set('trust proxy', 'loopback')
    app.use(express.json())
    // Who is asking, from a test header — the real server derives it from the session.
    app.use((req, res, next) => { req.authState = { type: 'session', subject: req.get('x-test-user') || null, role: 'editor' }; next() })
    const router = express.Router()
    registerDomainRoutes(router, {
        domains: createDomainService({ cloudflare: null, platformSuffixes: ['diiii.xyz'], logger: { info() {}, warn() {} } }),
        findActiveSpaceIdForHost: store.findActiveSpaceIdForHost,
        loadSpaceMeta: async (id) => SPACES[id] || null,
        normalizeSpaceId: (id) => id,
        // The real guard's rule (index.js isSpaceOwnerOrAdminState), reduced to its decision.
        requireSpaceOwnerOrAdminWrite: (req, res, next) => {
            const meta = SPACES[req.params.spaceId]
            if (!meta) return res.status(404).json({ error: 'Space not found.' })
            if (meta.ownerUserId !== req.authState.subject) return res.status(403).json({ error: 'owner only' })
            req.spaceMeta = meta
            next()
        },
        platformOrigin: 'https://diiii.xyz',
        config: { requireAuth: true }
    })
    app.use('/serverXR', router)
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${server.address().port}/serverXR`
}

const call = (path, { method = 'GET', host, user, body } = {}) => fetch(`${base}${path}`, {
    method,
    headers: {
        ...(host ? { 'x-forwarded-host': host } : {}),
        ...(user ? { 'x-test-user': user } : {}),
        ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
}).then(async (res) => ({ status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }))

beforeEach(async () => {
    initDb(':memory:')
    const now = Date.now()
    for (const id of Object.keys(SPACES)) {
        getDb().prepare('INSERT INTO spaces (id, label, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?)').run(id, id, now, now, now)
    }
    await boot()
})
afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    closeDb()
})

describe('GET /api/host', () => {
    it('names the space a live domain shows', async () => {
        store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'taronx', state: 'active' })
        const res = await call('/api/host', { host: 'yokozo.xyz' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ hostname: 'yokozo.xyz', space: { id: 'taronx', slug: null, label: 'taronx' }, platformOrigin: 'https://diiii.xyz' })
        expect(res.cache).toBe('public, max-age=60')
    })

    it('answers null for the platform’s own host, a domain not live yet, and a private space', async () => {
        store.insertDomain({ hostname: 'pending.xyz', spaceId: 'taronx', state: 'pending' })
        store.insertDomain({ hostname: 'secret.xyz', spaceId: 'hidden', state: 'active' })
        for (const host of ['diiii.xyz', 'pending.xyz', 'secret.xyz']) {
            expect((await call('/api/host', { host })).body.space, host).toBe(null)
        }
    })
})

describe('the owner’s routes', () => {
    it('only the owner can add, and gets the domain back with its state', async () => {
        expect((await call('/api/spaces/taronx/domains', { method: 'POST', user: 'stranger', body: { hostname: 'yokozo.xyz' } })).status).toBe(403)
        const added = await call('/api/spaces/taronx/domains', { method: 'POST', user: 'taron', body: { hostname: 'yokozo.xyz' } })
        expect(added.status).toBe(201)
        expect(added.body.domain).toMatchObject({ hostname: 'yokozo.xyz', state: 'unmanaged', connected: false })
        const listed = await call('/api/spaces/taronx/domains', { user: 'taron' })
        expect(listed.body).toMatchObject({ connected: false, domains: [{ hostname: 'yokozo.xyz' }] })
        expect((await call('/api/spaces/taronx/domains', { user: 'stranger' })).status).toBe(403)
    })

    it('says why a domain is refused', async () => {
        const bad = await call('/api/spaces/taronx/domains', { method: 'POST', user: 'taron', body: { hostname: 'not a domain' } })
        expect(bad).toMatchObject({ status: 400, body: { error: 'invalid_hostname' } })
        const ours = await call('/api/spaces/taronx/domains', { method: 'POST', user: 'taron', body: { hostname: 'dev.diiii.xyz' } })
        expect(ours).toMatchObject({ status: 400, body: { error: 'platform_hostname' } })
        const priv = await call('/api/spaces/hidden/domains', { method: 'POST', user: 'taron', body: { hostname: 'x.xyz' } })
        expect(priv).toMatchObject({ status: 409, body: { error: 'space_not_public' } })
    })

    it('marking live by hand is for an admin only', async () => {
        await call('/api/spaces/taronx/domains', { method: 'POST', user: 'taron', body: { hostname: 'yokozo.xyz' } })
        const res = await call('/api/spaces/taronx/domains/yokozo.xyz/check', { method: 'POST', user: 'taron', body: { state: 'active' } })
        expect(res.status).toBe(403)
        expect(store.findActiveSpaceIdForHost('yokozo.xyz')).toBe(null)
    })

    it('removing a domain stops it showing the space at once', async () => {
        store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'taronx', state: 'active' })
        expect((await call('/api/host', { host: 'yokozo.xyz' })).body.space.id).toBe('taronx')
        const res = await call('/api/spaces/taronx/domains/yokozo.xyz', { method: 'DELETE', user: 'taron' })
        expect(res.body).toEqual({ removed: 'yokozo.xyz' })
        expect((await call('/api/host', { host: 'yokozo.xyz' })).body.space).toBe(null)
    })
})
