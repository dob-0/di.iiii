// @vitest-environment node
//
// The one local address against the REAL server (docs/ai/one-local-address.md):
// a personal install started with DI_LOCAL_NAME opens a door on loopback that
// serves the same app, the same API and the same Socket.IO as its main port —
// one server, two doors — and refuses any other Host. The door is put on a spare
// port here (DI_LOCAL_NAME_PORT); in an install it is :80.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFreePort, spawnServerUntilReady } from './testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const require = createRequire(import.meta.url)
const { io: ioClient } = require('socket.io-client')

const SERVER_ENTRY = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'src/index.js')
const SPA_MARKER = '<div id="root"></div><!-- one address fixture -->'
const cleanups = []
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c() })

const start = async (extraEnv) => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'dii-one-address-'))
    // under a dot directory, like ~/.di (the hidden-directory trap)
    const client = path.join(base, '.di', 'current', 'dist')
    await mkdir(client, { recursive: true })
    await writeFile(path.join(client, 'index.html'), SPA_MARKER)
    const data = path.join(base, 'data')
    await mkdir(data)
    const doorPort = await getFreePort()
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY,
        cwd: base,
        env: {
            ...process.env,
            NODE_ENV: 'production', DI_LOCAL: '1', HOST: '127.0.0.1', APP_BASE_PATH: '/serverXR', CLIENT_DIR: client,
            DATA_ROOT: data, REQUIRE_AUTH: 'false', AUTH_SESSION_SECRET: 'test-session-secret', AUTH_SESSION_COOKIE_SECURE: 'false',
            DI_RIG: '0', DI_LOCAL_NAME_PORT: String(doorPort), ...extraEnv
        }
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    cleanups.push(async () => {
        if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000) }) }
        await rm(base, { recursive: true, force: true })
    })
    return { port, doorPort, log: () => out }
}

const get = (port, host, p) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, headers: { host } }, (res) => {
        let body = ''
        res.on('data', (d) => { body += d })
        res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
})

const waitFor = async (fn, ms = 5000) => {
    const until = Date.now() + ms
    while (Date.now() < until) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)) }
    return false
}

describe('one server, two doors', () => {
    it('serves the same app and the same machine through the door; any other Host gets 421', async () => {
        const s = await start({ DI_LOCAL_NAME: 'diiii.localhost' })
        expect(await waitFor(() => /answers here/.test(s.log()))).toBe(true)
        const direct = JSON.parse((await get(s.port, `127.0.0.1:${s.port}`, '/serverXR/api/config')).body)
        const viaDoor = await get(s.doorPort, 'diiii.localhost', '/serverXR/api/config')
        expect(viaDoor.status).toBe(200)
        expect(JSON.parse(viaDoor.body).config.machine.id).toBe(direct.config.machine.id)
        const spa = await get(s.doorPort, `diiii.localhost:${s.doorPort}`, '/moxir/beta-v0-9')
        expect(spa.body).toContain('one address fixture')
        const other = await get(s.doorPort, 'rebound.example', '/serverXR/api/config')
        expect(other.status).toBe(421)
    })

    it('carries Socket.IO through the door (the upgrade reaches the main server\'s engine)', async () => {
        // `localhost` is a .localhost name too, and the only one a Node client resolves on every OS
        const s = await start({ DI_LOCAL_NAME: 'localhost' })
        expect(await waitFor(() => /answers here/.test(s.log()))).toBe(true)
        const client = ioClient(`http://localhost:${s.doorPort}`, { path: '/serverXR/socket.io', transports: ['websocket'], reconnection: false, timeout: 5000 })
        cleanups.push(() => client.close())
        const connected = await new Promise((resolve) => {
            client.once('connect', () => resolve(true))
            client.once('connect_error', (e) => resolve(e.message))
        })
        expect(connected).toBe(true)
    })

    it('without DI_LOCAL_NAME there is no door at all (test servers, rig members, scratch copies)', async () => {
        const s = await start({})
        await expect(get(s.doorPort, 'diiii.localhost', '/serverXR/api/config')).rejects.toThrow(/ECONNREFUSED/)
        expect(s.log()).not.toMatch(/one address/)
    })
})
