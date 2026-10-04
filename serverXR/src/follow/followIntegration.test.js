// @vitest-environment node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { side, startFollowing } = require('./follower.js')
const { httpRequest, httpDownloadToFile, httpUploadFile } = require('../httpClient.js')
const { CONVERGE_CLIENT } = require('./followConverge.js')

// Two real serverXR processes, real HTTP between them, and the real follower
// running in this process — nothing here is stubbed, because the thing under
// test IS the wire: the op log, the version check, the 409, the held request.
// A unit test of followPlan.js already proves the rule (followPlan.test.js);
// only two servers can prove the rule is wired to anything.
//
// The budget is generous, though no deadline below is a sleep: the loop parks
// its read on the other install for WAIT_SECONDS (20s), and an edit that was
// not woken would sit out a whole park before it travelled. wake() abandons a
// parked read, and since 2026-10-04 a wake that lands mid-tick is latched — the
// last describe block holds every crossing under three seconds.
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
    let downloadGate = Promise.resolve()
    let downloadsStarted = 0

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
            remote: side({ base: hosting.baseUrl, spaceId: SPACE, token: API_TOKEN }),
            log: { warn: () => {}, info: () => {} },
            // The real transport, with one door in it: a test can hold a
            // download shut to stand in for a two-gigabyte video on venue wifi,
            // which no fixture file can do reliably on loopback.
            files: {
                backoffMs: [300, 300, 300],
                io: {
                    request: httpRequest,
                    upload: httpUploadFile,
                    download: async (...args) => {
                        downloadsStarted += 1
                        await downloadGate
                        return httpDownloadToFile(...args)
                    }
                }
            }
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

    // The direction worth watching: the loop has parked its read on the host,
    // and this edit leaves only because wake() abandons that read.
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
        //
        // Counted as EDITS: the rug and the door landed in a different order on
        // each side, so the follower may by now have taken the host's copy of
        // the scene (followConverge.js) — its own write, made once, never
        // carried. Whether it is there yet is only a matter of how fast the
        // follow went quiet.
        const edits = (log) => opIds(log).filter(id => !String(id).startsWith(CONVERGE_CLIENT))
        for (const [name, server] of [['host', hosting], ['follower', following]]) {
            const ids = edits(await readOps(server))
            const counts = ids.reduce((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {})
            const repeated = Object.entries(counts).filter(([, count]) => count > 1)
            expect(`${name}: ${JSON.stringify(repeated)}`).toBe(`${name}: []`)
            expect(ids.length).toBe(4)
        }

        // And the same four edits, not four different ones each.
        const [hostIds, followerIds] = await Promise.all([
            readOps(hosting).then(log => edits(log).sort()),
            readOps(following).then(log => edits(log).sort())
        ])
        expect(followerIds).toEqual(hostIds)
    })

    // ── Files ───────────────────────────────────────────────────────────────
    // An upsertAsset op names a file; until the chase (follow/assets.js) the
    // bytes stayed where they were uploaded and the other machine showed a
    // dead frame. These go through the real upload route on one install and
    // read the real asset route on the other.

    const PROJECT = 'stage-show'
    // Not text: a transport that passed through a string would survive text.
    const fileBytes = (seed, length = 300_000) => Buffer.from(Array.from({ length }, (_, i) => (i * seed + 11) % 256))

    /** What the editor does: upload the file, then name it in the project. */
    const placeFile = async (server, bytes, name) => {
        const form = new FormData()
        form.append('asset', new Blob([bytes], { type: 'video/mp4' }), name)
        const uploaded = await fetch(`${server.baseUrl}/api/projects/${PROJECT}/assets`, {
            method: 'POST', headers: { Authorization: authHeaders.Authorization }, body: form
        })
        expect(uploaded.status).toBe(200)
        const { asset } = await uploaded.json()
        expect(asset.id).toBe(createHash('sha256').update(bytes).digest('hex'))

        const log = await (await fetch(`${server.baseUrl}/api/projects/${PROJECT}/ops`, { headers: authHeaders })).json()
        const named = await fetch(`${server.baseUrl}/api/projects/${PROJECT}/ops`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ baseVersion: log.latestVersion, ops: [{ opId: `op-file-${asset.id.slice(0, 8)}`, type: 'upsertAsset', payload: { asset } }] })
        })
        expect(named.status).toBe(200)
        return asset
    }

    const servedBytes = (server, id) => async () => {
        const response = await fetch(`${server.baseUrl}/api/projects/${PROJECT}/assets/${id}`, { headers: authHeaders })
        if (response.status !== 200) return false
        return Buffer.from(await response.arrayBuffer())
    }

    it('carries a file placed on the host to the follower, byte for byte', async () => {
        const made = await fetch(`${hosting.baseUrl}/api/spaces/${SPACE}/projects`, {
            method: 'POST', headers: authHeaders, body: JSON.stringify({ slug: PROJECT, title: PROJECT })
        })
        expect(made.status).toBe(201)

        const bytes = fileBytes(31)
        const asset = await placeFile(hosting, bytes, 'opening.mp4')

        const arrived = await settle('the host file being served by the follower', servedBytes(following, asset.id))
        expect(arrived.equals(bytes)).toBe(true)
        // named in the follower's document too — the op and the bytes both crossed
        const document = await (await fetch(`${following.baseUrl}/api/projects/${PROJECT}/document`, { headers: authHeaders })).json()
        expect(document.document.assets.map(a => a.id)).toContain(asset.id)
        await settle('the follower saying so', () => follower.state.files.carried >= 1 && follower.state.files.pending === 0)
        expect(follower.state.files).toMatchObject({ failed: 0, notCarried: 0 })
    })

    it('carries a file placed on the follower back to the host, byte for byte', async () => {
        const bytes = fileBytes(57)
        const asset = await placeFile(following, bytes, 'from-the-stage.mp4')
        follower.wake()

        const arrived = await settle('the follower file being served by the host', servedBytes(hosting, asset.id))
        expect(arrived.equals(bytes)).toBe(true)
    })

    it('keeps carrying edits while a file is still on its way', async () => {
        let open = null
        downloadGate = new Promise(resolve => { open = resolve })
        const before = downloadsStarted
        try {
            const bytes = fileBytes(83)
            const asset = await placeFile(hosting, bytes, 'the-long-one.mp4')
            await settle('the transfer having started', () => downloadsStarted > before)

            // The file is stuck. An edit made now must not wait for it.
            const written = await writeOp(hosting, addObject('spotlight', 'op-host-spotlight'))
            expect(written.status).toBe(200)
            await settle('an edit crossing while the file is stuck', hasOp(following, 'op-host-spotlight'))
            expect(follower.state.files.pending).toBe(1)
            expect(follower.state.files.bytesPending).toBe(bytes.length)
            expect(await servedBytes(following, asset.id)()).toBe(false)

            open()
            const arrived = await settle('the file arriving once it can', servedBytes(following, asset.id))
            expect(arrived.equals(bytes)).toBe(true)
        } finally {
            open?.()
            downloadGate = Promise.resolve()
        }
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

// The gaps closed on 2026-10-01 (docs/architecture/SPEC_follow.md "What a follow
// guarantees"): two installs that edit the same thing at the same moment end up
// showing the same thing, and a follow that is restarted picks up where it was.
describe('a followed space stays one space', () => {
    let hosting = null
    let following = null
    const quiet = { warn: () => {}, info: () => {} }
    const follow = (extra = {}) => startFollowing({
        local: side({ base: following.baseUrl, spaceId: SPACE, token: API_TOKEN }),
        remote: side({ base: hosting.baseUrl, spaceId: SPACE, token: API_TOKEN }),
        log: quiet,
        ...extra
    })
    const objectNamed = (scene, id) => (scene?.scene?.objects || []).find(object => object.id === id)?.name
    const update = (id, name, opId) => ({ opId, type: 'updateObject', payload: { objectId: id, patch: { name } } })

    beforeAll(async () => {
        hosting = await startServer()
        following = await startServer()
        await createSpace(hosting, SPACE)
        await createSpace(following, SPACE)
    })

    afterAll(async () => {
        await Promise.all([hosting?.stop(), following?.stop()])
    })

    it("agrees on the host's value when both sides change the same field at the same moment", async () => {
        let follower = follow()
        expect((await writeOp(hosting, addObject('box', 'op-box'))).status).toBe(200)
        await settle('the box reaching the follower', hasOp(following, 'op-box'))
        follower.stop()

        // Same object, same field, different value, made on each side while
        // they could not see each other. Each side then receives the other's
        // edit AFTER its own, so "last applied" is the other person's edit on
        // each machine — the two rooms would show different names for good.
        expect((await writeOp(hosting, update('box', 'named on the host', 'op-name-host'))).status).toBe(200)
        expect((await writeOp(following, update('box', 'named on the follower', 'op-name-follower'))).status).toBe(200)

        follower = follow()
        try {
            await settle('both name edits on both sides', async () => {
                const [h, f] = await Promise.all([readOps(hosting), readOps(following)])
                return ['op-name-host', 'op-name-follower'].every(id => opIds(h).includes(id) && opIds(f).includes(id))
            })
            const agreed = await settle('the two rooms showing the same name', async () => {
                const [h, f] = await Promise.all([readScene(hosting), readScene(following)])
                const names = [objectNamed(h, 'box'), objectNamed(f, 'box')]
                return names[0] && names[0] === names[1] ? names : false
            })
            // The host's order is the order (followConverge.js): whatever the
            // host shows is what both show.
            expect(agreed[1]).toBe(objectNamed(await readScene(hosting), 'box'))
            expect(follower.state.converged).toBeGreaterThan(0)
        } finally {
            follower.stop()
        }
    })

    it('resumes from where it was after a restart, and never applies an old edit twice', async () => {
        let saved = null
        let follower = follow({ onSave: (state) => { saved = state } })
        expect((await writeOp(hosting, addObject('lamp', 'op-lamp-once'))).status).toBe(200)
        await settle('the lamp reaching the follower', hasOp(following, 'op-lamp-once'))
        await settle('the follower saving where it got to', async () => saved && saved.seen.includes('op-lamp-once'))
        follower.stop()

        // Push the lamp's op out of the FOLLOWER's retained window (500 ops):
        // its dedupe can no longer recognise it. A follower that forgot where
        // it was would read the host's window again, find the lamp's op there,
        // and the follower's server would apply it a second time.
        expect((await writeOp(following, addObject('pad', 'op-pad'))).status).toBe(200)
        for (let batch = 0; batch < 3; batch += 1) {
            const ops = Array.from({ length: 170 }, (_, i) => update('pad', `pad ${batch}-${i}`, `op-pad-${batch}-${i}`))
            const base = (await readOps(following)).latestVersion
            const response = await fetch(`${following.baseUrl}/api/spaces/${SPACE}/ops`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ baseVersion: base, ops }) })
            expect(response.status).toBe(200)
        }
        expect(opIds(await readOps(following))).not.toContain('op-lamp-once')

        follower = follow({ saved, onSave: (state) => { saved = state } })
        try {
            expect(follower.state.resumed).toBe(true)
            await settle('the pad edits reaching the host', hasOp(hosting, 'op-pad-2-169'), { timeout: 40_000 })
            expect(opIds(await readOps(following))).not.toContain('op-lamp-once')
        } finally {
            follower.stop()
        }
    })
})

// Measured on real machines on 2026-10-04 (aylmo following dev.diiii.xyz): after
// a quiet spell an edit crossed in half a second, but an edit made RIGHT AFTER
// one had been carried waited out the whole twenty-second park, in either
// direction. A tick reads every project, then parks on the scene's log; an edit
// that lands between the two was lost — the local wake found nothing to wake,
// and the host's release came before anyone was parked. On loopback that gap
// is microseconds and nothing shows, so the follow here reaches the host
// through a proxy that holds every byte for DELAY_MS each way, the way the
// internet does. It runs as it runs in an install — inside the following
// server, from its follows.json, woken by that server's own write routes — and
// each edit is made the moment the last has landed, which is what a person
// working on both screens does.
const DELAY_MS = 80

/** A TCP proxy to `port` that delays every chunk, both ways, by `ms`. */
const startDelayProxy = async (port, ms) => {
    const sockets = new Set()
    const later = (fn) => setTimeout(fn, ms)
    let chunks = 0
    const server = net.createServer((client) => {
        const upstream = net.connect(port, '127.0.0.1')
        sockets.add(client)
        sockets.add(upstream)
        // Same delay for every chunk, so timers keep the bytes in order.
        client.on('data', chunk => { chunks += 1; later(() => upstream.write(chunk)) })
        upstream.on('data', chunk => { chunks += 1; later(() => client.write(chunk)) })
        client.on('end', () => later(() => upstream.end()))
        upstream.on('end', () => later(() => client.end()))
        const drop = () => later(() => { client.destroy(); upstream.destroy() })
        client.on('close', drop)
        upstream.on('close', drop)
        client.on('error', () => {})
        upstream.on('error', () => {})
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    return {
        port: server.address().port,
        get chunks() { return chunks },
        stop: () => new Promise(resolve => {
            for (const socket of sockets) socket.destroy()
            server.close(() => resolve())
        })
    }
}

describe('a followed space answers at once, edit after edit', () => {
    let hosting = null
    let following = null
    let proxy = null
    const FOLLOWED = 'answer-space'
    const PIECE = 'answer-piece'

    const projectOps = async (server) => (await fetch(`${server.baseUrl}/api/projects/${PIECE}/ops`, { headers: authHeaders })).json()
    const writeProjectOp = async (server, opId) => {
        const { latestVersion } = await projectOps(server)
        const response = await fetch(`${server.baseUrl}/api/projects/${PIECE}/ops`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ baseVersion: latestVersion, ops: [{ opId, type: 'createEntity', payload: { entity: { id: opId, name: opId } } }] })
        })
        expect(response.status).toBe(200)
    }
    const projectHasOp = (server, opId) => async () => {
        const response = await fetch(`${server.baseUrl}/api/projects/${PIECE}/ops`, { headers: authHeaders })
        if (response.status !== 200) return false
        return opIds(await response.json()).includes(opId)
    }
    /** How long an edit made on `from` takes to be in `to`'s log. */
    const crossing = async (from, to, opId) => {
        const startedAt = Date.now()
        await writeProjectOp(from, opId)
        await settle(`${opId} crossing`, projectHasOp(to, opId), { timeout: 30_000, every: 25 })
        return Date.now() - startedAt
    }

    beforeAll(async () => {
        hosting = await startServer()
        proxy = await startDelayProxy(hosting.port, DELAY_MS)
        await createSpace(hosting, FOLLOWED)
        const made = await fetch(`${hosting.baseUrl}/api/spaces/${FOLLOWED}/projects`, {
            method: 'POST', headers: authHeaders, body: JSON.stringify({ slug: PIECE, title: PIECE })
        })
        expect(made.status).toBe(201)
        // A second project, read after the first in every tick (streams are
        // in id order) — a space like hayfilm holds several, and each one read
        // after the edited project is one more round trip of gap.
        const another = await fetch(`${hosting.baseUrl}/api/spaces/${FOLLOWED}/projects`, {
            method: 'POST', headers: authHeaders, body: JSON.stringify({ slug: `${PIECE}-later`, title: `${PIECE}-later` })
        })
        expect(another.status).toBe(201)

        // What `di follow` writes: the follow is in the install's own data dir
        // before it starts, so the server runs it, not this test.
        const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-follow-data-'))
        await writeFile(path.join(dataRoot, 'follows.json'), JSON.stringify({
            format: 'di.follows',
            version: 1,
            follows: { [FOLLOWED]: { remote: `http://127.0.0.1:${proxy.port}/serverXR`, token: API_TOKEN, label: null, followedAt: new Date().toISOString() } }
        }))
        following = await startServer({ dataRoot })
        await settle('the project reaching the follower', async () => (await fetch(`${following.baseUrl}/api/projects/${PIECE}/ops`, { headers: authHeaders })).status === 200)
        // One edit across, so every crossing below starts from a follow that
        // has carried something and settled.
        await crossing(hosting, following, 'op-answer-warm')
    })

    afterAll(async () => {
        await Promise.all([hosting?.stop(), following?.stop(), proxy?.stop()])
    })

    it('carries each edit in well under one park, in both directions, one after another', async () => {
        const times = []
        for (let round = 0; round < 3; round += 1) {
            times.push(['follower→host', await crossing(following, hosting, `op-answer-out-${round}`)])
            times.push(['host→follower', await crossing(hosting, following, `op-answer-in-${round}`)])
        }
        // A park is 20s. An edit that waited one out was not woken; a few
        // round trips through the proxy is the follow doing its job.
        const slow = times.filter(([, ms]) => ms >= 3000)
        expect(`${JSON.stringify(slow)} of ${JSON.stringify(times)}`).toBe(`[] of ${JSON.stringify(times)}`)
    }, 200_000)

    // The latch must not cost the quiet: a follow that goes round "at once"
    // too often never parks, and hammers the other machine all night.
    it('parks again once the space is quiet, rather than going round and round', async () => {
        await wait(2000) // let the last crossing's extra rounds finish
        const before = proxy.chunks
        await wait(3000)
        // One held read is a handful of chunks at most; a loop that stopped
        // parking would be hundreds in three seconds through this proxy.
        expect(proxy.chunks - before).toBeLessThan(12)
    }, 20_000)
})

// A work whose log holds a whole-work op — a restore, or a pull made with
// `di sync` — and holds it on BOTH sides, with the same result. Seen on aylmo
// following dev.diiii.xyz (2026-10-04): every project of the space `wcc` had
// one, the copies were equal, and the follow said "one side replaced a whole
// scene" for good. Its cursor stood before the op, because an older log can hold
// a whole-work op with no opId at all and the cursor only passed ops it could
// name. Both shapes of log are held here: ids minted, and ids absent.
describe.each([
    ['whole-work ops with ids', false],
    ['whole-work ops from an older log, with no opId', true]
])('a followed space whose copies already agree past a whole-work op (%s)', (_label, stripIds) => {
    let hosting = null
    let following = null
    const FOLLOWED = 'replaced-space'
    const PIECE = 'replaced-piece'
    const document = { entities: [{ id: 'chair', name: 'chair' }], nodes: [], assets: [] }

    const projectOps = async (server) => (await fetch(`${server.baseUrl}/api/projects/${PIECE}/ops`, { headers: authHeaders })).json()
    const writeProjectOps = async (server, ops) => {
        const { latestVersion } = await projectOps(server)
        const response = await fetch(`${server.baseUrl}/api/projects/${PIECE}/ops`, {
            method: 'POST', headers: authHeaders, body: JSON.stringify({ baseVersion: latestVersion, ops })
        })
        expect(response.status).toBe(200)
    }
    const hasProjectOp = (server, opId) => async () => opIds(await projectOps(server)).includes(opId)
    const createEntity = (opId) => ({ opId, type: 'createEntity', payload: { entity: { id: opId, name: opId } } })
    const followState = async () => {
        const response = await fetch(`${following.baseUrl}/api/follows`, { headers: authHeaders })
        return (await response.json()).follows?.find(follow => follow.spaceId === FOLLOWED) || null
    }
    // What an older di.iiii left in a log: a replaceDocument with no opId.
    // Written into the install's own database while it is stopped.
    const stripReplaceIds = (dataRoot) => {
        const db = new DatabaseSync(path.join(dataRoot, 'di.db'))
        try {
            for (const row of db.prepare('SELECT seq, data FROM project_ops').all()) {
                const op = JSON.parse(row.data)
                if (op.type !== 'replaceDocument') continue
                delete op.opId
                db.prepare('UPDATE project_ops SET data = ? WHERE seq = ?').run(JSON.stringify(op), row.seq)
            }
        } finally {
            db.close()
        }
    }

    beforeAll(async () => {
        hosting = await startServer()
        following = await startServer()
        for (const [tag, server] of [['host', hosting], ['follower', following]]) {
            await createSpace(server, FOLLOWED)
            const made = await fetch(`${server.baseUrl}/api/spaces/${FOLLOWED}/projects`, {
                method: 'POST', headers: authHeaders, body: JSON.stringify({ slug: PIECE, title: PIECE })
            })
            expect(made.status).toBe(201)
            // Each side replaced the work with the same document, more than
            // once, between edits of its own, before any follow exists.
            for (let round = 0; round < 3; round += 1) {
                await writeProjectOps(server, [createEntity(`op-${tag}-before-${round}`)])
                await writeProjectOps(server, [{ opId: `op-${tag}-gone-${round}`, type: 'deleteEntity', payload: { entityId: `op-${tag}-before-${round}` } }])
                const put = await fetch(`${server.baseUrl}/api/projects/${PIECE}/document`, {
                    method: 'PUT', headers: authHeaders, body: JSON.stringify(document)
                })
                expect(put.status).toBe(200)
            }
        }
        if (stripIds) {
            const [hostRoot, hostPort] = [hosting.dataRoot, hosting.port]
            await hosting.stop({ keepData: true })
            stripReplaceIds(hostRoot)
            hosting = await startServer({ dataRoot: hostRoot, port: hostPort })
        }
        // What `di follow` writes: the follow is in the install's own data dir,
        // and the server — not this test — runs it, so a local write wakes it
        // the way it does for a person.
        const { dataRoot, port } = following
        await following.stop({ keepData: true })
        if (stripIds) stripReplaceIds(dataRoot)
        await writeFile(path.join(dataRoot, 'follows.json'), JSON.stringify({
            format: 'di.follows',
            version: 1,
            follows: { [FOLLOWED]: { remote: hosting.baseUrl, token: API_TOKEN, label: null, followedAt: new Date().toISOString() } }
        }))
        following = await startServer({ dataRoot, port })
    })

    afterAll(async () => {
        await Promise.all([hosting?.stop(), following?.stop()])
    })

    it('says which work differs, and does not overwrite it, when only one side replaced it', async () => {
        // The first pass of a follow compares the copies once and finds them
        // equal; only then is a replacement made on one side alone.
        await settle('the follow settled', async () => (await followState())?.status === 'following', { timeout: 10_000 })
        await wait(1500)
        const other = { entities: [{ id: 'table', name: 'table' }], nodes: [], assets: [] }
        await writeProjectOps(hosting, [{ opId: 'op-replaced-host-only', type: 'replaceDocument', payload: { document: other } }])
        const told = await settle('the follow naming the work that differs', async () => {
            const error = (await followState())?.lastError || ''
            return error.includes(`project:${PIECE}`) ? error : false
        }, { timeout: 5000 })
        expect(told).toMatch(/use di sync/)
        // Still said a few ticks later, and the follower's copy is untouched.
        await wait(2500)
        expect((await followState())?.lastError).toContain(`project:${PIECE}`)
        const doc = await (await fetch(`${following.baseUrl}/api/projects/${PIECE}/document`, { headers: authHeaders })).json()
        expect(JSON.stringify(doc)).not.toContain('table')
        // The other side makes the same replacement — now they agree, and the
        // follow lets go of it without anyone running anything.
        await writeProjectOps(following, [{ opId: 'op-replaced-follower-too', type: 'replaceDocument', payload: { document: other } }])
        await settle('the follow letting go once the copies agree', async () => (await followState())?.lastError === null, { timeout: 5000 })
    })

    it('carries an edit made after it, both ways, and stops reporting a replacement', async () => {
        await writeProjectOps(hosting, [createEntity('op-after-host')])
        await settle('the host edit reaching the follower', hasProjectOp(following, 'op-after-host'), { timeout: 5000, every: 25 })
        await writeProjectOps(following, [createEntity('op-after-follower')])
        await settle('the follower edit reaching the host', hasProjectOp(hosting, 'op-after-follower'), { timeout: 5000, every: 25 })
        await settle('the follow no longer reporting a replaced work', async () => (await followState())?.lastError === null, { timeout: 5000 })
    })
})
