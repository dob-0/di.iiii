// @vitest-environment node
//
// Per-project visibility inside a space — docs/architecture/SPEC_project_visibility.md.
//
// A public space holding one private project. Every read path a visitor can
// reach is walked twice: once as someone outside the space (no session at all,
// and a signed-in token scoped to a different space) — each must answer
// exactly what it answers for a project that was never created — and once as
// a member (the admin, and an editor scoped to the space) — each must answer
// as it always did. One real server process, the same harness the other
// *Contracts.test.js files use.

import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const ADMIN = 'vis-admin-token'
const MEMBER = 'vis-member-editor-token' // editor, scoped to the space: a member, not its owner
const STRANGER = 'vis-stranger-viewer-token' // signed in, scoped to another space

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
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-vis-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-vis-data-'))
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
            AUTH_SESSION_SECRET: 'vis-session-secret',
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
    if (response.status !== status) throw new Error(`expected ${status}, got ${response.status}: ${await response.text()}`)
    return response
}

// Filled in beforeAll: the private project's one asset (a content address,
// so its bytes live in the SPACE's blob store — the store every project in
// the space shares).
let privateAssetId = null

beforeAll(async () => {
    server = await startServer()
    await ok(await send('POST', '/api/spaces', ADMIN, { label: 'The Show', slug: 'show' }), 201)
    await ok(await send('POST', '/api/spaces', ADMIN, { label: 'Elsewhere', slug: 'elsewhere' }), 201)
    await ok(await send('POST', '/api/spaces/show/projects', ADMIN, { title: 'The Door', slug: 'door' }), 201)
    // Born private, through the create route — the path a copy between tiers takes.
    const sources = await ok(await send('POST', '/api/spaces/show/projects', ADMIN, { title: 'Venue Sources', slug: 'sources', visibility: 'private' }), 201)
    expect((await sources.json()).project.visibility).toBe('private')
    // Made private after the fact, through PATCH — the path a person takes.
    await ok(await send('POST', '/api/spaces/show/projects', ADMIN, { title: 'Rehearsal Notes', slug: 'notes' }), 201)
    const patched = await ok(await send('PATCH', '/api/projects/notes', ADMIN, { visibility: 'private' }))
    expect((await patched.json()).project.visibility).toBe('private')

    const form = new FormData()
    form.append('asset', new Blob([JSON.stringify({ photo: 'venue-001', by: 'the owner' })], { type: 'application/json' }), 'venue.json')
    const upload = await ok(await fetch(`${server.baseUrl}/api/projects/sources/assets`, { method: 'POST', headers: as(ADMIN), body: form }))
    privateAssetId = (await upload.json()).asset.id
    expect(privateAssetId).toMatch(/^[a-f0-9]{64}$/)
    await ok(await send('PUT', '/api/projects/sources/document', ADMIN, {
        projectMeta: { id: 'sources', spaceId: 'show', title: 'Venue Sources' },
        assets: [{ id: privateAssetId, name: 'venue.json', mimeType: 'application/json' }],
        entities: []
    }))

    await ok(await send('PATCH', '/api/spaces/show', ADMIN, { isPublic: true, publishedProjectId: 'door' }))
})

afterAll(async () => {
    await server?.stop()
})

// Every read a visitor could aim at one project. Each is also asked of a
// project id nobody ever created, so "the same answer as nothing" is checked
// against the server's own answer for nothing, not against a guess.
const PROJECT_READS = [
    (id) => `/api/projects/${id}`,
    (id) => `/api/projects/${id}/document`,
    (id) => `/api/projects/${id}/ops`,
    (id) => `/api/projects/${id}/ops?since=0`,
    (id) => `/api/projects/${id}/events`,
    (id) => `/api/projects/${id}/assets/${privateAssetId}`,
    (id) => `/api/projects/${id}/assets/${privateAssetId}/meta`,
    (id) => `/api/resolve/show/${id}`
]

describe('a private project in a public space', () => {
    for (const [who, token] of [['a visitor with no session', null], ['a signed-in stranger scoped elsewhere', STRANGER]]) {
        it(`answers ${who} with 404 on every per-project read — identical to a project that does not exist`, async () => {
            for (const route of PROJECT_READS) {
                for (const id of ['sources', 'notes']) {
                    const hidden = await get(route(id), token)
                    const never = await get(route('never-made-this-one'), token)
                    expect({ route: route(id), status: hidden.status }).toEqual({ route: route(id), status: 404 })
                    expect(await hidden.json()).toEqual(await never.json())
                }
            }
        })

        it(`leaves it out of every list ${who} can read`, async () => {
            const listed = await (await ok(await get('/api/spaces/show/projects', token))).json()
            expect(listed.projects.map((p) => p.id).sort()).toEqual(['door'])
            const contents = await (await ok(await get('/api/spaces/show/contents', token))).json()
            expect(contents.projects.map((p) => p.id)).toEqual(['door'])
            expect(JSON.stringify(contents)).not.toContain('Venue Sources')
        })

        it(`gives ${who} no way to write to it, and no hint that it is there`, async () => {
            expect((await send('PATCH', '/api/projects/sources', token, { visibility: 'public' })).status).toBe(404)
            expect((await send('PUT', '/api/projects/sources/document', token, { entities: [] })).status).toBe(404)
            expect((await send('POST', '/api/projects/sources/ops', token, { ops: [] })).status).toBe(404)
        })
    }

    it('keeps it out of the link preview a crawler reads', async () => {
        const card = await (await ok(await get('/og/show/p/sources'))).text()
        expect(card).not.toContain('Venue Sources')
        const vanity = await (await ok(await get('/og/show/sources'))).text()
        expect(vanity).not.toContain('Venue Sources')
        // The public project still previews as itself — the gate is per project.
        expect(await (await ok(await get('/og/show/p/door'))).text()).toContain('The Door')
    })

    it('hands a visitor a saved file without the private project or its bytes', async () => {
        const response = await ok(await get('/api/spaces/show/bundle'))
        const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-vis-bundle-'))
        try {
            const file = path.join(dir, 'show.diiii')
            await writeFile(file, Buffer.from(await response.arrayBuffer()))
            const entries = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' })
            expect(entries).toContain('projects/door/')
            expect(entries).not.toContain('projects/sources')
            expect(entries).not.toContain('projects/notes')
            expect(entries).not.toContain(privateAssetId)
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it('keeps a trashed private project out of a visitor\'s view of the trash', async () => {
        await ok(await send('POST', '/api/spaces/show/projects', ADMIN, { title: 'Old Take', slug: 'old-take', visibility: 'private' }), 201)
        await ok(await fetch(`${server.baseUrl}/api/projects/old-take`, { method: 'DELETE', headers: as(ADMIN) }))
        const visitorTrash = await (await ok(await get('/api/trash?space=show'))).json()
        expect(visitorTrash.projects.map((p) => p.id)).not.toContain('old-take')
        const memberTrash = await (await ok(await get('/api/trash?space=show', ADMIN))).json()
        expect(memberTrash.projects.map((p) => p.id)).toContain('old-take')
    })

    for (const [who, token] of [['the admin', ADMIN], ['an editor scoped to the space', MEMBER]]) {
        it(`shows everything to ${who}, as before`, async () => {
            for (const route of PROJECT_READS) {
                if (route('x').endsWith('/events')) continue // a stream: checked by status below
                const response = await get(route('sources'), token)
                expect({ route: route('sources'), status: response.status }).toEqual({ route: route('sources'), status: 200 })
            }
            const events = await fetch(`${server.baseUrl}/api/projects/sources/events`, { headers: as(token), signal: AbortSignal.timeout(3000) })
            expect(events.status).toBe(200)
            await events.body?.cancel()
            const listed = await (await ok(await get('/api/spaces/show/projects', token))).json()
            expect(listed.projects.map((p) => p.id).sort()).toEqual(['door', 'notes', 'sources'])
            expect(listed.projects.find((p) => p.id === 'sources').visibility).toBe('private')
            const contents = await (await ok(await get('/api/spaces/show/contents', token))).json()
            expect(contents.projects.find((p) => p.id === 'sources')).toMatchObject({ visibility: 'private' })
        })
    }

    it('never lets a shared cache keep a private project\'s bytes', async () => {
        const privateBytes = await ok(await get(`/api/projects/sources/assets/${privateAssetId}`, ADMIN))
        expect(privateBytes.headers.get('cache-control')).toBe('private, no-store')
    })

    it('hands a member a saved file that still holds the private project', async () => {
        const response = await ok(await get('/api/spaces/show/bundle', ADMIN))
        const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-vis-bundle-'))
        try {
            const file = path.join(dir, 'show.diiii')
            await writeFile(file, Buffer.from(await response.arrayBuffer()))
            const entries = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' })
            expect(entries).toContain('projects/sources/')
            expect(entries).toContain(privateAssetId)
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})

describe('who decides, and the front door', () => {
    it('lets only the space owner or an admin change visibility', async () => {
        const denied = await send('PATCH', '/api/projects/sources', MEMBER, { visibility: 'public' })
        expect(denied.status).toBe(403)
        expect((await (await ok(await get('/api/projects/sources', ADMIN))).json()).project.visibility).toBe('private')
        expect((await send('PATCH', '/api/projects/sources', ADMIN, { visibility: 'sideways' })).status).toBe(400)
        expect((await send('POST', '/api/spaces/show/projects', ADMIN, { title: 'Bad', slug: 'bad-vis', visibility: 'hidden' })).status).toBe(400)
    })

    it('refuses to publish a private project as the space\'s front door', async () => {
        const refused = await send('PATCH', '/api/spaces/show', ADMIN, { publishedProjectId: 'sources' })
        expect(refused.status).toBe(409)
        expect(await refused.json()).toMatchObject({ code: 'published_project_private' })
        const space = await (await ok(await get('/api/spaces/show', ADMIN))).json()
        expect(space.space.publishedProjectId).toBe('door')
    })

    it('refuses to make the published project private', async () => {
        const refused = await send('PATCH', '/api/projects/door', ADMIN, { visibility: 'private' })
        expect(refused.status).toBe(409)
        expect(await refused.json()).toMatchObject({ code: 'published_project_private' })
        expect((await (await ok(await get('/api/projects/door'))).json()).project.visibility).toBe('public')
    })

    it('makes a project public again, and a visitor then sees it', async () => {
        await ok(await send('PATCH', '/api/projects/notes', ADMIN, { visibility: 'public' }))
        expect((await get('/api/projects/notes')).status).toBe(200)
        const listed = await (await ok(await get('/api/spaces/show/projects'))).json()
        expect(listed.projects.map((p) => p.id).sort()).toEqual(['door', 'notes'])
    })

    it('closes a visitor\'s open event stream when the project turns private', async () => {
        await ok(await send('POST', '/api/spaces/show/projects', ADMIN, { title: 'Turning', slug: 'turning' }), 201)
        const controller = new AbortController()
        const stream = await fetch(`${server.baseUrl}/api/projects/turning/events`, { signal: controller.signal })
        expect(stream.status).toBe(200)
        const reader = stream.body.getReader()
        const ready = new TextDecoder().decode((await reader.read()).value)
        expect(ready).toContain('event: ready')
        await ok(await send('PATCH', '/api/projects/turning', ADMIN, { visibility: 'private' }))
        let text = ''
        const deadline = Date.now() + 5000
        let done = false
        while (!done && Date.now() < deadline) {
            const chunk = await Promise.race([reader.read(), wait(5000).then(() => ({ done: true, timeout: true }))])
            if (chunk.timeout) break
            done = chunk.done
            if (chunk.value) text += new TextDecoder().decode(chunk.value)
        }
        controller.abort()
        expect(done).toBe(true)
        expect(text).not.toContain('project-visibility')
    })
})
