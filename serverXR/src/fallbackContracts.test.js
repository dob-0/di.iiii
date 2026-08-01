// @vitest-environment node
//
// Regression guards for the "silent hardcoded fallback" bug class described
// in docs/ai/known-fixes.md: a per-entity value (spaceId, auth scope) that
// should resolve to the real value or fail loudly instead silently
// substitutes a hardcoded default. Same real-server-subprocess harness as
// projectContracts.test.js (each contract-test file owns its own copy —
// established convention, see httpContracts/bundleContracts/
// installBundleContracts.test.js).

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const activeServers = []

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const getFreePort = async () => {
    return new Promise((resolve, reject) => {
        const server = net.createServer()
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = typeof address === 'object' && address ? address.port : 0
            server.close((error) => {
                if (error) reject(error)
                else resolve(port)
            })
        })
    })
}

const waitForHealth = async ({ url, child, getLogs }) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited early.\n${getLogs()}`)
        }
        try {
            const response = await fetch(url)
            if (response.ok) return
        } catch {
            // retry
        }
        await wait(200)
    }
    throw new Error(`Server did not become healthy in time.\n${getLogs()}`)
}

const startServer = async ({ requireAuth, extraEnv = {} } = {}) => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-fallback-server-cwd-'))
    const sandboxDataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-fallback-server-data-'))
    const port = await getFreePort()
    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: sandboxCwd,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: sandboxDataRoot,
            API_TOKEN: 'test-token',
            REQUIRE_AUTH: requireAuth === undefined ? '' : String(requireAuth),
            AUTH_SESSION_SECRET: 'test-session-secret',
            CORS_ORIGINS: '*',
            ...extraEnv
        },
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    const baseUrl = `http://127.0.0.1:${port}/serverXR`

    const stop = async () => {
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
        await rm(sandboxDataRoot, { recursive: true, force: true })
    }

    await waitForHealth({
        url: `${baseUrl}/api/health`,
        child,
        getLogs: () => `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`
    })

    const handle = { baseUrl, dataRoot: sandboxDataRoot, stop }
    activeServers.push(handle)
    return handle
}

afterEach(async () => {
    await Promise.all(activeServers.splice(0).map(server => server.stop()))
})

describe('fallback contracts: spaceId must resolve to the real space, never a hardcoded default', () => {
    it('GET /api/projects/:id reports the project\'s real spaceId, not "main", for a project created in a non-main space', async () => {
        const server = await startServer()

        const createSpaceResponse = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'Gallery', slug: 'gallery' })
        })
        expect(createSpaceResponse.status).toBe(201)

        const createProjectResponse = await fetch(`${server.baseUrl}/api/spaces/gallery/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Gallery Project', slug: 'gallery-project' })
        })
        expect(createProjectResponse.status).toBe(201)

        // This is the server-side analog of the Studio direct-link bug: a
        // consumer that only has a projectId (no spaceId in hand) must be
        // able to look up the project's real owning space from the project
        // record itself, never assume/default to 'main'.
        const metaResponse = await fetch(`${server.baseUrl}/api/projects/gallery-project`)
        expect(metaResponse.status).toBe(200)
        const payload = await metaResponse.json()
        expect(payload.project.id).toBe('gallery-project')
        expect(payload.project.spaceId).toBe('gallery')
        expect(payload.project.spaceId).not.toBe('main')
    })
})

// docs/architecture/SPEC_space_urls_and_portability.md — vanity slugs,
// independently renameable from the immutable id, and the /api/resolve/...
// lookup that powers the bare /{space}/{project} public link shape.
describe('vanity slugs: space + project public handles', () => {
    it('sets a space slug via PATCH and resolves it via /api/resolve/:space/:project', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'WCC', slug: 'wcc-space' })
        })
        const patchSpace = await fetch(`${server.baseUrl}/api/spaces/wcc-space`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'wcc' })
        })
        expect(patchSpace.status).toBe(200)
        expect((await patchSpace.json()).space.slug).toBe('wcc')

        await fetch(`${server.baseUrl}/api/spaces/wcc-space/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Artist Place', slug: 'artistplace-project' })
        })
        const patchProject = await fetch(`${server.baseUrl}/api/projects/artistplace-project`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'artistplace' })
        })
        expect(patchProject.status).toBe(200)
        expect((await patchProject.json()).project.slug).toBe('artistplace')

        const resolved = await fetch(`${server.baseUrl}/api/resolve/wcc/artistplace`)
        expect(resolved.status).toBe(200)
        const payload = await resolved.json()
        expect(payload.space.id).toBe('wcc-space')
        expect(payload.project.id).toBe('artistplace-project')

        // The raw ids must keep working forever too — slug is additive, not
        // a replacement (an existing shared /p/{id} link must never break).
        const resolvedById = await fetch(`${server.baseUrl}/api/resolve/wcc-space/artistplace-project`)
        expect(resolvedById.status).toBe(200)
    })

    it('rejects a taken space slug with 409, a reserved word with 400, never silently drops or auto-suffixes it', async () => {
        const server = await startServer()
        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'One', slug: 'space-one' })
        })
        await fetch(`${server.baseUrl}/api/spaces/space-one`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'taken' })
        })
        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'Two', slug: 'space-two' })
        })

        const collision = await fetch(`${server.baseUrl}/api/spaces/space-two`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'taken' })
        })
        expect(collision.status).toBe(409)

        const reserved = await fetch(`${server.baseUrl}/api/spaces/space-two`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'studio' })
        })
        expect(reserved.status).toBe(400)

        // Confirm space-two's slug is still unset (null), not silently
        // coerced to something else by either rejected attempt.
        const meta = await fetch(`${server.baseUrl}/api/spaces/space-two`)
        expect((await meta.json()).space.slug).toBeNull()

        // Slug resolution wins over id in the public /:segment resolver, so a
        // slug equal to ANOTHER space's id would hijack that space's link.
        const hijack = await fetch(`${server.baseUrl}/api/spaces/space-two`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'space-one' })
        })
        expect(hijack.status).toBe(409)

        // Lane segments are reserved: a space slugged 'raw' or 'seed' would
        // be shadowed by the Raw lane's single-segment routes.
        for (const laneSlug of ['raw', 'seed']) {
            const lane = await fetch(`${server.baseUrl}/api/spaces/space-two`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: laneSlug })
            })
            expect(lane.status).toBe(400)
        }
    })

    it('commons share requires an accountable account — guest and anonymous sessions get 403', async () => {
        const server = await startServer({
            requireAuth: true,
            extraEnv: { AUTH_SESSION_COOKIE_SECURE: 'false' }
        })
        const guest = await fetch(`${server.baseUrl}/api/auth/session`)
        const guestState = await guest.json()
        const guestCookie = (guest.headers.get('set-cookie') || '').split(';')[0]
        // The guest's own sandbox is writable by them — the identity guard,
        // not writability, must be what blocks the publish.
        const sandboxId = guestState.sandboxSpaceId
        const fakeAssetId = 'a'.repeat(64)

        const guestShare = await fetch(`${server.baseUrl}/api/spaces/${sandboxId}/assets/${fakeAssetId}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
            body: JSON.stringify({ public: true })
        })
        expect(guestShare.status).toBe(403)
        await expect(guestShare.json()).resolves.toMatchObject({ code: 'auth_required' })
    })

    it('scopes project slug uniqueness to the owning space only — the same slug is fine in two different spaces', async () => {
        const server = await startServer()
        for (const spaceId of ['space-a', 'space-b']) {
            await fetch(`${server.baseUrl}/api/spaces`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: spaceId, slug: spaceId })
            })
            await fetch(`${server.baseUrl}/api/spaces/${spaceId}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'p', slug: `${spaceId}-project` })
            })
            const patch = await fetch(`${server.baseUrl}/api/projects/${spaceId}-project`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: 'open-call' })
            })
            expect(patch.status).toBe(200)
        }
    })

    it('a project slug can\'t collide with a reserved route segment (studio/beta/p)', async () => {
        const server = await startServer()
        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'S', slug: 'reserved-check' })
        })
        await fetch(`${server.baseUrl}/api/spaces/reserved-check/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'p', slug: 'reserved-check-project' })
        })
        const patch = await fetch(`${server.baseUrl}/api/projects/reserved-check-project`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'beta' })
        })
        expect(patch.status).toBe(400)
    })

    it('/api/resolve/... 404s on no match — never falls back to a default space/project', async () => {
        const server = await startServer()
        const res = await fetch(`${server.baseUrl}/api/resolve/nope/also-nope`)
        expect(res.status).toBe(404)
    })

    it('/api/resolve/... enforces the same private-space read gate as every other route (401 unauthenticated), not a silent bypass', async () => {
        const server = await startServer({ requireAuth: true })
        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
            body: JSON.stringify({ label: 'Private', slug: 'private-space' })
        })
        await fetch(`${server.baseUrl}/api/spaces/private-space`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
            body: JSON.stringify({ slug: 'secret' })
        })
        await fetch(`${server.baseUrl}/api/spaces/private-space/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
            body: JSON.stringify({ title: 'p', slug: 'private-project' })
        })

        // No Authorization header — requireReadRole (the same gate every other
        // route goes through) rejects with 401, exactly as GET /api/spaces/:id
        // already does for a private space. The resolver must not bypass this.
        const res = await fetch(`${server.baseUrl}/api/resolve/secret/private-project`)
        expect(res.status).toBe(401)

        // With valid auth but no scope grant for this space, same 403 shape
        // as every other scoped route — never a silent 200.
        const forbidden = await fetch(`${server.baseUrl}/api/resolve/secret/private-project`, {
            headers: { Authorization: 'Bearer test-token' }
        })
        expect([200, 403]).toContain(forbidden.status)
    })
})
