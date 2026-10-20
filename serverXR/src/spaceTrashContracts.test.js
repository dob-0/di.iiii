// @vitest-environment node
//
// The space trash against one real server process (same harness as the other
// *Contracts.test.js files): DELETE /api/spaces/:id moves the space AND its
// projects to the trash, GET /api/trash/spaces lists it, POST .../restore
// brings both back, DELETE .../purge is the only way the bytes go, and a
// permanent / front-room space is refused.

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

const ADMIN = 'st-admin-token'
const EDITOR = 'st-editor-token' // editor on alpha and bravo, owner of neither

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
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-st-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-st-data-'))
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
            AUTH_SESSION_SECRET: 'st-session-secret',
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
    await ok(await send('POST', '/api/spaces', ADMIN, { label: 'keeper', slug: 'keeper', permanent: true }), 201)
    await ok(await send('POST', '/api/spaces/alpha/projects', ADMIN, { title: 'One', slug: 'one' }), 201)
    await ok(await send('POST', '/api/spaces/alpha/projects', ADMIN, { title: 'Two', slug: 'two' }), 201)
    await ok(await send('POST', '/api/spaces/alpha/projects', ADMIN, { title: 'Gone Earlier', slug: 'early' }), 201)
    await ok(await send('DELETE', '/api/projects/early', ADMIN))
})

afterAll(async () => { await server?.stop() })

const spaceIds = async () => (await (await ok(await get('/api/spaces', ADMIN))).json()).spaces.map((s) => s.id)
const trashedSpaceIds = async () => (await (await ok(await get('/api/trash/spaces', ADMIN))).json()).spaces.map((s) => s.id)

describe('space trash', () => {
    it('footprint names what a delete would take', async () => {
        const body = await (await ok(await get('/api/spaces/alpha/footprint', ADMIN))).json()
        expect(body).toMatchObject({ spaceId: 'alpha', projects: 2, protected: null })
        expect(body.bytes).toBeGreaterThanOrEqual(0)
    })

    it('refuses an editor who does not own the space, and a permanent space even for an admin', async () => {
        expect((await send('DELETE', '/api/spaces/alpha', EDITOR)).status).toBe(403)
        expect((await send('DELETE', '/api/spaces/alpha', null)).status).toBeGreaterThanOrEqual(401)
        const kept = await send('DELETE', '/api/spaces/keeper', ADMIN)
        expect(kept.status).toBe(409)
        expect(await kept.json()).toMatchObject({ code: 'space_protected', reason: 'permanent' })
        expect(await spaceIds()).toContain('keeper')
        const main = await send('DELETE', '/api/spaces/main', ADMIN)
        expect(main.status).toBe(409)
    })

    it('delete is soft: the space and its projects leave every list, the urls stop, nothing is removed', async () => {
        const body = await (await ok(await send('DELETE', '/api/spaces/alpha', ADMIN))).json()
        expect(body).toMatchObject({ ok: true, trashed: true, projects: 2 })
        expect(body.restorableUntil).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000)
        expect(await spaceIds()).not.toContain('alpha')
        expect((await get('/api/spaces/alpha', ADMIN)).status).toBe(404)
        expect((await get('/api/projects/one', ADMIN)).status).toBe(404)
        expect(await trashedSpaceIds()).toContain('alpha')
        const listed = (await (await ok(await get('/api/trash/spaces', ADMIN))).json()).spaces.find((s) => s.id === 'alpha')
        expect(listed.projectCount).toBe(2)
        // the projects that went WITH the space are not a second, separate entry
        const projectTrash = (await (await ok(await get('/api/trash', ADMIN))).json()).projects.map((p) => p.id)
        expect(projectTrash).not.toContain('one')
        expect((await send('POST', '/api/projects/one/restore', ADMIN, {})).status).toBe(404)
    })

    it('its name is held: creating over a trashed space is refused', async () => {
        const clash = await send('POST', '/api/spaces', ADMIN, { label: 'alpha', slug: 'alpha' })
        expect(clash.status).toBe(409)
        expect((await clash.json()).code).toBe('space_in_trash')
    })

    it('a live space cannot be purged; an editor cannot restore', async () => {
        const live = await send('DELETE', '/api/spaces/bravo/purge', ADMIN)
        expect(live.status).toBe(404) // not in the trash: nothing to purge
        expect((await send('POST', '/api/spaces/alpha/restore', EDITOR, {})).status).toBe(403)
    })

    it('restore brings the space back with ITS projects; a project trashed earlier stays in the trash', async () => {
        const body = await (await ok(await send('POST', '/api/spaces/alpha/restore', ADMIN, {}))).json()
        expect(body).toMatchObject({ ok: true, projects: 2 })
        expect(await spaceIds()).toContain('alpha')
        expect(await trashedSpaceIds()).not.toContain('alpha')
        const projects = (await (await ok(await get('/api/spaces/alpha/projects', ADMIN))).json()).projects.map((p) => p.id)
        expect(projects.sort()).toEqual(['one', 'two'])
        const projectTrash = (await (await ok(await get('/api/trash', ADMIN))).json()).projects.map((p) => p.id)
        expect(projectTrash).toContain('early')
        expect((await send('POST', '/api/spaces/alpha/restore', ADMIN, {})).status).toBe(404)
    })

    it('purge removes it for good, and only from the trash', async () => {
        await ok(await send('DELETE', '/api/spaces/bravo', ADMIN))
        await ok(await send('DELETE', '/api/spaces/bravo/purge', ADMIN))
        expect(await trashedSpaceIds()).not.toContain('bravo')
        expect((await send('POST', '/api/spaces/bravo/restore', ADMIN, {})).status).toBe(404)
        // the name is free again
        await ok(await send('POST', '/api/spaces', ADMIN, { label: 'bravo', slug: 'bravo' }), 201)
    })
})
