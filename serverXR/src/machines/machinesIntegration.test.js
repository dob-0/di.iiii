// @vitest-environment node

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Two real installs, the way two machines share a room: the HOST has auth on
// and hands out a per-space sync key; the FOLLOWER has a follows.json entry
// holding that key, and its own server does all the reaching. A "browser" tab
// says hello on each, and a signal crosses both ways. Nothing is stubbed — the
// thing under test is the relay between two servers that cannot both reach
// each other.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')
const API_TOKEN = 'machines-test-token'
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

const startServer = async ({ name, requireAuth = false, beforeStart = null }) => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-machines-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-machines-data-'))
    const port = await getFreePort()
    if (beforeStart) await beforeStart(dataRoot)

    const env = {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        APP_BASE_PATH: '/serverXR',
        DATA_ROOT: dataRoot,
        API_TOKEN,
        CORS_ORIGINS: '*',
        AUTH_SESSION_SECRET: 'test-session-secret',
        REQUIRE_AUTH: requireAuth ? 'true' : '',
        DI_MACHINE_NAME: name
    }
    delete env.SPACES_DIR
    delete env.UPLOADS_DIR
    delete env.DI_LOCAL

    const child = spawn(process.execPath, [SERVER_ENTRY], { cwd: sandboxCwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { output += chunk.toString() })

    const baseUrl = `http://127.0.0.1:${port}/serverXR`
    const deadline = Date.now() + 15000
    while (true) {
        if (child.exitCode !== null) throw new Error(`Server exited early.\n${output}`)
        if (Date.now() > deadline) throw new Error(`Server did not become healthy in time.\n${output}`)
        try {
            if ((await fetch(`${baseUrl}/api/health`)).ok) break
        } catch {
            // retry until the deadline
        }
        await wait(150)
    }

    const stop = async () => {
        if (child.exitCode === null) {
            child.kill('SIGTERM')
            const exited = await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(3000).then(() => false)])
            if (exited === false && child.exitCode === null) {
                child.kill('SIGKILL')
                await new Promise(resolve => child.once('exit', resolve))
            }
        }
        await rm(sandboxCwd, { recursive: true, force: true })
        await rm(dataRoot, { recursive: true, force: true })
    }
    return { baseUrl, logs: () => output, stop }
}

const api = async (server, method, route, { body = null, token = API_TOKEN } = {}) => {
    const response = await fetch(`${server.baseUrl}${route}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    })
    return { status: response.status, body: await response.json().catch(() => null) }
}

const settle = async (label, probe, { timeout = 15_000, every = 150 } = {}) => {
    const deadline = Date.now() + timeout
    let last = null
    while (Date.now() < deadline) {
        last = await probe()
        if (last) return last
        await wait(every)
    }
    throw new Error(`${label} — never became true within ${timeout}ms (last saw: ${JSON.stringify(last)})`)
}

describe('tabs on two machines that share a space', () => {
    let host = null
    let follower = null
    let syncKey = null

    beforeAll(async () => {
        host = await startServer({ name: 'asuz', requireAuth: true })
        expect((await api(host, 'POST', '/api/spaces', { body: { slug: SPACE, label: SPACE, permanent: true } })).status).toBe(201)
        const minted = await api(host, 'POST', `/api/spaces/${SPACE}/sync-keys`, { body: { label: 'aylmo follows' } })
        expect(minted.status).toBe(201)
        syncKey = minted.body.token

        follower = await startServer({
            name: 'aylmo',
            beforeStart: (dataRoot) => writeFile(path.join(dataRoot, 'follows.json'), JSON.stringify({
                format: 'di.follows',
                version: 1,
                follows: { [SPACE]: { remote: host.baseUrl, token: syncKey, label: null, followedAt: new Date().toISOString() } }
            }))
        })
        // The follower makes the followed space itself (ensureSpace); a tab can
        // only say hello to a space that exists.
        await settle('the followed space existing on the follower', async () =>
            (await api(follower, 'GET', `/api/spaces/${SPACE}/machines`)).status === 200)
    })

    afterAll(async () => {
        await Promise.all([host?.stop(), follower?.stop()])
    })

    it('names each machine on /api/config', async () => {
        const [onHost, onFollower] = await Promise.all([
            api(host, 'GET', '/api/config'),
            api(follower, 'GET', '/api/config', { token: null })
        ])
        expect(onHost.body.config.machine.name).toBe('asuz')
        expect(onFollower.body.config.machine.name).toBe('aylmo')
        expect(onHost.body.config.machine.id).not.toBe(onFollower.body.config.machine.id)
    })

    it('keeps the relay closed to anyone without editor access to the space', async () => {
        expect((await api(host, 'GET', `/api/spaces/${SPACE}/machines`, { token: null })).status).toBe(401)
        expect((await api(host, 'POST', `/api/spaces/${SPACE}/machines/hello`, { token: null, body: { peerId: 'x' } })).status).toBe(401)
        // The sync key is an editor on exactly this space, and that is enough.
        expect((await api(host, 'GET', `/api/spaces/${SPACE}/machines`, { token: syncKey })).status).toBe(200)
    })

    it('lists both tabs on both sides, and carries a signal there and back', async () => {
        const hostHello = await api(host, 'POST', `/api/spaces/${SPACE}/machines/hello`, { body: { peerId: 'tab-on-asuz', role: 'editor' } })
        expect(hostHello.status).toBe(200)
        expect(hostHello.body.machine.name).toBe('asuz')
        const followerHello = await api(follower, 'POST', `/api/spaces/${SPACE}/machines/hello`, { token: null, body: { peerId: 'tab-on-aylmo', role: 'editor' } })
        expect(followerHello.status).toBe(200)
        expect(followerHello.body.machine.name).toBe('aylmo')

        const bothListed = (server, token) => async () => {
            const { body } = await api(server, 'GET', `/api/spaces/${SPACE}/machines`, { token })
            const names = Object.fromEntries((body?.peers || []).map(peer => [peer.peerId, peer.machineName]))
            return names['tab-on-asuz'] === 'asuz' && names['tab-on-aylmo'] === 'aylmo' ? body : false
        }
        await settle('both tabs listed on the host', bothListed(host, API_TOKEN))
        await settle('both tabs listed on the follower', bothListed(follower, null))

        // Follower tab → host tab: the follower's server forwards straight away.
        const startedUp = Date.now()
        const up = await api(follower, 'POST', `/api/spaces/${SPACE}/signal`, {
            token: null,
            body: { from: 'tab-on-aylmo', to: 'tab-on-asuz', payload: { type: 'offer', sdp: 'v=0 up' } }
        })
        expect(up).toEqual({ status: 200, body: { ok: true, delivered: 'forwarded' } })
        const arrivedUp = await api(host, 'GET', `/api/spaces/${SPACE}/signal?peer=tab-on-asuz&wait=5`)
        expect(arrivedUp.body.messages).toMatchObject([{ from: 'tab-on-aylmo', to: 'tab-on-asuz', payload: { type: 'offer', sdp: 'v=0 up' } }])
        expect(Date.now() - startedUp).toBeLessThan(5000)

        // Host tab → follower tab: queued on the host, collected by the
        // follower's held request, delivered to the tab's own mailbox.
        const startedDown = Date.now()
        const held = api(follower, 'GET', `/api/spaces/${SPACE}/signal?peer=tab-on-aylmo&wait=10`, { token: null })
        const down = await api(host, 'POST', `/api/spaces/${SPACE}/signal`, {
            body: { from: 'tab-on-asuz', to: 'tab-on-aylmo', payload: { type: 'answer', sdp: 'v=0 down' } }
        })
        expect(down).toEqual({ status: 200, body: { ok: true, delivered: 'queued' } })
        const arrivedDown = await held
        expect(arrivedDown.body.messages).toMatchObject([{ from: 'tab-on-asuz', to: 'tab-on-aylmo', payload: { type: 'answer', sdp: 'v=0 down' } }])
        expect(Date.now() - startedDown).toBeLessThan(5000)
    })
})
