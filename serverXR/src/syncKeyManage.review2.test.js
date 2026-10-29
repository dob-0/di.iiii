// @vitest-environment node
// The independent security review of PR #811, round 2 (2026-10-07), kept as a
// guard, unchanged. Each test asserts the SECURE behaviour; on the reviewed
// head two failed (R2-A: a key move into a repointed communal space; R2-B: the
// token mark lost on the session re-sync) and one passed.

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

const require = createRequire(import.meta.url)
const { createAuthSessionValue } = require('./authSession.js')
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const SERVER_ENTRY = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'src/index.js')
const ADMIN_TOKEN = 'sec811r2-admin-token'
const SESSION_SECRET = 'sec811r2-session-secret'
const COOKIE = 'dii_serverxr_session'
// The operator attributes the admin token to his own account (a real users row).
const OPERATOR_ID = 'operator-account-811'

let server = null
let sandbox = null

const call = async (route, { method = 'GET', body = null, token = null, cookie = null } = {}) => {
    const response = await fetch(`${server.baseUrl}${route}`, {
        method,
        headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cookie ? { Cookie: cookie } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    })
    const m = (response.headers.get('set-cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`))
    return { status: response.status, payload: await response.json().catch(() => null), cookie: m && m[1] ? `${COOKIE}=${m[1]}` : null }
}
const asAdmin = (route, o = {}) => call(route, { ...o, token: ADMIN_TOKEN })

beforeAll(async () => {
    sandbox = { cwd: await mkdtemp(path.join(os.tmpdir(), 'dii-r2-cwd-')), data: await mkdtemp(path.join(os.tmpdir(), 'dii-r2-data-')) }
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY,
        cwd: sandbox.cwd,
        env: {
            ...process.env, NODE_ENV: 'test', APP_BASE_PATH: '/serverXR', DATA_ROOT: sandbox.data,
            API_TOKEN: ADMIN_TOKEN, API_TOKEN_SUBJECT: OPERATOR_ID, REQUIRE_AUTH: 'true',
            AUTH_SESSION_SECRET: SESSION_SECRET, AUTH_SESSION_COOKIE_SECURE: 'false',
            AUTH_HUB_URL: 'off', CORS_ORIGINS: '*', DI_LOCAL: ''
        }
    })
    server = { baseUrl: `http://127.0.0.1:${port}/serverXR`, child }
    const db = new DatabaseSync(path.join(sandbox.data, 'di.db'))
    const now = Date.now()
    db.prepare('INSERT INTO users (id, provider, provider_id, email, display_name, role, spaces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(OPERATOR_ID, 'github', OPERATOR_ID, 'op@example.com', 'Operator', 'admin', '["somewhere"]', now, now)
    db.close()
})

afterAll(async () => {
    if (server?.child && server.child.exitCode === null) {
        server.child.kill('SIGTERM')
        await new Promise(resolve => server.child.once('exit', resolve))
    }
    if (sandbox) {
        await rm(sandbox.cwd, { recursive: true, force: true })
        await rm(sandbox.data, { recursive: true, force: true })
    }
})

describe('R2-A: a key move into the communal (guest) space when it is a repointed normal space', () => {
    it('is refused, and no guest can then read the private project', async () => {
        const ra = await call('/api/auth/password/register', { method: 'POST', body: { username: 'alicer2', password: 'alice-long-password-r2' } })
        expect(ra.status).toBe(201)
        let alice = ra.cookie
        for (const id of ['al-src', 'al-dst']) {
            const made = await call('/api/spaces', { method: 'POST', cookie: alice, body: { slug: id, label: id } })
            expect(made.status, JSON.stringify(made.payload)).toBe(201)
            alice = made.cookie || alice
        }
        const p = (await asAdmin('/api/spaces/al-src/projects', { method: 'POST', body: { slug: 'diary-r2', title: 'diary' } })).payload.project
        expect((await call(`/api/projects/${p.id}`, { method: 'PATCH', cookie: alice, body: { visibility: 'private' } })).status).toBe(200)
        // An admin points the communal open space at an existing normal space (configRoutes.js).
        const cfg = await asAdmin('/api/config', { method: 'PATCH', body: { globalSpaceId: 'al-dst' } })
        expect(cfg.status, JSON.stringify(cfg.payload)).toBe(200)
        const kSrc = (await call('/api/spaces/al-src/sync-keys', { method: 'POST', cookie: alice, body: { label: 's', manage: true } })).payload.token
        const kDst = (await call('/api/spaces/al-dst/sync-keys', { method: 'POST', cookie: alice, body: { label: 'd', manage: true } })).payload.token
        const moved = await call(`/api/projects/${p.id}/move`, { method: 'POST', token: kSrc, body: { toSpace: 'al-dst', alsoSyncKey: kDst } })
        const guest = await call('/api/auth/session')
        const seen = await call(`/api/projects/${p.id}`, { cookie: guest.cookie })
        expect({ move: moved.status, guestRead: seen.status, guestSpaces: guest.payload?.spaces }, JSON.stringify(moved.payload)).toEqual({ move: 403, guestRead: 404, guestSpaces: guest.payload?.spaces })
    })
})

describe('R2-B: the via:token mark on a session made from a token', () => {
    it('survives the GET /api/auth/session re-sync, so the cookie still cannot mint a manage key', async () => {
        const made = await call('/api/auth/session', { method: 'POST', body: { token: ADMIN_TOKEN } })
        expect(made.status).toBe(200)
        expect((await call('/api/spaces', { method: 'POST', token: ADMIN_TOKEN, body: { slug: 'op-space', label: 'op', permanent: true } })).status).toBe(201)
        const direct = await call('/api/spaces/op-space/sync-keys', { method: 'POST', cookie: made.cookie, body: { label: 'x', manage: true } })
        expect(direct.status).toBe(403) // the mark works on the cookie as minted
        const resync = await call('/api/auth/session', { cookie: made.cookie })
        const cookie = resync.cookie || made.cookie
        const minted = await call('/api/spaces/op-space/sync-keys', { method: 'POST', cookie, body: { label: 'y', manage: true } })
        expect({ reissued: Boolean(resync.cookie), mint: minted.status }).toEqual({ reissued: Boolean(resync.cookie), mint: 403 })
    })

    it('survives the stale-cookie refresh (refreshSessionCookieIfStale)', async () => {
        const stale = `${COOKIE}=${createAuthSessionValue({ secret: SESSION_SECRET, ttlMs: 60_000, session: { subject: OPERATOR_ID, label: 'Admin', role: 'admin', spaces: ['somewhere'], via: 'token' } }).value}`
        const refreshed = await call('/api/spaces/op-space', { cookie: stale })
        expect(refreshed.cookie).toBeTruthy()
        const minted = await call('/api/spaces/op-space/sync-keys', { method: 'POST', cookie: refreshed.cookie, body: { label: 'z', manage: true } })
        expect(minted.status).toBe(403)
    })
})
