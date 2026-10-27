// @vitest-environment node
// Security review of PR #811, ROUND 3 (independent reviewer). LOCAL ONLY — never pushed.
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
const COOKIE = 'dii_serverxr_session'
const servers = []

const start = async (extraEnv, ownerId) => {
    const sb = { cwd: await mkdtemp(path.join(os.tmpdir(), 'dii-r3-cwd-')), data: await mkdtemp(path.join(os.tmpdir(), 'dii-r3-data-')) }
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY, cwd: sb.cwd,
        env: { ...process.env, NODE_ENV: 'test', APP_BASE_PATH: '/serverXR', DATA_ROOT: sb.data, REQUIRE_AUTH: 'true',
            AUTH_SESSION_COOKIE_SECURE: 'false', AUTH_HUB_URL: 'off', CORS_ORIGINS: '*', DI_LOCAL: '', AUTH_SESSION_SECRET: '', ...extraEnv }
    })
    const db = new DatabaseSync(path.join(sb.data, 'di.db'))
    const now = Date.now()
    db.prepare('INSERT INTO users (id, provider, provider_id, email, display_name, role, spaces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(ownerId, 'github', ownerId, `${ownerId}@example.com`, 'Owner', 'editor', '[]', now, now)
    db.close()
    const s = { baseUrl: `http://127.0.0.1:${port}/serverXR`, child, sb }
    servers.push(s)
    return s
}
const call = async (s, route, { method = 'GET', body = null, token = null, cookie = null } = {}) => {
    const r = await fetch(`${s.baseUrl}${route}`, { method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const m = (r.headers.get('set-cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`))
    return { status: r.status, payload: await r.json().catch(() => null), cookie: m && m[1] ? `${COOKIE}=${m[1]}` : null }
}
const cookieFor = (secret, subject, extra = {}) => `${COOKIE}=${createAuthSessionValue({ secret, session: { subject, label: 'Owner', role: 'editor', spaces: [], tokenVersion: 0, via: 'signin', ...extra } }).value}`

afterAll(async () => {
    for (const s of servers) {
        if (s.child.exitCode === null) { s.child.kill('SIGTERM'); await new Promise(r => s.child.once('exit', r)) }
        await rm(s.sb.cwd, { recursive: true, force: true }); await rm(s.sb.data, { recursive: true, force: true })
    }
})

describe('R3-1 (R2-C): no AUTH_SESSION_SECRET apart from the token', () => {
    it('a session forged with the token as the cookie key, stamped signin, for the real owner, mints no manage key', async () => {
        const TOKEN = 'r3-shared-token-and-cookie-key'
        const s = await start({ API_TOKEN: TOKEN }, 'owner-r3a')
        const owner = cookieFor(TOKEN, 'owner-r3a') // forged by whoever holds the token
        const made = await call(s, '/api/spaces', { method: 'POST', cookie: owner, body: { slug: 'r3a-space', label: 'x' } })
        expect(made.status, JSON.stringify(made.payload)).toBe(201)
        const minted = await call(s, '/api/spaces/r3a-space/sync-keys', { method: 'POST', cookie: made.cookie || owner, body: { label: 'm', manage: true } })
        expect(minted.status, JSON.stringify(minted.payload)).toBe(403)
        expect(minted.payload.code).toBe('manage_needs_session_secret')
        // and AUTH_SESSION_SECRET set but EQUAL to a token is the same case
    })
    it('AUTH_SESSION_SECRET set to the same value as the token is refused too', async () => {
        const TOKEN = 'r3-equal-token'
        const s = await start({ API_TOKEN: TOKEN, AUTH_SESSION_SECRET: TOKEN }, 'owner-r3b')
        const owner = cookieFor(TOKEN, 'owner-r3b')
        const made = await call(s, '/api/spaces', { method: 'POST', cookie: owner, body: { slug: 'r3b-space', label: 'x' } })
        expect(made.status).toBe(201)
        const minted = await call(s, '/api/spaces/r3b-space/sync-keys', { method: 'POST', cookie: made.cookie || owner, body: { label: 'm', manage: true } })
        expect(minted.status).toBe(403)
    })
})

describe('R3-2 (R2-A): a static token scoped to the destination counts as a newcomer', () => {
    it('refuses the key move', async () => {
        const SECRET = 'r3-separate-secret'
        const s = await start({ API_TOKEN: 'r3-admin', AUTH_SESSION_SECRET: SECRET,
            AUTH_IDENTITIES: JSON.stringify([{ token: 'r3-viewer-of-dst', role: 'viewer', subject: 'kiosk', spaces: ['r3-dst'] }]) }, 'owner-r3c')
        let owner = cookieFor(SECRET, 'owner-r3c')
        for (const id of ['r3-src', 'r3-dst']) {
            const made = await call(s, '/api/spaces', { method: 'POST', cookie: owner, body: { slug: id, label: id } })
            expect(made.status, JSON.stringify(made.payload)).toBe(201)
            owner = made.cookie || owner
        }
        const p = (await call(s, '/api/spaces/r3-src/projects', { method: 'POST', token: 'r3-admin', body: { slug: 'r3-diary', title: 'd' } })).payload.project
        expect((await call(s, `/api/projects/${p.id}`, { method: 'PATCH', cookie: owner, body: { visibility: 'private' } })).status).toBe(200)
        const kS = (await call(s, '/api/spaces/r3-src/sync-keys', { method: 'POST', cookie: owner, body: { label: 's', manage: true } }))
        expect(kS.status, JSON.stringify(kS.payload)).toBe(201)
        const kD = (await call(s, '/api/spaces/r3-dst/sync-keys', { method: 'POST', cookie: owner, body: { label: 'd', manage: true } }))
        const moved = await call(s, `/api/projects/${p.id}/move`, { method: 'POST', token: kS.payload.token, body: { toSpace: 'r3-dst', alsoSyncKey: kD.payload.token } })
        expect(moved.status, JSON.stringify(moved.payload)).toBe(403)
        expect(moved.payload.error).toMatch(/token/)
        // control: the kiosk token can read the destination's private projects, so the refusal is real
        expect((await call(s, `/api/projects/${p.id}`, { token: 'r3-viewer-of-dst' })).status).toBe(404)
    })
})
