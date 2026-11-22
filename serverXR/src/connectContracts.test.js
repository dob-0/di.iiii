// @vitest-environment node
//
// `di connect` — the server half, over real HTTP (docs/architecture/CLI_LOGIN.md, "Connecting a machine").
// Signing in from a terminal, over real HTTP with auth on (docs/architecture/CLI_LOGIN.md). A spawned serverXR, a person with a
// real account and a browser cookie, and a terminal that asks for a code, gets it approved and then acts as that person — and
// everything it must never reach. The unit guards are cliLoginStore.test.js and cliTokenGate.test.js; this is the proof they
// are wired to the server the way the doc says.

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

const require = createRequire(import.meta.url)
const { createAuthSessionValue } = require('./authSession.js')

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const SERVER_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.js')
const SESSION_SECRET = 'test-session-secret'
const API_TOKEN = 'test-token'
const json = { 'Content-Type': 'application/json' }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const active = []
afterEach(async () => { await Promise.all(active.splice(0).map((server) => server.stop())) })

const startServer = async ({ extraEnv = {} } = {}) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-cli-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-cli-data-'))
    const env = {
        ...process.env,
        NODE_ENV: 'test',
        APP_BASE_PATH: '/serverXR',
        DATA_ROOT: dataRoot,
        API_TOKEN,
        CORS_ORIGINS: '*',
        AUTH_SESSION_SECRET: SESSION_SECRET,
        AUTH_HUB_URL: 'off',
        REQUIRE_AUTH: 'true',
        DI_LOCAL: '',
        ...extraEnv
    }
    delete env.SPACES_DIR
    delete env.UPLOADS_DIR
    const { child, port, logs } = await spawnServerUntilReady({ entry: SERVER_ENTRY, cwd, env })
    const baseUrl = `http://127.0.0.1:${port}/serverXR`
    const stop = async () => {
        if (child.exitCode === null) {
            child.kill('SIGTERM')
            const exited = await Promise.race([new Promise((resolve) => child.once('exit', resolve)), wait(3000).then(() => false)])
            if (exited === false && child.exitCode === null) { child.kill('SIGKILL'); await new Promise((resolve) => child.once('exit', resolve)) }
        }
        await rm(cwd, { recursive: true, force: true })
        await rm(dataRoot, { recursive: true, force: true })
    }
    const health = await fetch(`${baseUrl}/api/health`)
    if (!health.ok) throw new Error(`Health answered ${health.status}.\n${logs()}`)
    const server = { baseUrl, dataRoot, logs, stop }
    active.push(server)
    return server
}

const rows = (server, sql, ...params) => {
    const db = new DatabaseSync(path.join(server.dataRoot, 'di.db'), { readOnly: true })
    try { return db.prepare(sql).all(...params) } finally { db.close() }
}
const write = (server, sql, ...params) => {
    const db = new DatabaseSync(path.join(server.dataRoot, 'di.db'))
    try { return db.prepare(sql).run(...params) } finally { db.close() }
}

// Accounts only ever come from an OAuth callback a spawned fixture cannot perform: seed the row, and mint the cookie the
// server's own signer would have made.
const seedAccount = (server, id, { name = id, role = 'editor', spaces = [] } = {}) => {
    const now = Date.now()
    write(server, `INSERT INTO users (id, provider, provider_id, email, display_name, role, spaces, created_at, updated_at)
        VALUES (?, 'github', ?, ?, ?, ?, ?, ?, ?)`, id, id, `${id}@example.com`, name, role, JSON.stringify(spaces), now, now)
}
const cookieFor = (subject, { role = 'editor', spaces = [] } = {}) => {
    const { value } = createAuthSessionValue({ secret: SESSION_SECRET, session: { subject, label: subject, role, spaces, tokenVersion: 0 } })
    return { Cookie: `dii_serverxr_session=${value}` }
}
const bearer = (token, extra = {}) => ({ Authorization: `Bearer ${token}`, ...extra })

const makeSpace = async (server, slug) => {
    const res = await fetch(`${server.baseUrl}/api/spaces`, {
        method: 'POST', headers: { ...json, ...bearer(API_TOKEN) }, body: JSON.stringify({ slug, label: slug, permanent: true })
    })
    expect(res.status).toBe(201)
}

const post = (server, route, body, headers = {}) => fetch(`${server.baseUrl}${route}`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) })

// A terminal asks, a person answers, the terminal polls: returns what the poll handed over.
const signIn = async (server, person, { label = 'ann-laptop (di 0.4.17)', approve = true } = {}) => {
    const started = await (await post(server, '/api/auth/device/start', { label })).json()
    const decision = await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve }, person)
    expect(decision.status).toBe(200)
    // Polled once, a moment after start: within the pace the server allows.
    const got = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
    return { started, got, body: await got.json() }
}

const own = (server, spaceId, ownerId, trusted = []) => write(server, 'UPDATE spaces SET owner_user_id = ?, trusted_user_ids = ? WHERE id = ?', ownerId, JSON.stringify(trusted), spaceId)

const connectSetup = async () => {
    const server = await startServer()
    for (const slug of ['ann-space', 'ann-shared', 'ben-space', 'nobody-space']) await makeSpace(server, slug)
    seedAccount(server, 'ann', { name: 'Ann Example' })
    seedAccount(server, 'ben', { name: 'Ben Example' })
    seedAccount(server, 'root', { name: 'Root Admin', role: 'admin' })
    own(server, 'ann-space', 'ann')
    own(server, 'ben-space', 'ben', ['ann'])   // Ann may edit Ben's space
    own(server, 'ann-shared', 'ann')
    return { server, ann: cookieFor('ann'), ben: cookieFor('ben'), root: cookieFor('root', { role: 'admin' }) }
}

const startConnect = async (server, label = 'ann-laptop (di 0.4.17)') => (await post(server, '/api/auth/device/start', { label, scope: 'connect' })).json()
const keyWorks = async (server, key, spaceId) => (await fetch(`${server.baseUrl}/api/spaces/${spaceId}/projects`, { headers: bearer(key) })).status

describe('di connect — one login, every space of the person', () => {
    it('lists only the spaces the person owns or may edit, ticked ones become one editor key each, shown once', async () => {
        const { server, ann } = await connectSetup()
        const started = await startConnect(server)
        const lookup = await (await post(server, '/api/auth/device/lookup', { userCode: started.userCode }, ann)).json()
        expect(lookup.scope).toBe('connect')
        expect(lookup.spaces.map((s) => [s.id, s.role]).sort()).toEqual([['ann-shared', 'owner'], ['ann-space', 'owner'], ['ben-space', 'editor']])

        // Ann ticks two of hers and tries to smuggle in a space that is nobody's and one she may not edit.
        const decision = await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true, spaceIds: ['ann-space', 'ben-space', 'nobody-space'] }, ann)
        expect(decision.status).toBe(200)
        const got = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        expect(got.status).toBe(200)
        expect(got.headers.get('cache-control')).toBe('no-store')
        const body = await got.json()
        expect(body.scope).toBe('connect')
        expect(body.token).toBeUndefined()
        expect(body.keys.map((k) => k.spaceId).sort()).toEqual(['ann-space', 'ben-space'])
        for (const k of body.keys) expect(k.key.startsWith('dii_sync_')).toBe(true)

        // Each key opens its own space and nothing else.
        const byId = Object.fromEntries(body.keys.map((k) => [k.spaceId, k.key]))
        expect(await keyWorks(server, byId['ann-space'], 'ann-space')).toBe(200)
        expect(await keyWorks(server, byId['ann-space'], 'ann-shared')).toBeGreaterThanOrEqual(401)
        expect(await keyWorks(server, byId['ann-space'], 'ben-space')).toBeGreaterThanOrEqual(401)
        const stored = rows(server, 'SELECT space_id, scope, label, owner_user_id FROM space_sync_keys')
        expect(stored).toHaveLength(2)
        for (const row of stored) { expect(row.scope).toBe('edit'); expect(row.label).toMatch(/^connect ann-laptop \(di 0\.4\.17\) \d{4}-\d{2}-\d{2} ~[0-9a-f]{8}$/); expect(row.owner_user_id).toBe('ann') }

        // Given once; only hashes stored; never in the log.
        const again = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        expect(await again.json()).toEqual({ error: 'expired_token' })
        for (const k of body.keys) {
            const secret = k.key.split('.').slice(1).join('.')
            expect(JSON.stringify(rows(server, 'SELECT * FROM space_sync_keys'))).not.toContain(secret)
            expect(server.logs()).not.toContain(secret)
        }
    })

    it('an admin sees and gets only the spaces they own or edit, not everyone\'s', async () => {
        const { server, root } = await connectSetup()
        own(server, 'nobody-space', 'root')
        const started = await startConnect(server)
        const lookup = await (await post(server, '/api/auth/device/lookup', { userCode: started.userCode }, root)).json()
        expect(lookup.spaces.map((s) => s.id)).toEqual(['nobody-space'])
        const refused = await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true, spaceIds: ['ann-space'] }, root)
        expect(refused.status).toBe(400)
        expect(await refused.json()).toEqual({ error: 'no_spaces' })
        expect(rows(server, 'SELECT COUNT(*) AS n FROM space_sync_keys')[0].n).toBe(0)
    })

    it('refuses anyone who is not a signed-in account: nobody, a guest, the API token, a sync key', async () => {
        const { server } = await connectSetup()
        const started = await startConnect(server)
        const body = { userCode: started.userCode, approve: true, spaceIds: ['ann-space'] }
        expect((await post(server, '/api/auth/device/decision', body)).status).toBe(401)
        expect((await post(server, '/api/auth/device/lookup', { userCode: started.userCode })).status).toBe(401)
        expect([401, 403]).toContain((await post(server, '/api/auth/device/decision', body, cookieFor('guest:abc'))).status)
        expect([401, 403]).toContain((await post(server, '/api/auth/device/decision', body, bearer(API_TOKEN))).status)
        expect(await (await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })).json()).toEqual({ error: 'authorization_pending' })
        expect(rows(server, 'SELECT COUNT(*) AS n FROM space_sync_keys')[0].n).toBe(0)
    })

    it('a terminal login (dii_cli_) cannot approve a connect, and cannot mint keys itself', async () => {
        const { server, ann } = await connectSetup()
        const { body: login } = await signIn(server, ann)
        expect(login.token.startsWith('dii_cli_')).toBe(true)
        const started = await startConnect(server)
        const asTerminal = await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true, spaceIds: ['ann-space'] }, bearer(login.token))
        expect([401, 403]).toContain(asTerminal.status)
        const mint = await post(server, '/api/spaces/ann-space/sync-keys', { label: 'x' }, bearer(login.token))
        expect(mint.status).toBe(403)
        expect((await mint.json()).error).toBe('not_through_cli')
        expect(rows(server, 'SELECT COUNT(*) AS n FROM space_sync_keys')[0].n).toBe(0)
    })

    it('a denied connect hands out nothing; a plain login code still gives a terminal token', async () => {
        const { server, ann } = await connectSetup()
        const started = await startConnect(server)
        await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: false }, ann)
        expect(await (await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })).json()).toEqual({ error: 'access_denied' })
        const { body } = await signIn(server, ann)
        expect(body.token.startsWith('dii_cli_')).toBe(true)
        expect(body.keys).toBeUndefined()
    })

    it('a connect key ends itself; a key made by hand cannot be ended through this door', async () => {
        const { server, ann } = await connectSetup()
        const started = await startConnect(server)
        await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true, spaceIds: ['ann-space'] }, ann)
        const { keys } = await (await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })).json()
        const hand = await (await post(server, '/api/spaces/ann-shared/sync-keys', { label: 'ci' }, bearer(API_TOKEN))).json()
        expect(typeof hand.token).toBe('string')

        expect((await post(server, '/api/auth/connect/revoke', {}, bearer(hand.token))).status).toBe(404)
        expect(await keyWorks(server, hand.token, 'ann-shared')).toBe(200)
        expect((await post(server, '/api/auth/connect/revoke', {}, bearer(keys[0].key))).status).toBe(200)
        expect(await keyWorks(server, keys[0].key, 'ann-space')).toBe(401)
        expect((await post(server, '/api/auth/connect/revoke', {}, bearer(keys[0].key))).status).toBe(404)
        expect((await post(server, '/api/auth/connect/revoke', {})).status).toBe(404)
    })

    it('lists a person\'s connected machines, Disconnect ends one machine only, and a stranger cannot', async () => {
        const { server, ann, ben } = await connectSetup()
        const connect = async (label, ids) => {
            const started = await startConnect(server, label)
            await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true, spaceIds: ids }, ann)
            return (await (await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })).json()).keys
        }
        const laptop = await connect('laptop (di 0.4.17)', ['ann-space', 'ann-shared'])
        const pi = await connect('pi (di 0.4.17)', ['ann-space'])
        const listed = await (await fetch(`${server.baseUrl}/api/auth/connect/machines`, { headers: ann })).json()
        expect(listed.machines.map((m) => [m.name, m.spaces.length]).sort()).toEqual([['laptop (di 0.4.17)', 2], ['pi (di 0.4.17)', 1]])
        expect(JSON.stringify(listed)).not.toContain('dii_sync_')
        expect((await fetch(`${server.baseUrl}/api/auth/connect/machines`)).status).toBe(401)
        expect((await (await fetch(`${server.baseUrl}/api/auth/connect/machines`, { headers: ben })).json()).machines).toEqual([])

        const laptopId = listed.machines.find((m) => m.name.startsWith('laptop')).id
        expect((await fetch(`${server.baseUrl}/api/auth/connect/machines/${laptopId}`, { method: 'DELETE', headers: ben })).status).toBe(404)
        expect(await keyWorks(server, laptop[0].key, laptop[0].spaceId)).toBe(200)
        expect((await fetch(`${server.baseUrl}/api/auth/connect/machines/${laptopId}`, { method: 'DELETE', headers: ann })).status).toBe(200)
        for (const k of laptop) expect(await keyWorks(server, k.key, k.spaceId)).toBe(401)
        expect(await keyWorks(server, pi[0].key, 'ann-space')).toBe(200)
    })

    it('stays connected: a space gained later arrives on the next sync, nothing already held is minted twice, a stranger gets nothing', async () => {
        const { server, ann } = await connectSetup()
        const started = await startConnect(server)
        await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true, spaceIds: ['ann-space'] }, ann)
        const { keys } = await (await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })).json()
        // Ann gains Nobody's space as an editor after connecting.
        own(server, 'nobody-space', 'ben', ['ann'])
        const sync = await (await post(server, '/api/auth/connect/sync', {}, bearer(keys[0].key))).json()
        expect(sync.keys.map((k) => k.spaceId).sort()).toEqual(['ann-shared', 'ben-space', 'nobody-space'])
        expect(await keyWorks(server, sync.keys.find((k) => k.spaceId === 'nobody-space').key, 'nobody-space')).toBe(200)
        expect((await (await post(server, '/api/auth/connect/sync', {}, bearer(keys[0].key))).json()).keys).toEqual([])
        expect((await post(server, '/api/auth/connect/sync', {}, bearer(API_TOKEN))).status).toBe(404)
        expect((await post(server, '/api/auth/connect/sync', {})).status).toBe(404)
        // Disconnect ends the machine, so it can no longer ask.
        const machines = await (await fetch(`${server.baseUrl}/api/auth/connect/machines`, { headers: ann })).json()
        await fetch(`${server.baseUrl}/api/auth/connect/machines/${machines.machines[0].id}`, { method: 'DELETE', headers: ann })
        expect((await post(server, '/api/auth/connect/sync', {}, bearer(keys[0].key))).status).toBe(404)
    })

    it('rate limits the answers: the eleventh in a minute is refused', async () => {
        const { server, ann } = await connectSetup()
        const started = await startConnect(server)
        let last = null
        for (let i = 0; i < 11; i += 1) last = await post(server, '/api/auth/device/lookup', { userCode: started.userCode }, ann)
        expect(last.status).toBe(429)
    })
})
