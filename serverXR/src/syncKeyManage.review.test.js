// @vitest-environment node
//
// The independent security review of PR #811 (2026-10-07), kept as a guard.
// Each test asserts the SECURE behaviour; on the reviewed commit five failed
// (C1 twice, H1, M1, M2) and the race guard passed. Taken into the suite with
// two fixture changes and no change of intent: the signed-in admin is a real
// account row (a manage key is minted only by a person who signed in — the H1
// fix), and the second key of a move rides in the body, where the server reads
// it (the L4 fix), so C1 reaches the owner check instead of stopping earlier.
// Round 2 adds a third: the crafted admin cookie carries `via: 'signin'`, the
// stamp a sign-in door puts on a session (the R2-B fix).

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
const ADMIN_TOKEN = 'sec811-admin-token'
const SESSION_SECRET = 'sec811-session-secret'
const COOKIE = 'dii_serverxr_session'

let server = null
let sandbox = null

const ownerCookie = `${COOKIE}=${createAuthSessionValue({
    secret: SESSION_SECRET,
    session: { subject: 'owner-under-test', label: 'Owner', role: 'admin', spaces: [], tokenVersion: 0, via: 'signin' }
}).value}`

const call = async (route, { method = 'GET', body = null, token = null, cookie = null, also = null } = {}) => {
    const sent = also ? { ...(body || {}), alsoSyncKey: also } : body
    const response = await fetch(`${server.baseUrl}${route}`, {
        method,
        headers: {
            Accept: 'application/json',
            ...(sent ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cookie ? { Cookie: cookie } : {})
        },
        ...(sent ? { body: JSON.stringify(sent) } : {})
    })
    const setCookie = response.headers.get('set-cookie') || ''
    const m = setCookie.match(new RegExp(`${COOKIE}=([^;]+)`))
    return { status: response.status, payload: await response.json().catch(() => null), cookie: m && m[1] ? `${COOKIE}=${m[1]}` : null }
}
const asAdmin = (route, o = {}) => call(route, { ...o, token: ADMIN_TOKEN })
const asOwner = (route, o = {}) => call(route, { ...o, cookie: ownerCookie })
const mintManage = async (spaceId, cookie = ownerCookie) => {
    const r = await call(`/api/spaces/${spaceId}/sync-keys`, { method: 'POST', cookie, body: { label: `m ${spaceId}`, manage: true } })
    expect(r.status, JSON.stringify(r.payload)).toBe(201)
    return r.payload
}
const makeSpace = async (id) => {
    const r = await asAdmin('/api/spaces', { method: 'POST', body: { slug: id, label: id, permanent: true } })
    expect(r.status, JSON.stringify(r.payload)).toBe(201)
}
const makeProject = async (spaceId, slug) => {
    const r = await asAdmin(`/api/spaces/${spaceId}/projects`, { method: 'POST', body: { slug, title: slug } })
    expect(r.status, JSON.stringify(r.payload)).toBe(201)
    return r.payload.project
}

beforeAll(async () => {
    sandbox = {
        cwd: await mkdtemp(path.join(os.tmpdir(), 'dii-sec811-cwd-')),
        data: await mkdtemp(path.join(os.tmpdir(), 'dii-sec811-data-'))
    }
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY,
        cwd: sandbox.cwd,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: sandbox.data,
            API_TOKEN: ADMIN_TOKEN,
            REQUIRE_AUTH: 'true',
            AUTH_SESSION_SECRET: SESSION_SECRET,
            AUTH_SESSION_COOKIE_SECURE: 'false',
            AUTH_HUB_URL: 'off',
            CORS_ORIGINS: '*',
            DI_LOCAL: ''
        }
    })
    server = { baseUrl: `http://127.0.0.1:${port}/serverXR`, child }
    // The signed-in admin is a real account (an OAuth callback a fixture cannot run).
    const db = new DatabaseSync(path.join(sandbox.data, 'di.db'))
    const now = Date.now()
    db.prepare('INSERT INTO users (id, provider, provider_id, email, display_name, role, spaces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run('owner-under-test', 'github', 'owner-under-test', 'owner@example.com', 'Owner', 'admin', '[]', now, now)
    db.close()
    for (const id of ['victim-a', 'race-d', 'undo-e', 'flood-f']) await makeSpace(id)
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

describe('SEC-811 C1: one leaked manage key + any self-registered account = exfiltration', () => {
    let alice = null
    let secret = null
    let leaked = null
    it('a stranger cannot move the victim\'s project into a space the stranger owns', async () => {
        // The victim: an ordinary account (not an admin) who owns victim-a2.
        const ra = await call('/api/auth/password/register', { method: 'POST', body: { username: 'alice811', password: 'alice-long-password-811' } })
        expect(ra.status, JSON.stringify(ra.payload)).toBe(201)
        alice = ra.cookie
        const sa = await call('/api/spaces', { method: 'POST', cookie: alice, body: { slug: 'victim-a2', label: 'alice' } })
        expect(sa.status, JSON.stringify(sa.payload)).toBe(201)
        alice = sa.cookie || alice
        secret = await makeProject('victim-a2', 'secret-plans')
        leaked = (await mintManage('victim-a2', alice)).token // alice's follow key, later leaked
        // A stranger registers (open registration), creates a space, mints a manage key for it.
        const reg = await call('/api/auth/password/register', { method: 'POST', body: { username: 'mallory811', password: 'correct-horse-battery-811' } })
        expect(reg.status, JSON.stringify(reg.payload)).toBe(201)
        let cookie = reg.cookie
        const made = await call('/api/spaces', { method: 'POST', cookie, body: { slug: 'mallory-m', label: 'mine' } })
        expect(made.status, JSON.stringify(made.payload)).toBe(201)
        cookie = made.cookie || cookie
        const mine = await mintManage('mallory-m', cookie)
        expect(mine.key.scope).toBe('manage')
        const moved = await call(`/api/projects/${secret.id}/move`, { method: 'POST', token: leaked, also: mine.token, body: { toSpace: 'mallory-m' } })
        // SECURE: refused (the two spaces do not share an owner). ACTUAL on 712aff84: 200.
        expect(moved.status, `move answered ${moved.status} ${JSON.stringify(moved.payload)}`).toBe(403)
    })

    it('if it did move, the victim\'s own undo brings it back', async () => {
        const keys = (await call('/api/spaces/victim-a2/sync-keys', { cookie: alice })).payload.keys
        const key = keys.find(k => k.scope === 'manage')
        const undo = await call(`/api/spaces/victim-a2/sync-keys/${key.id}/undo`, { method: 'POST', cookie: alice })
        expect(undo.status, JSON.stringify(undo.payload)).toBe(200)
        // ACTUAL: notUndone says "you do not own mallory-m"; the project stays with the stranger.
        expect(undo.payload.notUndone, JSON.stringify(undo.payload)).toEqual([])
    })
})

describe('SEC-811 H2: the static admin token becomes a session and mints a manage key', () => {
    it('a token never makes a manage key, even through /api/auth/session', async () => {
        const session = await call('/api/auth/session', { method: 'POST', body: { token: ADMIN_TOKEN } })
        expect(session.status).toBe(200)
        expect(session.cookie).toBeTruthy()
        const minted = await call('/api/spaces/victim-a/sync-keys', { method: 'POST', cookie: session.cookie, body: { label: 'from-token', manage: true } })
        // SECURE (as SPEC §13.4/T10 claims): 403 manage_needs_session. ACTUAL: 201.
        expect(minted.status, JSON.stringify({ status: minted.status, scope: minted.payload?.key?.scope })).toBe(403)
    })
})

describe('SEC-811 M3: the make-private limit holds under parallel requests', () => {
    it('80 parallel PATCHes never make more than 30 private within the hour', async () => {
        const ids = []
        for (let i = 0; i < 80; i++) ids.push((await makeProject('race-d', `race-${i}`)).id)
        const key = (await mintManage('race-d')).token
        const answers = await Promise.all(ids.map(id => call(`/api/projects/${id}`, { method: 'PATCH', token: key, body: { visibility: 'private' } })))
        const ok = answers.filter(a => a.status === 200).length
        const limited = answers.filter(a => a.status === 429).length
        expect(ok, `ok=${ok} limited=${limited}`).toBeLessThanOrEqual(30)
    })
})

describe('SEC-811 M4: undo never publishes what the owner hid after the key', () => {
    it('owner re-hides a project on purpose; the undo leaves it private', async () => {
        const p = await makeProject('undo-e', 'diary')
        const issued = await mintManage('undo-e')
        expect((await call(`/api/projects/${p.id}`, { method: 'PATCH', token: issued.token, body: { visibility: 'private' } })).status).toBe(200)
        expect((await asOwner(`/api/projects/${p.id}`, { method: 'PATCH', body: { visibility: 'public' } })).status).toBe(200)
        expect((await asOwner(`/api/projects/${p.id}`, { method: 'PATCH', body: { visibility: 'private' } })).status).toBe(200)
        const undo = await asOwner(`/api/spaces/undo-e/sync-keys/${issued.key.id}/undo`, { method: 'POST' })
        expect(undo.status).toBe(200)
        const after = await asAdmin(`/api/projects/${p.id}`)
        // SECURE: still private (the owner's later choice). ACTUAL: 'public', madePublic includes it.
        expect(after.payload?.project?.visibility, JSON.stringify(undo.payload)).toBe('private')
    })
})

describe('SEC-811 M5: a leaked key cannot bury its own actions in the owner\'s log', () => {
    it('after 10 trashes and 250 refused attempts, the owner\'s default log still shows the trashes', async () => {
        const ids = []
        for (let i = 0; i < 3; i++) ids.push((await makeProject('flood-f', `flood-${i}`)).id)
        const key = (await mintManage('flood-f')).token
        for (const id of ids) expect((await call(`/api/projects/${id}`, { method: 'DELETE', token: key })).status).toBe(200)
        const victim = await makeProject('flood-f', 'flood-keep')
        for (let i = 0; i < 250; i++) await call(`/api/projects/${victim.id}`, { method: 'PATCH', token: key, body: { visibility: 'public' } })
        const log = await asOwner('/api/spaces/flood-f/sync-keys/actions')
        const trashes = log.payload.actions.filter(a => a.action === 'trash' && a.outcome === 'done').length
        // SECURE: 3 (refusals are capped/aggregated). ACTUAL: 0 — the 200 newest rows are all refusals.
        expect(trashes, `rows=${log.payload.actions.length}`).toBe(3)
    })
})
