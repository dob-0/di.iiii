// @vitest-environment node
//
// Archiving a space against one real server process: PATCH /api/spaces/:id
// {archived} sets spaces.archived_at (kept whole, nothing removed), the space
// still answers, GET /api/spaces carries archivedAt, un-archive clears it, and
// only the space's owner or an admin may do it.

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const ADMIN = 'ar-admin-token'
const EDITOR = 'ar-editor-token' // editor on alpha and bravo, owner of neither

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getFreePort = () => new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address()
        server.close((error) => (error ? reject(error) : resolve(port)))
    })
})

let server = null

const startServer = async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-ar-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-ar-data-'))
    const port = await getFreePort()
    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'production',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: dataRoot,
            API_TOKEN: ADMIN,
            EDITOR_API_TOKEN: EDITOR,
            EDITOR_ALLOWED_SPACES: 'alpha,bravo',
            REQUIRE_AUTH: 'true',
            CORS_ORIGINS: '*',
            AUTH_SESSION_SECRET: 'ar-session-secret',
            AUTH_SESSION_COOKIE_SECURE: 'false',
            AUTH_HUB_URL: 'off'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    })
    let logs = ''
    child.stdout.on('data', (chunk) => { logs += chunk })
    child.stderr.on('data', (chunk) => { logs += chunk })
    const baseUrl = `http://127.0.0.1:${port}/serverXR`
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`server exited early\n${logs}`)
        try { if ((await fetch(`${baseUrl}/api/health`)).ok) break } catch { /* booting */ }
        await wait(200)
    }
    return {
        baseUrl,
        dataRoot,
        logs: () => logs,
        stop: async () => {
            if (child.exitCode === null) {
                child.kill('SIGTERM')
                await Promise.race([new Promise((r) => child.once('exit', r)), wait(3000)])
                if (child.exitCode === null) child.kill('SIGKILL')
            }
            await rm(cwd, { recursive: true, force: true })
            await rm(dataRoot, { recursive: true, force: true })
        }
    }
}

const as = (token) => (token ? { Authorization: `Bearer ${token}` } : {})
const get = (pathname, token) => fetch(`${server.baseUrl}${pathname}`, { headers: as(token) })
const send = (method, pathname, token, body) => fetch(`${server.baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...as(token) },
    body: JSON.stringify(body)
})
const ok = async (response, status = 200) => {
    if (response.status !== status) throw new Error(`expected ${status}, got ${await response.text()}`)
    return response
}
const idsIn = async (space) => (await (await ok(await get(`/api/spaces/${space}/projects`, ADMIN))).json()).projects.map((p) => p.id)



beforeAll(async () => {
    server = await startServer()
    for (const slug of ['alpha', 'bravo']) await ok(await send('POST', '/api/spaces', ADMIN, { label: slug, slug }), 201)
    await ok(await send('POST', '/api/spaces/alpha/projects', ADMIN, { title: 'One', slug: 'one' }), 201)
})

afterAll(async () => { await server?.stop() })

const listed = async (id) => (await (await ok(await get('/api/spaces', ADMIN))).json()).spaces.find((s) => s.id === id)

describe('space archive', () => {
    it('an admin archives a space: it is flagged, kept whole and still answers', async () => {
        expect((await listed('alpha')).archivedAt).toBeUndefined()
        const body = await (await ok(await send('PATCH', '/api/spaces/alpha', ADMIN, { archived: true }))).json()
        expect(body.space.archivedAt).toBeGreaterThan(0)
        expect((await listed('alpha')).archivedAt).toBeGreaterThan(0)
        expect((await get('/api/spaces/alpha', ADMIN)).status).toBe(200)
        const projects = (await (await ok(await get('/api/spaces/alpha/projects', ADMIN))).json()).projects
        expect(projects.map((p) => p.id)).toEqual(['one'])
    })

    it('un-archive clears it in one action', async () => {
        await ok(await send('PATCH', '/api/spaces/alpha', ADMIN, { archived: false }))
        expect((await listed('alpha')).archivedAt).toBeUndefined()
    })

    it('other settings leave the flag alone, and archiving twice keeps the first stamp', async () => {
        const first = (await (await ok(await send('PATCH', '/api/spaces/bravo', ADMIN, { archived: true }))).json()).space.archivedAt
        await ok(await send('PATCH', '/api/spaces/bravo', ADMIN, { isPublic: true }))
        expect((await listed('bravo')).archivedAt).toBe(first)
        await ok(await send('PATCH', '/api/spaces/bravo', ADMIN, { archived: true }))
        expect((await listed('bravo')).archivedAt).toBe(first)
    })

    it('refuses a person who does not own the space, and a signed-out caller', async () => {
        expect((await send('PATCH', '/api/spaces/bravo', EDITOR, { archived: false })).status).toBe(403)
        expect((await send('PATCH', '/api/spaces/bravo', null, { archived: false })).status).toBeGreaterThanOrEqual(401)
        expect((await listed('bravo')).archivedAt).toBeGreaterThan(0)
    })
})
