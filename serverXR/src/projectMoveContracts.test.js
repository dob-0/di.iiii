// @vitest-environment node
//
// POST /api/projects/:projectId/move against one real server process, the same
// harness the other *Contracts.test.js files use. Who may (admin, or the owner
// of both spaces; an editor scoped to the two spaces is neither), the refusals,
// that the work and its asset are really reachable in the new space, and that
// the old bare link answers with where the project went.

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

const ADMIN = 'mv-admin-token'
const EDITOR = 'mv-editor-token' // editor on alpha and bravo, owner of neither
const VIEWER = 'mv-viewer-token' // viewer, scoped to alpha only

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
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-mv-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-mv-data-'))
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
            VIEWER_API_TOKEN: VIEWER,
            VIEWER_ALLOWED_SPACES: 'alpha',
            REQUIRE_AUTH: 'true',
            CORS_ORIGINS: '*',
            AUTH_SESSION_SECRET: 'mv-session-secret',
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

let assetId = null

beforeAll(async () => {
    server = await startServer()
    for (const slug of ['alpha', 'bravo', 'gallery']) await ok(await send('POST', '/api/spaces', ADMIN, { label: slug, slug }), 201)
    await ok(await send('POST', '/api/spaces/alpha/projects', ADMIN, { title: 'Mover', slug: 'mover' }), 201)
    await ok(await send('POST', '/api/spaces/alpha/projects', ADMIN, { title: 'Door', slug: 'door' }), 201)
    await ok(await send('POST', '/api/spaces/alpha/projects', ADMIN, { title: 'Clasher', slug: 'clasher' }), 201)
    await ok(await send('POST', '/api/spaces/bravo/projects', ADMIN, { title: 'Other', slug: 'clasher-bravo' }), 201)
    await ok(await send('PATCH', '/api/projects/clasher-bravo', ADMIN, { slug: 'same-name' }))
    await ok(await send('PATCH', '/api/projects/clasher', ADMIN, { slug: 'same-name' }))
    const form = new FormData()
    form.append('asset', new Blob([JSON.stringify({ photo: 'one' })], { type: 'application/json' }), 'p.json')
    const up = await ok(await fetch(`${server.baseUrl}/api/projects/mover/assets`, { method: 'POST', headers: as(ADMIN), body: form }))
    assetId = (await up.json()).asset.id
    await ok(await send('PUT', '/api/projects/mover/document', ADMIN, {
        projectMeta: { id: 'mover', spaceId: 'alpha', title: 'Mover' },
        assets: [{ id: assetId, name: 'p.json', mimeType: 'application/json' }],
        entities: []
    }))
    await ok(await send('PATCH', '/api/spaces/alpha', ADMIN, { publishedProjectId: 'door' }))
})

afterAll(async () => { await server?.stop() })

describe('POST /api/projects/:id/move', () => {
    it('refuses anyone who is not an admin or the owner of both spaces', async () => {
        expect((await send('POST', '/api/projects/mover/move', null, { toSpace: 'bravo' })).status).toBeGreaterThanOrEqual(401)
        expect((await send('POST', '/api/projects/mover/move', EDITOR, { toSpace: 'bravo' })).status).toBe(403)
        expect((await send('POST', '/api/projects/mover/move', VIEWER, { toSpace: 'bravo' })).status).toBeGreaterThanOrEqual(401)
        expect(await idsIn('alpha')).toContain('mover')
    })

    it('answers 404 for an unknown project or target, 400 for no target or the same space', async () => {
        expect((await send('POST', '/api/projects/ghost/move', ADMIN, { toSpace: 'bravo' })).status).toBe(404)
        expect((await send('POST', '/api/projects/mover/move', ADMIN, { toSpace: 'nowhere' })).status).toBe(404)
        expect((await send('POST', '/api/projects/mover/move', ADMIN, {})).status).toBe(400)
        expect((await send('POST', '/api/projects/mover/move', ADMIN, { toSpace: 'alpha' })).status).toBe(400)
    })

    it('refuses a slug already used in the target (409) and a front-door project without unpublish', async () => {
        const clash = await send('POST', '/api/projects/clasher/move', ADMIN, { toSpace: 'bravo' })
        expect(clash.status).toBe(409)
        expect((await clash.json()).code).toBe('slug_clash')
        const door = await send('POST', '/api/projects/door/move', ADMIN, { toSpace: 'bravo' })
        expect(door.status).toBe(409)
        expect((await door.json()).code).toBe('is_published')
        expect(await idsIn('alpha')).toEqual(expect.arrayContaining(['clasher', 'door']))
    })

    it('a dry run reports and changes nothing', async () => {
        const body = await (await ok(await send('POST', '/api/projects/mover/move', ADMIN, { toSpace: 'bravo', dryRun: true }))).json()
        expect(body).toMatchObject({ dryRun: true, fromSpaceId: 'alpha', toSpaceId: 'bravo' })
        expect(await idsIn('alpha')).toContain('mover')
    })

    it('moves it: listed in the new space only, document and asset still served, old bare link points on', async () => {
        const body = await (await ok(await send('POST', '/api/projects/mover/move', ADMIN, { toSpace: 'bravo' }))).json()
        expect(body).toMatchObject({ ok: true, fromSpaceId: 'alpha', toSpaceId: 'bravo', stableLink: '/bravo/p/mover' })
        expect(await idsIn('bravo')).toContain('mover')
        expect(await idsIn('alpha')).not.toContain('mover')
        const doc = await (await ok(await get('/api/projects/mover/document', ADMIN))).json()
        expect(JSON.stringify(doc)).toContain(assetId)
        const asset = await ok(await get(`/api/projects/mover/assets/${assetId}`, ADMIN))
        expect(JSON.parse(await asset.text())).toEqual({ photo: 'one' })
        const meta = await (await ok(await get('/api/projects/mover', ADMIN))).json()
        expect(meta.project.spaceId).toBe('bravo')
        const old = await get('/api/resolve/alpha/mover', ADMIN)
        expect(JSON.stringify(await old.json())).toContain('bravo')
    })

    it('moves a front-door project with unpublish, and the source space shows no front door', async () => {
        await ok(await send('POST', '/api/projects/door/move', ADMIN, { toSpace: 'gallery', unpublish: true }))
        const space = await (await ok(await get('/api/spaces/alpha', ADMIN))).json()
        expect(space.space?.publishedProjectId ?? space.publishedProjectId ?? null).toBeNull()
        expect(await idsIn('gallery')).toContain('door')
    })
})
