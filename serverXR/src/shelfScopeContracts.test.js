// @vitest-environment node
//
// /api/collections/:collectionId names a shelf, not a space, so no URL gate knew
// whose space it was: an editor scoped to ONE space could rename or delete
// shelves in any other (audit F8, docs/ai/audits/follow-audit-2026-10-04.md).
// A scoped editor must be allowed on its own space's shelf, refused (403) on
// another space's, and the admin allowed on both. One real server, auth on.

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

const ADMIN = 'shelf-admin-token'
const MEMBER = 'shelf-member-editor-token' // editor, scoped to the space: a member, not its owner
const STRANGER = 'shelf-stranger-viewer-token' // signed in, scoped to another space

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
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-shelf-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-shelf-data-'))
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
            EDITOR_API_TOKEN: MEMBER,
            EDITOR_ALLOWED_SPACES: 'show',
            VIEWER_API_TOKEN: STRANGER,
            VIEWER_ALLOWED_SPACES: 'elsewhere',
            REQUIRE_AUTH: 'true',
            CORS_ORIGINS: '*',
            AUTH_SESSION_SECRET: 'shelf-session-secret',
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
const send = (method, pathname, token, body) => fetch(`${server.baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...as(token) },
    body: JSON.stringify(body)
})
const ok = async (response, status = 200) => {
    if (response.status !== status) throw new Error(`expected ${status}, got ${response.status}: ${await response.text()}`)
    return response
}
const makeShelf = async (spaceId, label) => (await (await ok(await send('POST', `/api/spaces/${spaceId}/collections`, ADMIN, { label }), 201)).json()).collection
const shelfLabels = async (spaceId) => (await (await fetch(`${server.baseUrl}/api/spaces/${spaceId}/collections`, { headers: as(ADMIN) })).json()).collections.map((c) => c.label)

beforeAll(async () => {
    server = await startServer()
    await ok(await send('POST', '/api/spaces', ADMIN, { label: 'The Show', slug: 'show' }), 201)
    await ok(await send('POST', '/api/spaces', ADMIN, { label: 'Elsewhere', slug: 'elsewhere' }), 201)
})

afterAll(async () => {
    await server?.stop()
})

describe('shelf routes keep to the caller\'s space', () => {
    it('a scoped editor renames and deletes a shelf in its own space', async () => {
        const own = await makeShelf('show', 'Week 1')
        await ok(await send('PATCH', `/api/collections/${own.id}`, MEMBER, { label: 'Week one' }))
        expect(await shelfLabels('show')).toContain('Week one')
        await ok(await send('DELETE', `/api/collections/${own.id}`, MEMBER))
        expect(await shelfLabels('show')).not.toContain('Week one')
    })

    it('a scoped editor is refused on another space\'s shelf, and nothing changes', async () => {
        const other = await makeShelf('elsewhere', 'Theirs')
        const patched = await send('PATCH', `/api/collections/${other.id}`, MEMBER, { label: 'Taken' })
        expect(patched.status).toBe(403)
        const deleted = await send('DELETE', `/api/collections/${other.id}`, MEMBER)
        expect(deleted.status).toBe(403)
        expect(await shelfLabels('elsewhere')).toEqual(['Theirs'])
    })

    it('a viewer and an anonymous caller are refused', async () => {
        const other = await makeShelf('elsewhere', 'Theirs 2')
        expect((await send('PATCH', `/api/collections/${other.id}`, STRANGER, { label: 'x' })).status).toBe(403)
        expect((await send('PATCH', `/api/collections/${other.id}`, null, { label: 'x' })).status).toBe(401)
    })

    it('the admin renames and deletes a shelf in any space', async () => {
        const other = await makeShelf('elsewhere', 'Admin target')
        await ok(await send('PATCH', `/api/collections/${other.id}`, ADMIN, { label: 'Renamed' }))
        await ok(await send('DELETE', `/api/collections/${other.id}`, ADMIN))
    })

    it('an unknown shelf id is 404 for the admin', async () => {
        expect((await send('PATCH', '/api/collections/no-such-shelf', ADMIN, { label: 'x' })).status).toBe(404)
    })
})
