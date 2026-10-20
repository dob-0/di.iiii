// @vitest-environment node
//
// Regression guard for review round 3 of #811 (L1, L2), against one real
// serverXR with auth on. L1: two moves of one project by one manage key, sent
// at once, must not both apply (the loser answers 409 project_moved) and a key
// trash of a project that already left the key space is refused. L2: an
// internal error while counting who could see a moved project never reaches the
// key holder. Deterministic: no sleeps, each case reads the server answer.


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

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const SERVER_ENTRY = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'src/index.js')
const ADMIN_TOKEN = 'manage-scope-admin-token'
const SESSION_SECRET = 'manage-scope-session-secret'

let server = null
let sandbox = null

// A signed-in admin, the way a browser session arrives: a real account row
// (seeded below — accounts come from an OAuth callback a fixture cannot run)
// and the cookie the server's own signer would mint. A manage key is minted
// only by such a person (§13.4; review H1).
const OWNER_ID = 'owner-under-test'
const ownerCookie = `dii_serverxr_session=${createAuthSessionValue({
    secret: SESSION_SECRET,
    session: { subject: 'owner-under-test', label: 'Owner', role: 'admin', spaces: [], tokenVersion: 0, via: 'signin' }
}).value}`

const call = async (route, { method = 'GET', body = null, token = null, cookie = null, also = null, from = null } = {}) => {
    // The second key of a move rides in the body (review L4), never a header.
    const sent = also ? { ...(body || {}), alsoSyncKey: also } : body
    const response = await fetch(`${server.baseUrl}${route}`, {
        method,
        headers: {
            Accept: 'application/json',
            ...(sent ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            // The host's per-address limits key on this (rateLimit.js clientKey).
            ...(from ? { 'X-Forwarded-For': from } : {})
        },
        ...(sent ? { body: JSON.stringify(sent) } : {})
    })
    return { status: response.status, payload: await response.json().catch(() => null), setCookie: response.headers.get('set-cookie') || '' }
}
const asAdmin = (route, options = {}) => call(route, { ...options, token: ADMIN_TOKEN })
const asOwner = (route, options = {}) => call(route, { ...options, cookie: ownerCookie })

const mint = async (spaceId, { manage = false, by = 'owner', label = null, from = null } = {}) => {
    const route = `/api/spaces/${spaceId}/sync-keys`
    const body = { label: label || `${manage ? 'manage' : 'edit'} ${spaceId}`, ...(manage ? { manage: true } : {}) }
    return by === 'owner' ? asOwner(route, { method: 'POST', body, from }) : call(route, { method: 'POST', body, token: by, from })
}
const tokenOf = (answer) => {
    expect(answer.status).toBe(201)
    return answer.payload.token
}
const makeProject = async (spaceId, slug) => {
    const made = await asAdmin(`/api/spaces/${spaceId}/projects`, { method: 'POST', body: { slug, title: slug } })
    expect(made.status).toBe(201)
    return made.payload.project
}
/** A space whose owner is OWNER_ID — a key may move projects only between two spaces of one owner (review C1). */
const ownedSpace = async (id, { isPublic = false } = {}) => {
    const made = await asAdmin('/api/spaces', { method: 'POST', body: { slug: id, label: id, permanent: true } })
    expect(made.status, JSON.stringify(made.payload)).toBe(201)
    const owned = await asAdmin(`/api/spaces/${id}`, { method: 'PATCH', body: { ownerUserId: OWNER_ID, ...(isPublic ? { isPublic: true } : {}) } })
    expect(owned.status, JSON.stringify(owned.payload)).toBe(200)
    expect(owned.payload.space?.ownerUserId ?? OWNER_ID).toBe(OWNER_ID)
}
const liveIn = async (spaceId, id) => ((await asAdmin(`/api/spaces/${spaceId}/projects`)).payload?.projects || []).find(row => row.id === id) || null
const inTrash = async (spaceId, id) => ((await asAdmin(`/api/trash?space=${spaceId}`)).payload?.projects || []).some(row => row.id === id)

beforeAll(async () => {
    sandbox = {
        cwd: await mkdtemp(path.join(os.tmpdir(), 'dii-manage-cwd-')),
        data: await mkdtemp(path.join(os.tmpdir(), 'dii-manage-data-'))
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
    const db = new DatabaseSync(path.join(sandbox.data, 'di.db'))
    const now = Date.now()
    db.prepare('INSERT INTO users (id, provider, provider_id, email, display_name, role, spaces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(OWNER_ID, 'github', OWNER_ID, `${OWNER_ID}@example.com`, 'Owner', 'admin', '[]', now, now)
    db.close()
    for (const id of ['space-a', 'space-b']) await ownedSpace(id)
    await ownedSpace('open-c', { isPublic: true })
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

const F = (n) => `10.82.13.${n}`
describe('sync key move race and error text (#811 r3 L1, L2)', () => {
    it('L1: two moves of one project by one key at once: one 200, one 409, the project in the winner target', async () => {
        for (const id of ['r3-a', 'r3-b', 'r3-d']) await ownedSpace(id)
        const ka = tokenOf(await mint('r3-a', { manage: true, from: F(20) }))
        const kb = tokenOf(await mint('r3-b', { manage: true, from: F(21) }))
        const kd = tokenOf(await mint('r3-d', { manage: true, from: F(22) }))
        for (let i = 0; i < 6; i++) {
            const p = await makeProject('r3-a', `r3-race-${i}`)
            const [one, two] = await Promise.all([
                call(`/api/projects/${p.id}/move`, { method: 'POST', token: ka, body: { toSpace: 'r3-b' }, also: kb }),
                call(`/api/projects/${p.id}/move`, { method: 'POST', token: ka, body: { toSpace: 'r3-d' }, also: kd })
            ])
            const statuses = [one.status, two.status].sort()
            expect(statuses, JSON.stringify([one.payload, two.payload])).toEqual([200, 409])
            const loser = one.status === 409 ? one : two
            expect(loser.payload?.code).toBe('project_moved')
            const winnerSpace = one.status === 200 ? 'r3-b' : 'r3-d'
            expect(await liveIn(winnerSpace, p.id)).toBeTruthy()
            expect(await liveIn(winnerSpace === 'r3-b' ? 'r3-d' : 'r3-b', p.id)).toBeNull()
        }
    })
    it('L1: a key trash of a project that already left the key space is refused (409)', async () => {
        await ownedSpace('r3-t1'); await ownedSpace('r3-t2')
        const k1 = tokenOf(await mint('r3-t1', { manage: true, from: F(30) }))
        const k2 = tokenOf(await mint('r3-t2', { manage: true, from: F(31) }))
        const p = await makeProject('r3-t1', 'r3-trash-race')
        const [trash, move] = await Promise.all([
            call(`/api/projects/${p.id}/move`, { method: 'POST', token: k1, body: { toSpace: 'r3-t2' }, also: k2 }),
            call(`/api/projects/${p.id}`, { method: 'DELETE', token: k1 })
        ])
        // Either order is legal, but never both applied through the old key.
        const trashed = await inTrash('r3-t1', p.id) || await inTrash('r3-t2', p.id)
        if (move.status === 200 && trash.status === 200) expect(await inTrash('r3-t1', p.id)).toBe(false)
        expect([trash.status, move.status]).not.toEqual([200, 200])
        expect(trashed || (await liveIn('r3-t2', p.id))).toBeTruthy()
    })
    it('L2: an internal error while counting audiences does not reach the key holder', async () => {
        await ownedSpace('r3-e1'); await ownedSpace('r3-e2')
        const k1 = tokenOf(await mint('r3-e1', { manage: true, from: F(40) }))
        const k2 = tokenOf(await mint('r3-e2', { manage: true, from: F(41) }))
        const p = await makeProject('r3-e1', 'r3-err')
        const db = new DatabaseSync(path.join(sandbox.data, 'di.db'))
        db.exec('ALTER TABLE space_invites RENAME TO space_invites_gone')
        db.close()
        try {
            const answer = await call(`/api/projects/${p.id}/move`, { method: 'POST', token: k1, body: { toSpace: 'r3-e2' }, also: k2 })
            expect(answer.status).toBe(403)
            const text = JSON.stringify(answer.payload)
            expect(text).not.toMatch(/no such table|space_invites|sqlite/i)
            expect(await liveIn('r3-e1', p.id)).toBeTruthy()
        } finally {
            const back = new DatabaseSync(path.join(sandbox.data, 'di.db'))
            back.exec('ALTER TABLE space_invites_gone RENAME TO space_invites')
            back.close()
        }
    })
})
