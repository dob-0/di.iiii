// @vitest-environment node

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { side, startFollowing } = require('./follower.js')

// Two real serverXR processes, real HTTP between them, and the real follower
// running in this process — nothing here is stubbed, because the thing under
// test IS the wire: the op log, the version check, the 409, the held request.
// A unit test of followPlan.js already proves the rule (followPlan.test.js);
// only two servers can prove the rule is wired to anything.
//
// The budget is generous for one reason, and it is a defect, not a machine:
// the loop parks its read on the other install for WAIT_SECONDS (20s), and a
// write made HERE cannot leave until that parked read comes back — wake() can
// cut a sleep but not an in-flight request. So every case that carries an edit
// OUT of the follower waits out that park. See the note above the B→A test.
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
const startServer = async ({ port = null, dataRoot = null } = {}) => {
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
        REQUIRE_AUTH: ''
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

describe('a space that lives on two di.iiii at once', () => {
    let hosting = null   // A — the install that hosts the space
    let following = null // B — the install that follows it
    let follower = null

    beforeAll(async () => {
        hosting = await startServer()
        following = await startServer()
        // The space has to exist on BOTH sides before ops can land: a write to
        // a space this install has never heard of is a 500, not a 404 (the op
        // history row has a foreign key to the space). `di follow` creates it
        // for exactly this reason — the fixture does what the command does.
        await createSpace(hosting, SPACE)
        await createSpace(following, SPACE)

        follower = startFollowing({
            local: side({ base: following.baseUrl, spaceId: SPACE, token: API_TOKEN }),
            remote: (() => { const r = side({ base: hosting.baseUrl, spaceId: SPACE, token: API_TOKEN }); const o = r.opsUrl.bind(r); r.opsUrl = (st, since) => { const u = o(st, since); console.log('REQ', Date.now() % 100000, u.replace(/^.*serverXR/, '')); return u }; return r })(),
            log: { warn: () => {}, info: () => {} },
            onState: (st) => console.log('TICK', Date.now() % 100000, st.status, st.carriedIn, st.carriedOut, st.lastError || '')
        })
    })

    afterAll(async () => {
        follower?.stop()
        await Promise.all([hosting?.stop(), following?.stop()])
    })

    it('carries an edit made on the host into the follower, log and scene', async () => {
        const written = await writeOp(hosting, addObject('lamp', 'op-host-lamp'))
        expect(written.status).toBe(200)

        const log = await settle('the host edit reaching the follower', hasOp(following, 'op-host-lamp'))

        // The op log is the transport, but the point is the WORK: an install
        // that stored the op and never applied it would pass a log-only check
        // and still show an empty room.
        expect(objectIds(await readScene(following))).toContain('lamp')
        // Its version is the follower's own counter, minted by the follower's
        // own write route — never the number it had on the host.
        expect(log.ops.find(op => op.opId === 'op-host-lamp').version).toBeGreaterThan(0)
        expect(log.latestVersion).toBeGreaterThan(0)
    })

    // The slow direction, and the one worth watching: the loop parks its read
    // on the host for up to 20s, and an edit made on the FOLLOWER cannot leave
    // until that read returns. Nothing here waits on a clock — the deadline is
    // only large enough to survive that park; if the stall is ever fixed this
    // test simply finishes sooner.
    it('carries an edit made on the follower back to the host', async () => {
        const written = await writeOp(following, addObject('chair', 'op-follower-chair'))
        expect(written.status).toBe(200)
        follower.wake() // what nudgeFollow() does inside a real install

        await settle('the follower edit reaching the host', hasOp(hosting, 'op-follower-chair'))
        expect(objectIds(await readScene(hosting))).toContain('chair')
    })

    it('converges when both sides edit at the same version at the same moment', async () => {
        // Both write against the version they are looking at, which is the
        // same op history on both sides — the case a single-leader design
        // would have to refuse and this one has to absorb.
        const [hostBase, followerBase] = await Promise.all([
            readOps(hosting).then(log => log.latestVersion),
            readOps(following).then(log => log.latestVersion)
        ])
        const [onHost, onFollower] = await Promise.all([
            writeOp(hosting, addObject('rug', 'op-host-rug'), { baseVersion: hostBase }),
            writeOp(following, addObject('door', 'op-follower-door'), { baseVersion: followerBase })
        ])
        expect(onHost.status).toBe(200)
        expect(onFollower.status).toBe(200)
        follower.wake()

        await settle('both edits reaching the host', async () => {
            const ids = opIds(await readOps(hosting))
            return ids.includes('op-host-rug') && ids.includes('op-follower-door')
        })
        await settle('both edits reaching the follower', async () => {
            const ids = opIds(await readOps(following))
            return ids.includes('op-host-rug') && ids.includes('op-follower-door')
        })

        // Convergence is about the room, not the log: neither object may have
        // been dropped by the side that was writing its own at the time.
        const [hostScene, followerScene] = await Promise.all([readScene(hosting), readScene(following)])
        expect(objectIds(hostScene).sort()).toEqual(['chair', 'door', 'lamp', 'rug'])
        expect(objectIds(followerScene).sort()).toEqual(['chair', 'door', 'lamp', 'rug'])
    })

    it('never applies the same op twice, on either side', async () => {
        // Every op above has now crossed the wire at least once and been read
        // back by the side that made it. Without the receiving route's opId
        // dedupe — or without the follower's own seen set — an op would land
        // again each pass and the log would grow on its own, forever.
        for (const [name, server] of [['host', hosting], ['follower', following]]) {
            const ids = opIds(await readOps(server))
            const counts = ids.reduce((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {})
            const repeated = Object.entries(counts).filter(([, count]) => count > 1)
            expect(`${name}: ${JSON.stringify(repeated)}`).toBe(`${name}: []`)
            expect(ids.length).toBe(4)
        }

        // And the same four edits, not four different ones each.
        const [hostIds, followerIds] = await Promise.all([
            readOps(hosting).then(log => opIds(log).sort()),
            readOps(following).then(log => opIds(log).sort())
        ])
        expect(followerIds).toEqual(hostIds)
    })

    it('survives the other install going down, and delivers what was made meanwhile', async () => {
        const port = hosting.port
        const dataRoot = hosting.dataRoot
        await hosting.stop({ keepData: true })
        hosting = null

        // A follower that cannot reach the other side must say so plainly and
        // keep running — not throw, not stop, and not claim to be following.
        await settle('the follower noticing the outage', () => {
            const state = follower.state
            return state.status === 'waiting' && Boolean(state.lastError)
        }, { timeout: 30_000 })

        const written = await writeOp(following, addObject('window', 'op-follower-window'))
        expect(written.status).toBe(200)

        // Same port, same disk: the host comes BACK, it is not replaced.
        hosting = await startServer({ port, dataRoot })
        expect(opIds(await readOps(hosting))).not.toContain('op-follower-window')
        follower.wake()

        await settle('the offline edit reaching the host once it is back', hasOp(hosting, 'op-follower-window'))
        expect(objectIds(await readScene(hosting))).toContain('window')
        expect(follower.state.status).toBe('following')
        expect(follower.state.lastError).toBeNull()
        console.log('A-LOG-AFTER-RESTART', hosting.logs().split('\n').filter(l => l.includes('/ops')).join('\n'))
    })
})

// The held request is what makes a followed room feel like one room, and it is
// used by a follower on a machine this suite cannot start — so it is checked
// here directly, over HTTP, on a space nobody is following.
describe('GET ops with ?wait=', () => {
    const PROBE = 'wait-probe'
    let server = null

    beforeAll(async () => {
        server = await startServer()
        await createSpace(server, PROBE)
    })

    afterAll(async () => {
        await server?.stop()
    })

    it('comes back the moment a write lands, not when the wait runs out', async () => {
        const { latestVersion } = await readOps(server, PROBE)
        const startedAt = Date.now()
        const held = fetch(`${server.baseUrl}/api/spaces/${PROBE}/ops?since=${latestVersion}&wait=10`, { headers: authHeaders })

        await wait(300)
        const written = await writeOp(server, addObject('bell', 'op-probe-bell'), { spaceId: PROBE })
        expect(written.status).toBe(200)

        const response = await held
        const elapsed = Date.now() - startedAt
        expect(response.status).toBe(200)
        const payload = await response.json()
        // Woken, not timed out — and carrying the op it was woken for, which
        // only happens if the route re-reads the log after the wake.
        expect(elapsed).toBeLessThan(5000)
        expect(opIds(payload)).toEqual(['op-probe-bell'])
        expect(payload.latestVersion).toBeGreaterThan(latestVersion)
    })

    it('waits out the timeout and answers empty when nothing happens', async () => {
        const { latestVersion } = await readOps(server, PROBE)
        const startedAt = Date.now()
        const response = await fetch(`${server.baseUrl}/api/spaces/${PROBE}/ops?since=${latestVersion}&wait=1`, { headers: authHeaders })
        const elapsed = Date.now() - startedAt

        expect(response.status).toBe(200)
        expect((await response.json()).ops).toEqual([])
        // It really held: a route that ignored `wait` would answer in a few
        // milliseconds, and a quiet room would be polled to death.
        expect(elapsed).toBeGreaterThanOrEqual(900)
    })

    it('answers a caller that is already behind at once, wait or no wait', async () => {
        // The wait is only ever entered when there is nothing to send. A
        // follower catching up after an outage must not be parked for 10s
        // holding the very ops it asked for.
        const startedAt = Date.now()
        const response = await fetch(`${server.baseUrl}/api/spaces/${PROBE}/ops?since=0&wait=10`, { headers: authHeaders })
        const elapsed = Date.now() - startedAt

        expect(response.status).toBe(200)
        expect(opIds(await response.json())).toContain('op-probe-bell')
        expect(elapsed).toBeLessThan(1000)
    })
})
