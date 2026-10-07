// @vitest-environment node
//
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
const { io: ioClient } = require('socket.io-client')

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

const setup = async (extraEnv = {}) => {
    const server = await startServer({ extraEnv })
    await makeSpace(server, 'ann-space')
    await makeSpace(server, 'ben-space')
    seedAccount(server, 'ann', { name: 'Ann Example', spaces: ['ann-space'] })
    seedAccount(server, 'ben', { name: 'Ben Example', spaces: ['ben-space'] })
    return { server, ann: cookieFor('ann', { spaces: ['ann-space'] }), ben: cookieFor('ben', { spaces: ['ben-space'] }) }
}

describe('signing in from a terminal', () => {
    it('hands a terminal a login only after a signed-in person approves its code, once', async () => {
        const { server, ann } = await setup()
        const startedRes = await post(server, '/api/auth/device/start', { label: 'ann-laptop (di 0.4.17)' })
        expect(startedRes.status).toBe(201)
        expect(startedRes.headers.get('cache-control')).toBe('no-store')
        expect(startedRes.headers.get('set-cookie')).toBeFalsy()
        const started = await startedRes.json()
        expect(started).toMatchObject({ verificationPath: '/device', expiresIn: 600, interval: 5 })
        expect(started.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/)

        // Nobody has answered: the poll says so, in the protocol's words.
        const pending = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        expect(pending.status).toBe(400)
        expect(await pending.json()).toEqual({ error: 'authorization_pending' })

        // A person with a real account sees what is asking — as text, and where it came from — and approves.
        const lookup = await post(server, '/api/auth/device/lookup', { userCode: started.userCode.toLowerCase() }, ann)
        expect(lookup.status).toBe(200)
        expect(await lookup.json()).toMatchObject({ label: 'ann-laptop (di 0.4.17)', from: '127.0.x.x' })
        const decision = await post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true }, ann)
        expect(await decision.json()).toEqual({ approved: true })

        await wait(5200) // the pace the server asked for
        const got = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        expect(got.status).toBe(200)
        expect(got.headers.get('cache-control')).toBe('no-store')
        const body = await got.json()
        expect(body.token.startsWith('dii_cli_')).toBe(true)
        expect(body.user).toEqual({ id: 'ann', name: 'Ann Example' })
        expect(Math.abs(body.expiresAt - (Date.now() + 90 * 24 * 60 * 60 * 1000))).toBeLessThan(60_000)

        // Given once.
        const again = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        expect(await again.json()).toEqual({ error: 'expired_token' })

        // Only a hash of the secret is on the server.
        const secret = body.token.split('.').slice(1).join('.')
        expect(JSON.stringify(rows(server, 'SELECT * FROM cli_tokens'))).not.toContain(secret)
        expect(JSON.stringify(rows(server, 'SELECT * FROM cli_device_codes'))).not.toContain(started.deviceCode)
        expect(server.logs()).not.toContain(secret)
    })

    it('says "denied" when the person says no, and no login exists', async () => {
        const { server, ann } = await setup()
        const { body } = await signIn(server, ann, { approve: false })
        expect(body).toEqual({ error: 'access_denied' })
        expect(rows(server, 'SELECT COUNT(*) AS n FROM cli_tokens')[0].n).toBe(0)
    })

    it('tells a terminal that asks too fast to slow down', async () => {
        const { server } = await setup()
        const started = await (await post(server, '/api/auth/device/start', {})).json()
        await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        const quick = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        expect(await quick.json()).toEqual({ error: 'slow_down', interval: 10 })
    })

    it('lets only a real account answer: not a visitor, not a guest, not an API token', async () => {
        const { server } = await setup()
        const started = await (await post(server, '/api/auth/device/start', {})).json()
        const answer = (headers) => post(server, '/api/auth/device/decision', { userCode: started.userCode, approve: true }, headers)
        const nobody = await answer({})
        expect(nobody.status).toBe(401)
        const guest = await answer(cookieFor('guest:abc123', { spaces: [] }))
        expect(guest.status).toBe(403)
        expect(await guest.json()).toEqual({ error: 'account_required' })
        const apiToken = await answer(bearer(API_TOKEN))
        expect(apiToken.status).toBe(403)
        // …and nothing was approved by any of them.
        const poll = await post(server, '/api/auth/device/token', { deviceCode: started.deviceCode })
        expect(await poll.json()).toEqual({ error: 'authorization_pending' })
    })

    it('answers a wrong code the same way, and limits how many a person can try', async () => {
        const { server, ann } = await setup()
        for (let i = 0; i < 10; i += 1) {
            const wrong = await post(server, '/api/auth/device/lookup', { userCode: 'BBBB-BBBB' }, ann)
            expect(wrong.status).toBe(404)
            expect(await wrong.json()).toEqual({ error: 'unknown_code' })
        }
        const tooMany = await post(server, '/api/auth/device/lookup', { userCode: 'BBBB-BBBB' }, ann)
        expect(tooMany.status).toBe(429)
    })

    it('is not offered where there are no accounts (a local install)', async () => {
        const server = await startServer({ extraEnv: { DI_LOCAL: '1', REQUIRE_AUTH: 'false' } })
        const res = await post(server, '/api/auth/device/start', {})
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: 'login_not_available' })
    })
})

describe('what a terminal login is', () => {
    it('acts as the person, in their own spaces only, and every write says it came through di CLI', async () => {
        const { server, ann } = await setup()
        const { body } = await signIn(server, ann)
        const token = body.token

        const mine = await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(token) })
        expect(mine.status).toBe(200)
        expect(mine.headers.get('set-cookie')).toBeFalsy()
        expect((await fetch(`${server.baseUrl}/api/spaces/ben-space/projects`, { headers: bearer(token) })).status).toBe(403)
        const outside = await post(server, '/api/spaces/ben-space/projects', { title: 'Not mine', slug: 'not-mine' }, bearer(token))
        expect(outside.status).toBe(403)

        const created = await post(server, '/api/spaces/ann-space/projects', { title: 'From a terminal', slug: 'from-a-terminal' }, bearer(token))
        expect(created.status).toBe(201)
        expect(created.headers.get('set-cookie')).toBeFalsy()

        const scene = await (await fetch(`${server.baseUrl}/api/spaces/ann-space/scene`, { headers: bearer(token) })).json()
        const ops = await post(server, '/api/spaces/ann-space/ops', {
            baseVersion: scene.version, ops: [{ opId: 'via-cli-1', type: 'addObject', payload: { object: { id: 'cli-cube' } } }]
        }, bearer(token))
        expect(ops.status).toBe(200)
        expect(rows(server, "SELECT actor, actor_type, actor_label FROM space_ops WHERE space_id = 'ann-space' AND data LIKE '%via-cli-1%'"))
            .toEqual([{ actor: 'ann', actor_type: 'di.cli', actor_label: 'Ann Example via di CLI' }])

        const writes = () => server.logs().split('\n').filter((line) => line.includes('[cli-token] write'))
        for (let i = 0; i < 40 && writes().length < 3; i += 1) await wait(50)
        const logged = writes().map((line) => JSON.parse(line.slice(line.indexOf('{'))))
        expect(logged).toContainEqual(expect.objectContaining({ subject: 'ann', actor: 'di.cli', method: 'POST', path: '/api/spaces/ann-space/ops', status: 200 }))
        expect(JSON.stringify(logged)).not.toContain(token.split('.').slice(1).join('.'))
    })

    it('never opens a door, deletes a space, or touches accounts and keys — whatever the person\'s role', async () => {
        const { server } = await setup()
        seedAccount(server, 'root-person', { role: 'admin', spaces: ['ann-space'] })
        write(server, 'UPDATE users SET is_unrestricted = 1 WHERE id = ?', 'root-person')
        const person = cookieFor('root-person', { role: 'admin' })
        const { body } = await signIn(server, person, { label: 'admin-laptop' })
        const as = bearer(body.token, json)
        const refused = [
            ['PATCH', '/api/spaces/ann-space', { isPublic: true }],
            ['DELETE', '/api/spaces/ann-space', null],
            ['DELETE', '/api/projects/anything', null],
            ['POST', '/api/spaces/ann-space/invites', { label: 'x' }],
            ['POST', '/api/spaces/ann-space/sync-keys', { label: 'x' }],
            ['POST', '/api/spaces/ann-space/domains', { hostname: 'example.com' }],
            ['GET', '/api/users', null],
            ['PATCH', '/api/users/ann', { role: 'admin' }],
            ['GET', '/api/auth/session', null],
            ['DELETE', '/api/auth/session', null],
            ['POST', '/api/auth/device/start', {}],
            ['POST', '/api/auth/device/decision', { userCode: 'BBBB-BBBB', approve: true }],
            ['GET', '/api/auth/cli/tokens', null],
            ['PATCH', '/api/config', { defaultSpaceId: 'ann-space' }],
            ['GET', '/api/admin/anything', null]
        ]
        for (const [method, route, payload] of refused) {
            const res = await fetch(`${server.baseUrl}${route}`, { method, headers: as, body: payload === null ? undefined : JSON.stringify(payload) })
            expect(res.status, `${method} ${route}`).toBe(403)
            expect((await res.json()).error, `${method} ${route}`).toBe('not_through_cli')
        }
        // The reasons are written for a person, and name the rule.
        const sample = await (await fetch(`${server.baseUrl}/api/spaces/ann-space`, { method: 'DELETE', headers: as })).json()
        expect(sample.rule).toContain('reach: public')
        expect(sample.reason.length).toBeGreaterThan(30)
        // The space is still there.
        expect((await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(API_TOKEN) })).status).toBe(200)
    })

    it('can say who it is and end itself — the only two things it may ask under /api/auth', async () => {
        const { server, ann } = await setup()
        const { body } = await signIn(server, ann, { label: 'ann-laptop' })
        const who = await fetch(`${server.baseUrl}/api/auth/cli/whoami`, { headers: bearer(body.token) })
        expect(who.status).toBe(200)
        expect(await who.json()).toEqual({
            user: { id: 'ann', name: 'Ann Example' },
            token: { id: expect.any(String), label: 'ann-laptop', expiresAt: expect.any(Number) }
        })
        const out = await fetch(`${server.baseUrl}/api/auth/cli/token`, { method: 'DELETE', headers: bearer(body.token) })
        expect(out.status).toBe(200)
        expect(await out.json()).toEqual({ revoked: true })
        // Ended: every route now says so — it never falls back to a guest.
        for (const route of ['/api/auth/cli/whoami', '/api/spaces/ann-space/projects', '/api/spaces']) {
            const res = await fetch(`${server.baseUrl}${route}`, { headers: bearer(body.token) })
            expect(res.status, route).toBe(401)
            expect((await res.json()).error).toBe('cli_token_invalid')
        }
    })

    it('answers 401 — never a guest — to a token that was never real', async () => {
        const { server } = await setup()
        for (const fake of ['dii_cli_0000000000000000.nonsense', 'dii_cli_', 'dii_cli_abc.def.ghi']) {
            const res = await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(fake) })
            expect(res.status).toBe(401)
            expect((await res.json()).error).toBe('cli_token_invalid')
        }
        // And a probe with a dead token learns nothing about which routes a live one could reach: the refusal comes first.
        const probe = await fetch(`${server.baseUrl}/api/users`, { headers: bearer('dii_cli_0000000000000000.nonsense') })
        expect(probe.status).toBe(403)
    })

    it('is listed in the browser and ended from there, only by its own account', async () => {
        const { server, ann, ben } = await setup()
        const { body } = await signIn(server, ann, { label: 'ann-laptop' })
        const list = await (await fetch(`${server.baseUrl}/api/auth/cli/tokens`, { headers: ann })).json()
        expect(list.tokens).toHaveLength(1)
        expect(list.tokens[0]).toMatchObject({ label: 'ann-laptop' })
        expect(JSON.stringify(list)).not.toContain('dii_cli_')
        expect((await (await fetch(`${server.baseUrl}/api/auth/cli/tokens`, { headers: ben })).json()).tokens).toEqual([])

        const id = list.tokens[0].id
        const notBens = await fetch(`${server.baseUrl}/api/auth/cli/tokens/${id}`, { method: 'DELETE', headers: ben })
        expect(notBens.status).toBe(404)
        expect((await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(body.token) })).status).toBe(200)

        const ended = await fetch(`${server.baseUrl}/api/auth/cli/tokens/${id}`, { method: 'DELETE', headers: ann })
        expect(ended.status).toBe(200)
        expect((await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(body.token) })).status).toBe(401)
        expect((await (await fetch(`${server.baseUrl}/api/auth/cli/tokens`, { headers: ann })).json()).tokens).toEqual([])
    })

    it('survives the browser signing out — the promise that removes the browser trip', async () => {
        const { server, ann } = await setup()
        const { body } = await signIn(server, ann)
        // A sign-out ends every browser cookie of the account (it bumps token_version)…
        const signedOut = await fetch(`${server.baseUrl}/api/auth/session`, { method: 'DELETE', headers: ann })
        expect(signedOut.status).toBeLessThan(400)
        expect((await fetch(`${server.baseUrl}/api/auth/cli/tokens`, { headers: ann })).status).toBe(401)
        // …and the terminal is still signed in.
        expect((await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(body.token) })).status).toBe(200)
    })

    it('takes its reach from the account, not from the cookie that approved it', async () => {
        const { server } = await setup()
        // A cookie that claims more than the account row grants (stale, or forged by a bug elsewhere) must not widen what it hands out.
        const overWide = cookieFor('ann', { role: 'admin', spaces: ['ann-space', 'ben-space'] })
        const { body } = await signIn(server, overWide)
        expect((await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(body.token) })).status).toBe(200)
        expect((await fetch(`${server.baseUrl}/api/spaces/ben-space/projects`, { headers: bearer(body.token) })).status).toBe(403)
        expect((await fetch(`${server.baseUrl}/api/users`, { headers: bearer(body.token) })).status).toBe(403)
    })

    it('is capped like a di.bo member: an unrestricted admin account reaches only its own spaces by terminal', async () => {
        const { server } = await setup()
        seedAccount(server, 'root-person', { role: 'admin', spaces: ['ann-space'] })
        write(server, 'UPDATE users SET is_unrestricted = 1 WHERE id = ?', 'root-person')
        const { body } = await signIn(server, cookieFor('root-person', { role: 'admin' }), { label: 'admin-laptop' })
        expect((await fetch(`${server.baseUrl}/api/spaces/ann-space/projects`, { headers: bearer(body.token) })).status).toBe(200)
        expect((await fetch(`${server.baseUrl}/api/spaces/ben-space/projects`, { headers: bearer(body.token) })).status).toBe(403)
        // The same account in a browser would reach it: the cap is the terminal's, not the account's.
        const browser = { Cookie: cookieFor('root-person', { role: 'admin' }).Cookie }
        expect((await fetch(`${server.baseUrl}/api/spaces/ben-space/projects`, { headers: { ...browser } })).status).toBe(200)
    })

    it('is not accepted by a realtime socket on its own', async () => {
        const { server, ann } = await setup()
        const { body } = await signIn(server, ann)
        const url = new URL(server.baseUrl)
        const outcome = await new Promise((resolve) => {
            const socket = ioClient(url.origin, {
                path: `${url.pathname}/socket.io`, transports: ['websocket'], reconnection: false, auth: { token: body.token }
            })
            socket.on('connect', () => { socket.close(); resolve('connected') })
            socket.on('connect_error', (error) => { socket.close(); resolve(error.message) })
        })
        expect(outcome).toBe('Unauthorized')
    })
})
