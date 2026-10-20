// @vitest-environment node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { syncLight, syncPanel } from '../../../src/sync/syncLight.js'

const require = createRequire(import.meta.url)

// Two real serverXR processes, real HTTP between them, and the real follower
// running in this process — nothing here is stubbed, because the thing under
// test IS the wire: the op log, the version check, the 409, the held request.
// A unit test of followPlan.js already proves the rule (followPlan.test.js);
// only two servers can prove the rule is wired to anything.
//
// The budget is generous for one reason, and it is the follower's, not the
// machine's: the loop parks its read on the other install for WAIT_SECONDS
// (20s), and a write made HERE cannot leave until that parked read comes back
// — wake() can cut a sleep but not an in-flight request. So an edit made on
// the following side can sit for a whole park before it travels. Deadlines
// below are sized for that; none of them is a sleep, so the file gets faster
// on its own the day that changes.
vi.setConfig({ testTimeout: 45_000, hookTimeout: 60_000 })

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')
const API_TOKEN = 'follow-test-token'
const SPACE = 'shared-room'

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const getFreePort = async () => new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address()
        probe.close(error => (error ? reject(error) : resolve(port)))
    })
})

const waitForHealth = async ({ url, child, getLogs }) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Server exited early.\n${getLogs()}`)
        try {
            const response = await fetch(url)
            if (response.ok) return
        } catch {
            // retry until the deadline
        }
        await wait(150)
    }
    throw new Error(`Server did not become healthy in time.\n${getLogs()}`)
}

/**
 * One install. `port` and `dataRoot` can be handed back in, which is how the
 * outage case restarts the SAME install rather than a fresh one — a follower
 * that only works against a machine that lost its disk proves nothing.
 */
const startServer = async ({ port = null, dataRoot = null, extraEnv = {} } = {}) => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-follow-cwd-'))
    const sandboxDataRoot = dataRoot || await mkdtemp(path.join(os.tmpdir(), 'dii-follow-data-'))
    const listenPort = port || await getFreePort()

    const childEnv = {
        ...process.env,
        PORT: String(listenPort),
        NODE_ENV: 'test',
        APP_BASE_PATH: '/serverXR',
        DATA_ROOT: sandboxDataRoot,
        API_TOKEN,
        CORS_ORIGINS: '*',
        AUTH_SESSION_SECRET: 'test-session-secret',
        REQUIRE_AUTH: '',
        ...extraEnv
    }
    delete childEnv.SPACES_DIR
    delete childEnv.UPLOADS_DIR

    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: sandboxCwd,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { output += chunk.toString() })

    const baseUrl = `http://127.0.0.1:${listenPort}/serverXR`
    const stop = async ({ keepData = false } = {}) => {
        if (child.exitCode === null) {
            child.kill('SIGTERM')
            const exited = await Promise.race([
                new Promise(resolve => child.once('exit', resolve)),
                wait(3000).then(() => false)
            ])
            if (exited === false && child.exitCode === null) {
                child.kill('SIGKILL')
                await new Promise(resolve => child.once('exit', resolve))
            }
        }
        await rm(sandboxCwd, { recursive: true, force: true })
        if (!keepData) await rm(sandboxDataRoot, { recursive: true, force: true })
    }

    await waitForHealth({ url: `${baseUrl}/api/health`, child, getLogs: () => output })
    return { baseUrl, port: listenPort, dataRoot: sandboxDataRoot, logs: () => output, stop }
}

const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_TOKEN}`
}

const createSpace = async (server, spaceId) => {
    const response = await fetch(`${server.baseUrl}/api/spaces`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ slug: spaceId, label: spaceId, permanent: true })
    })
    expect(response.status).toBe(201)
}

const readOps = async (server, spaceId = SPACE) => {
    const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/ops`, { headers: authHeaders })
    expect(response.status).toBe(200)
    return response.json()
}

const readScene = async (server, spaceId = SPACE) => {
    const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`, { headers: authHeaders })
    expect(response.status).toBe(200)
    return response.json()
}

const addObject = (id, opId) => ({
    opId,
    type: 'addObject',
    payload: { object: { id, type: 'box', name: id } }
})

/** Write an op the way a browser does: state the version you were looking at. */
const writeOp = async (server, op, { baseVersion, spaceId = SPACE } = {}) => {
    const version = baseVersion ?? (await readOps(server, spaceId)).latestVersion
    const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/ops`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ baseVersion: version, ops: [op] })
    })
    return { status: response.status, payload: await response.json() }
}

const objectIds = (scene) => (scene?.scene?.objects || []).map(object => object.id)
const opIds = (log) => (log.ops || []).map(op => op.opId)

/**
 * Poll until a condition holds. Never a fixed sleep: replication latency here
 * is the machine's and the follower's backoff together, so a sleep long enough
 * to be safe would be long enough to hide a regression.
 */
const settle = async (label, probe, { timeout = 30_000, every = 120 } = {}) => {
    const deadline = Date.now() + timeout
    let last = null
    while (Date.now() < deadline) {
        last = await probe()
        if (last) return last
        await wait(every)
    }
    throw new Error(`${label} — never became true within ${timeout}ms (last saw: ${JSON.stringify(last)})`)
}

const hasOp = (server, opId, spaceId = SPACE) => async () => {
    const log = await readOps(server, spaceId)
    return opIds(log).includes(opId) ? log : false
}

describe('linking two real installs with four words (sketch A + C)', () => {
    let host = null
    let joiner = null
    let issued = null
    let joined = null

    beforeAll(async () => {
        // DI_LOCAL=1: an install the person owns, where rateLimit.js counts nobody —
        // the code's own attempt counter must still count.
        host = await startServer({ extraEnv: { DI_LOCAL: '1' } })
        joiner = await startServer()
        await createSpace(host, SPACE)
        await writeOp(host, addObject('lamp', 'op-host-lamp'))
    })

    afterAll(async () => {
        await Promise.all([host?.stop(), joiner?.stop()])
    })

    const call = async (server, method, route, body) => {
        const response = await fetch(`${server.baseUrl}${route}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        })
        return { status: response.status, body: await response.json().catch(() => null) }
    }

    it('shows no light on either install while nothing is shared', async () => {
        for (const server of [host, joiner]) {
            const sync = await call(server, 'GET', `/api/spaces/${SPACE}/sync`)
            // The joiner does not have the space yet: 404 is "nothing here", also no light.
            const light = sync.status === 200 ? syncLight(sync.body, sync.body.now) : null
            expect(light).toBeNull()
        }
    })

    it('the host makes a four-word code: ten minutes, this space, and no key is made until it is used', async () => {
        const made = await call(host, 'POST', `/api/spaces/${SPACE}/join-codes`)
        expect(made.status).toBe(201)
        issued = made.body
        expect(issued.code).toMatch(/^[A-Z]+ · [A-Z]+ · [A-Z]+ · [A-Z]+$/)
        expect(issued.ttlSeconds).toBe(600)
        const keys = await call(host, 'GET', `/api/spaces/${SPACE}/sync-keys`)
        expect(keys.body.keys).toHaveLength(0)
    })

    it('Find shows what is behind the code without spending it, and refuses a wrong one the same as a used one', async () => {
        const address = `127.0.0.1:${host.port}`
        const found = await call(joiner, 'POST', '/api/follows/join/preview', { address, code: issued.code })
        expect(found.status).toBe(200)
        expect(found.body).toMatchObject({ spaceId: SPACE, label: SPACE, localExists: false })
        expect(found.body.projects).toBeGreaterThanOrEqual(0)
        // Still good after being looked at.
        expect((await call(joiner, 'POST', '/api/follows/join/preview', { address, code: issued.code })).status).toBe(200)
        const wrong = await call(joiner, 'POST', '/api/follows/join/preview', { address, code: 'acid acorn acre acts' })
        expect(wrong.status).toBe(404)
        expect(wrong.body.reason).toBe('invalid-code')
    })

    it('Join copies the space and starts following; the light goes from "starting" to SYNCED with a measured speed', async () => {
        const address = `127.0.0.1:${host.port}`
        joined = await call(joiner, 'POST', '/api/follows/join', { address, code: issued.code })
        expect(joined.status).toBe(201)
        expect(joined.body).toMatchObject({ ok: true, spaceId: SPACE })

        const seen = await settle('the joiner reporting SYNCED', async () => {
            const sync = await call(joiner, 'GET', `/api/spaces/${SPACE}/sync`)
            if (sync.status !== 200 || !sync.body.follows) return false
            const light = syncLight(sync.body, sync.body.now)
            return light.state === 'synced' ? { sync: sync.body, light } : false
        })
        expect(seen.light.text).toMatch(/^SYNCED · .+ · (<0\.1|\d+\.\d|\d+) S$/)
        expect(seen.sync.follows.latencyMs).toBeGreaterThanOrEqual(0)
        expect(seen.sync.follows.files.pending).toBe(0)
        // The follow key is never in what the light is told.
        expect(JSON.stringify(seen.sync)).not.toContain('dii_sync_')
        // And the work really arrived — SYNCED is not the only evidence.
        await settle('the host edit reaching the joiner', hasOp(joiner, 'op-host-lamp'))
        console.log(`[measured] light: "${seen.light.text}", host round trip ${seen.sync.follows.latencyMs} ms`)
    })

    it('the code was single-use: the same four words do nothing now', async () => {
        const address = `127.0.0.1:${host.port}`
        const again = await call(joiner, 'POST', '/api/follows/join/preview', { address, code: issued.code })
        expect(again.status).toBe(404)
        expect((await call(host, 'POST', '/api/join-codes/redeem', { code: issued.code })).status).toBe(404)
        // One real key exists, for this space, labelled with the joiner.
        const keys = await call(host, 'GET', `/api/spaces/${SPACE}/sync-keys`)
        expect(keys.body.keys).toHaveLength(1)
        expect(keys.body.keys[0].label).toMatch(/^follow · /)
    })

    it('the host’s light shows the joiner as following, live, and never says synced', async () => {
        const seen = await settle('the host hearing the joiner', async () => {
            const sync = await call(host, 'GET', `/api/spaces/${SPACE}/sync`)
            return sync.status === 200 && sync.body.followers.length ? sync.body : false
        })
        const light = syncLight(seen, seen.now)
        expect(light.state).toBe('shared')
        expect(light.text).toMatch(/^SHARED · .+ · LIVE$/)
        expect(light.text).not.toMatch(/SYNCED/)
        expect(syncPanel(seen, seen.now).canStopFollowing).toBe(false)
    })

    it('a visitor-shaped request is told nothing: through a proxy, the follow is not the person at the machine’s to read', async () => {
        const response = await fetch(`${joiner.baseUrl}/api/spaces/${SPACE}/sync`, { headers: { 'X-Forwarded-For': '203.0.113.9' } })
        // The server trusts a forwarded address only from loopback, and this one
        // arrives from loopback — so the visitor behind the proxy is not loopback.
        expect(response.status).toBe(404)
    })

    it('on a local install, where the ordinary rate limiter counts nobody, wrong guesses are still counted: 429 after eight', async () => {
        let last = null
        for (let i = 0; i < 9; i += 1) last = await call(host, 'POST', '/api/join-codes/redeem', { code: 'acid acorn acre acts' })
        expect(last.status).toBe(429)
        // …and the right code is refused while the client is over its allowance, too.
        const fresh = await call(host, 'POST', `/api/spaces/${SPACE}/join-codes`)
        expect((await call(host, 'POST', '/api/join-codes/redeem', { code: fresh.body.code })).status).toBe(429)
    })

    it('Stop following ends the carrying, deletes nothing, and the light goes out on the joiner', async () => {
        const stopped = await call(joiner, 'DELETE', `/api/spaces/${SPACE}/follow`)
        expect(stopped.status).toBe(200)
        const sync = await call(joiner, 'GET', `/api/spaces/${SPACE}/sync`)
        expect(sync.status).toBe(200)
        expect(sync.body.follows).toBeNull()
        expect(syncLight(sync.body, sync.body.now)).toBeNull()
        // Nothing was deleted: the space and its lamp are still here.
        expect(objectIds(await readScene(joiner))).toContain('lamp')
        // An edit on the host no longer crosses.
        await writeOp(host, addObject('after-stop', 'op-after-stop'))
        await wait(2500)
        expect(objectIds(await readScene(joiner))).not.toContain('after-stop')
    })
})

// With auth ON the blanket write gate sits in front of every /api POST. The join
// door is anonymous by design (the joiner has no credential yet) and must be
// registered ahead of that gate — and everything else must stay behind it.
describe('the same routes on an install with auth on', () => {
    const ADMIN = 'join-admin-token'
    let guarded = null

    beforeAll(async () => {
        guarded = await startServer({
            extraEnv: { REQUIRE_AUTH: 'true', ADMIN_API_TOKEN: ADMIN, API_TOKEN: '', AUTH_SESSION_SECRET: 'join-test-session-secret' }
        })
        const made = await fetch(`${guarded.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
            body: JSON.stringify({ slug: SPACE, label: SPACE, permanent: true })
        })
        expect(made.status).toBe(201)
    })

    afterAll(async () => { await guarded?.stop() })

    const ask = async (method, route, { token = null, body = null } = {}) => {
        const response = await fetch(`${guarded.baseUrl}${route}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined
        })
        return { status: response.status, body: await response.json().catch(() => null) }
    }

    it('an admin makes a code; an anonymous visitor cannot make one, read the follow, or stop it', async () => {
        const made = await ask('POST', `/api/spaces/${SPACE}/join-codes`, { token: ADMIN })
        expect(made.status).toBe(201)
        expect((await ask('POST', `/api/spaces/${SPACE}/join-codes`)).status).toBeGreaterThanOrEqual(401)
        const visitor = await ask('GET', `/api/spaces/${SPACE}/sync`)
        expect([401, 403, 404]).toContain(visitor.status)
        expect((await ask('DELETE', `/api/spaces/${SPACE}/follow`)).status).toBeGreaterThanOrEqual(401)
        expect((await ask('POST', '/api/follows/join', { body: { address: '127.0.0.1:1', code: 'a b c d' } })).status).toBeGreaterThanOrEqual(401)
        // The admin's view of an unshared space: allowed, and nothing to show.
        const sync = await ask('GET', `/api/spaces/${SPACE}/sync`, { token: ADMIN })
        expect(sync.status).toBe(200)
        expect(sync.body.follows).toBeNull()
        expect(sync.body.code).toBeTruthy()
    })

    it('the door answers a stranger with no credential at all: peek, then redeem once, then a real key that works on that space only', async () => {
        const { body: issuedHere } = await ask('POST', `/api/spaces/${SPACE}/join-codes`, { token: ADMIN })
        const peek = await ask('POST', '/api/join-codes/peek', { body: { code: issuedHere.code } })
        expect(peek.status).toBe(200)
        expect(peek.body.spaceId).toBe(SPACE)
        const redeemed = await ask('POST', '/api/join-codes/redeem', { body: { code: issuedHere.code, machine: { name: 'stranger-box' } } })
        expect(redeemed.status).toBe(201)
        expect((await ask('POST', '/api/join-codes/redeem', { body: { code: issuedHere.code } })).status).toBe(404)
        // The key is the real thing: it reads this space...
        const ops = await ask('GET', `/api/spaces/${SPACE}/ops?since=0`, { token: redeemed.body.token })
        expect(ops.status).toBe(200)
        // ...and cannot make more keys or codes (no escalation).
        expect((await ask('POST', `/api/spaces/${SPACE}/join-codes`, { token: redeemed.body.token })).status).toBe(403)
        expect((await ask('POST', `/api/spaces/${SPACE}/sync-keys`, { token: redeemed.body.token })).status).toBe(403)
    })

    it('guesses are counted even from a local-looking client: the eighth wrong try from one address is 429', async () => {
        let last = null
        for (let i = 0; i < 9; i += 1) last = await ask('POST', '/api/join-codes/redeem', { body: { code: 'acid acorn acre acts' } })
        expect(last.status).toBe(429)
        expect(last.body.retryAfterSeconds).toBeGreaterThan(0)
    })
})
