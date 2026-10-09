// @vitest-environment node
//
// A personal install (`di up`: NODE_ENV=production, DI_LOCAL=1, auth off) is
// answered by name and by page. It answers the names this machine goes by
// (localhost, *.localhost, IP addresses, its certificate's names and
// DI_ALLOWED_HOSTS), and a state-changing request from a browser only when the
// page is its own or one of this machine's (Fetch Metadata, else Origin).
// Non-browser callers — the di CLI, `di follow`, curl — send neither header
// and are unchanged. A hosted server (no DI_LOCAL) is unchanged.
//
// Requests go through node:http so the Host and Sec-Fetch-* headers are sent
// exactly as written.
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const startServer = async (extraEnv = {}) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-local-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-local-data-'))
    const env = {
        ...process.env,
        NODE_ENV: 'production',
        APP_BASE_PATH: '/serverXR',
        DATA_ROOT: dataRoot,
        HOST: '127.0.0.1',
        REQUIRE_AUTH: 'false',
        AUTH_SESSION_SECRET: 'test-session-secret',
        AUTH_SESSION_COOKIE_SECURE: 'false',
        AUTH_HUB_URL: 'off',
        ...extraEnv
    }
    for (const key of ['CORS_ORIGINS', 'SPACES_DIR', 'UPLOADS_DIR', 'TLS_CERT', 'TLS_KEY', 'API_TOKEN', 'DI_ALLOWED_HOSTS']) {
        if (!(key in extraEnv)) delete env[key]
    }
    if (!('DI_LOCAL' in extraEnv)) delete env.DI_LOCAL
    const { child, port } = await spawnServerUntilReady({ entry: SERVER_ENTRY, cwd, env })
    const stop = async () => {
        if (child.exitCode === null) {
            child.kill('SIGTERM')
            await new Promise((resolve) => child.once('exit', resolve))
        }
        await rm(cwd, { recursive: true, force: true })
        await rm(dataRoot, { recursive: true, force: true })
    }
    return { port, stop }
}

const send = (port, { method = 'GET', path: urlPath, headers = {}, body = null }) => new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const req = http.request({
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: {
            host: `127.0.0.1:${port}`,
            ...(payload && !headers['content-type'] ? { 'content-type': 'application/json' } : {}),
            ...(payload ? { 'content-length': payload.length } : {}),
            ...headers
        }
    }, (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { text += chunk })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
})

let slugCounter = 0
const newSpace = () => ({ slug: `local-guard-${process.pid}-${(slugCounter += 1)}` })

describe('a personal install answers only the names this machine goes by', () => {
    let server
    beforeAll(async () => {
        server = await startServer({ DI_LOCAL: '1', DI_ALLOWED_HOSTS: 'lights.example.test,.venue.example.test' })
    }, 30000)
    afterAll(async () => { await server?.stop() })

    const health = (host) => send(server.port, { path: '/serverXR/api/health', headers: { host } })

    it('refuses a request for a name that is not one of its own', async () => {
        const refused = await health('other-site.example:4000')
        expect(refused.status).toBe(403)
        expect(refused.text).toContain('DI_ALLOWED_HOSTS')
        expect((await health('localhost.other-site.example')).status).toBe(403)
        expect((await health('diiii.localhost.other-site.example')).status).toBe(403)
        expect((await health('venue.example.test.other-site.example')).status).toBe(403)
    })

    it('a refused name never reaches a write', async () => {
        const res = await send(server.port, {
            method: 'POST',
            path: '/serverXR/api/spaces',
            headers: { host: 'other-site.example:4000', origin: 'http://other-site.example:4000', 'sec-fetch-site': 'same-origin' },
            body: newSpace()
        })
        expect(res.status).toBe(403)
    })

    it('answers localhost, *.localhost, IP addresses and the configured names', async () => {
        for (const host of [
            `127.0.0.1:${server.port}`,
            `[::1]:${server.port}`,
            '192.168.88.231',
            'localhost:4000',
            'diiii.localhost',
            'land.diiii.localhost',
            'DIIII.LOCALHOST.',
            'lights.example.test',
            'venue.example.test',
            'stage.venue.example.test:443'
        ]) {
            expect({ host, status: (await health(host)).status }).toEqual({ host, status: 200 })
        }
    })
})

describe('a personal install takes writes only from its own pages', () => {
    let server
    beforeAll(async () => {
        server = await startServer({ DI_LOCAL: '1' })
    }, 30000)
    afterAll(async () => { await server?.stop() })

    const create = (headers) => send(server.port, { method: 'POST', path: '/serverXR/api/spaces', headers, body: newSpace() })

    it('refuses a write from a page of another site', async () => {
        expect((await create({ origin: 'https://other-site.example', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
        // A browser without Fetch Metadata still sends Origin on a POST.
        expect((await create({ origin: 'https://other-site.example' })).status).toBe(403)
        // A sandboxed frame or a file:// page has an opaque origin.
        expect((await create({ origin: 'null', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
        // Another machine on the network serving a page is not this machine.
        expect((await create({ origin: 'http://192.168.88.140:8000', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
        // A cross-site request whose Origin was stripped is still cross-site.
        expect((await create({ 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    })

    it('refuses a form upload from a page of another site', async () => {
        const boundary = '----diboundary'
        const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.zip"\r\n\r\nPK\r\n--${boundary}--\r\n`
        const res = await send(server.port, {
            method: 'POST',
            path: '/serverXR/api/spaces/bundle',
            headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, origin: 'https://other-site.example', 'sec-fetch-site': 'cross-site' },
            body
        })
        expect(res.status).toBe(403)
    })

    it('takes a write from its own page, a page of this machine, and a non-browser caller', async () => {
        expect((await create({ origin: `http://127.0.0.1:${server.port}`, 'sec-fetch-site': 'same-origin' })).status).toBe(201)
        // A di-dev tree at <tree>.diiii.localhost, through its vite proxy (Host rewritten).
        expect((await create({ origin: 'http://land.diiii.localhost', 'sec-fetch-site': 'same-site', 'x-forwarded-for': '127.0.0.1' })).status).toBe(201)
        // An old browser with no Fetch Metadata, on its own origin.
        expect((await create({ origin: `http://127.0.0.1:${server.port}` })).status).toBe(201)
        expect((await create({ host: 'diiii.localhost', origin: 'http://diiii.localhost' })).status).toBe(201)
        // The di CLI, `di follow`, curl: neither header.
        expect((await create({})).status).toBe(201)
    })

    it('reads are not affected by the page check', async () => {
        const res = await send(server.port, { path: '/serverXR/api/health', headers: { origin: 'https://other-site.example', 'sec-fetch-site': 'cross-site' } })
        expect(res.status).toBe(200)
        // and the CORS answer still names no foreign origin
        expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('the public cross-origin routes keep their own rule', async () => {
        const res = await send(server.port, {
            method: 'POST',
            path: '/serverXR/api/spaces/nosuchspace/inscriptions',
            headers: { origin: 'null', 'sec-fetch-site': 'cross-site' },
            body: { text: 'x' }
        })
        expect(res.status).not.toBe(403)
        expect(res.headers['access-control-allow-origin']).toBe('*')
    })
})

describe('a hosted server is unchanged', () => {
    let server
    beforeAll(async () => {
        server = await startServer({ REQUIRE_AUTH: 'false' })
    }, 30000)
    afterAll(async () => { await server?.stop() })

    it('answers any name and leaves writes to its auth rules', async () => {
        expect((await send(server.port, { path: '/serverXR/api/health', headers: { host: 'diiii.xyz' } })).status).toBe(200)
        const res = await send(server.port, {
            method: 'POST',
            path: '/serverXR/api/spaces',
            headers: { host: 'diiii.xyz', origin: 'https://other-site.example', 'sec-fetch-site': 'cross-site' },
            body: newSpace()
        })
        expect(res.status).toBe(201)
    })
})
