// @vitest-environment node

import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const activeServers = []

const getFreePort = async () => {
    return new Promise((resolve, reject) => {
        const server = net.createServer()
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = typeof address === 'object' && address ? address.port : 0
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve(port)
            })
        })
    })
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const waitForHealth = async ({ url, child, getLogs }) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited early.\n${getLogs()}`)
        }
        try {
            const response = await fetch(url)
            if (response.ok) {
                return
            }
        } catch {
            // retry until the deadline
        }
        await wait(200)
    }
    throw new Error(`Server did not become healthy in time.\n${getLogs()}`)
}

const startServer = async ({
    nodeEnv = 'test',
    appBasePath = '/serverXR',
    apiToken = 'test-token',
    requireAuth,
    releaseManifest = null,
    extraEnv = {}
} = {}) => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-server-cwd-'))
    const sandboxDataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-server-data-'))
    const port = await getFreePort()
    const releaseFilePath = path.join(sandboxDataRoot, 'release.json')

    if (releaseManifest) {
        await writeFile(releaseFilePath, `${JSON.stringify(releaseManifest, null, 2)}\n`)
    }

    const childEnv = {
        ...process.env,
        PORT: String(port),
        NODE_ENV: nodeEnv,
        APP_BASE_PATH: appBasePath,
        DATA_ROOT: sandboxDataRoot,
        API_TOKEN: apiToken,
        CORS_ORIGINS: '*',
        ...(releaseManifest ? { SERVERXR_RELEASE_FILE: releaseFilePath } : {}),
        ...extraEnv
    }

    delete childEnv.SPACES_DIR
    delete childEnv.UPLOADS_DIR

    childEnv.REQUIRE_AUTH = requireAuth === undefined ? '' : String(requireAuth)

    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: sandboxCwd,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
    })

    const baseUrl = `http://127.0.0.1:${port}${appBasePath || ''}`
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

    const handle = {
        baseUrl,
        dataRoot: sandboxDataRoot,
        apiToken,
        logs: () => `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
        stop
    }
    activeServers.push(handle)
    return handle
}

const withAuth = (token) => ({
    Authorization: `Bearer ${token}`
})

const createServerProject = async (server, spaceId, {
    title = 'Live Project',
    slug = 'live-project',
    source = 'studio-v3'
} = {}) => {
    const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...withAuth(server.apiToken)
        },
        body: JSON.stringify({ title, slug, source })
    })
    expect(response.status).toBe(201)
    const payload = await response.json()
    return payload.project
}

const createReadOnlySpace = async (server, spaceId = 'locked-space') => {
    const response = await fetch(`${server.baseUrl}/api/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
        body: JSON.stringify({ slug: spaceId, label: 'Locked Space', permanent: true, allowEdits: false })
    })
    expect(response.status).toBe(201)
    return spaceId
}

const createSpaceWithScene = async (server, {
    spaceId = 'asset-space',
    scene
} = {}) => {
    const createRes = await fetch(`${server.baseUrl}/api/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
        body: JSON.stringify({ slug: spaceId, label: 'Asset Space', permanent: true })
    })
    expect(createRes.status).toBe(201)
    if (scene) {
        const sceneRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify(scene)
        })
        expect(sceneRes.status).toBe(200)
    }
    return spaceId
}

afterEach(async () => {
    await Promise.all(activeServers.splice(0).map(server => server.stop()))
})

describe('server write contracts', () => {
    it('requires auth by default in production when REQUIRE_AUTH is unset', async () => {
        const server = await startServer({ nodeEnv: 'production' })

        const unauthenticated = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'Prod Space', slug: 'prod-space' })
        })
        expect(unauthenticated.status).toBe(401)

        const authenticated = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ label: 'Prod Space', slug: 'prod-space' })
        })
        expect(authenticated.status).toBe(201)
    })

    it('accepts signed auth session cookies for production writes', async () => {
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false'
            }
        })

        const login = await fetch(`${server.baseUrl}/api/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: server.apiToken })
        })
        expect(login.status).toBe(200)
        const loginPayload = await login.json()
        expect(loginPayload.authenticated).toBe(true)

        const setCookie = login.headers.get('set-cookie') || ''
        expect(setCookie).toContain('dii_serverxr_session=')
        expect(setCookie).toContain('HttpOnly')
        expect(setCookie).toContain('SameSite=Lax')

        const cookie = setCookie.split(';')[0]
        const sessionStatus = await fetch(`${server.baseUrl}/api/auth/session`, {
            headers: { Cookie: cookie }
        })
        expect(sessionStatus.status).toBe(200)
        await expect(sessionStatus.json()).resolves.toMatchObject({
            requireAuth: true,
            authenticated: true,
            type: 'session',
            role: 'admin',
            subject: 'legacy-admin'
        })

        const created = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: cookie
            },
            body: JSON.stringify({ label: 'Cookie Space', slug: 'cookie-space' })
        })
        expect(created.status).toBe(201)
    })

    it('limits editor credentials to allowed spaces and reserves space management for admins', async () => {
        const editorToken = 'editor-token'
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                EDITOR_API_TOKEN: editorToken,
                EDITOR_ALLOWED_SPACES: 'role-space'
            }
        })

        const createSpaceResponse = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ label: 'Role Space', slug: 'role-space' })
        })
        expect(createSpaceResponse.status).toBe(201)

        const createOtherSpaceResponse = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ label: 'Other Space', slug: 'other-space' })
        })
        expect(createOtherSpaceResponse.status).toBe(201)

        const editorProjectResponse = await fetch(`${server.baseUrl}/api/spaces/role-space/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(editorToken)
            },
            body: JSON.stringify({ title: 'Editor Project', slug: 'editor-project', source: 'studio-v3' })
        })
        expect(editorProjectResponse.status).toBe(201)

        const otherProject = await createServerProject(server, 'other-space', {
            title: 'Other Project',
            slug: 'other-project'
        })

        const deniedOtherSpaceWrite = await fetch(`${server.baseUrl}/api/spaces/other-space/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(editorToken)
            },
            body: JSON.stringify({ title: 'Blocked Project', slug: 'blocked-project', source: 'studio-v3' })
        })
        expect(deniedOtherSpaceWrite.status).toBe(403)
        await expect(deniedOtherSpaceWrite.json()).resolves.toMatchObject({
            error: 'Space access denied.',
            requiredSpaceId: 'other-space',
            allowedSpaces: ['role-space']
        })

        const deniedOtherProjectWrite = await fetch(`${server.baseUrl}/api/projects/${otherProject.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(editorToken)
            },
            body: JSON.stringify({ title: 'Blocked Rename' })
        })
        expect(deniedOtherProjectWrite.status).toBe(403)
        await expect(deniedOtherProjectWrite.json()).resolves.toMatchObject({
            error: 'Space access denied.',
            requiredSpaceId: 'other-space',
            allowedSpaces: ['role-space']
        })

        // Space creation is open to signed-in accounts (governed by the free-tier
        // quota), but an API-token identity is not a session account, so it is
        // still blocked — now with an account-required error rather than admin-role.
        const deniedCreate = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(editorToken)
            },
            body: JSON.stringify({ label: 'Denied Space', slug: 'denied-space' })
        })
        expect(deniedCreate.status).toBe(403)
        await expect(deniedCreate.json()).resolves.toMatchObject({
            code: 'auth_required'
        })

        const editorLogin = await fetch(`${server.baseUrl}/api/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: editorToken })
        })
        expect(editorLogin.status).toBe(200)
        await expect(editorLogin.json()).resolves.toMatchObject({
            authenticated: true,
            role: 'editor',
            subject: 'editor',
            spaces: ['role-space']
        })
        const editorCookie = (editorLogin.headers.get('set-cookie') || '').split(';')[0]

        const deniedPublish = await fetch(`${server.baseUrl}/api/spaces/role-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Cookie: editorCookie
            },
            body: JSON.stringify({ publishedProjectId: 'editor-project' })
        })
        // In scope, but not the owner (the space was created by the admin API
        // token, so it has no ownerUserId) — space management is owner-or-admin.
        expect(deniedPublish.status).toBe(403)
        await expect(deniedPublish.json()).resolves.toMatchObject({
            error: 'Only the space owner or an admin can manage this space.'
        })

        const deniedDelete = await fetch(`${server.baseUrl}/api/projects/editor-project`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(editorToken)
            }
        })
        expect(deniedDelete.status).toBe(403)
        await expect(deniedDelete.json()).resolves.toMatchObject({
            error: 'Admin role required.',
            requiredRole: 'admin',
            currentRole: 'editor'
        })

        const editorSession = await fetch(`${server.baseUrl}/api/auth/session`, {
            headers: { Cookie: editorCookie }
        })
        expect(editorSession.status).toBe(200)
        await expect(editorSession.json()).resolves.toMatchObject({
            requireAuth: true,
            authenticated: true,
            type: 'session',
            role: 'editor',
            subject: 'editor',
            spaces: ['role-space']
        })

        const mixedSessionAndTokenStatus = await fetch(`${server.baseUrl}/api/auth/session`, {
            headers: {
                Cookie: editorCookie,
                ...withAuth(server.apiToken)
            }
        })
        expect(mixedSessionAndTokenStatus.status).toBe(200)
        await expect(mixedSessionAndTokenStatus.json()).resolves.toMatchObject({
            authenticated: true,
            type: 'session',
            role: 'editor',
            subject: 'editor',
            spaces: ['role-space']
        })

        const mixedSessionAndAdminTokenWrite = await fetch(`${server.baseUrl}/api/spaces/role-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Cookie: editorCookie,
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ publishedProjectId: null })
        })
        expect(mixedSessionAndAdminTokenWrite.status).toBe(403)
        await expect(mixedSessionAndAdminTokenWrite.json()).resolves.toMatchObject({
            error: 'Only the space owner or an admin can manage this space.'
        })

        const adminDelete = await fetch(`${server.baseUrl}/api/projects/editor-project`, {
            method: 'DELETE',
            headers: withAuth(server.apiToken)
        })
        expect(adminDelete.status).toBe(200)
        await expect(adminDelete.json()).resolves.toMatchObject({ ok: true })
    })

    it('lets a signed-in account create spaces up to the free limit, then blocks more', async () => {
        const editorToken = 'quota-editor-token'
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                EDITOR_API_TOKEN: editorToken,
                EDITOR_ALLOWED_SPACES: 'seed-space',
                FREE_SPACE_LIMIT: '2'
            }
        })

        // An API-token identity is not a signed-in account — blocked.
        const tokenCreate = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(editorToken) },
            body: JSON.stringify({ label: 'Token Space', slug: 'token-space' })
        })
        expect(tokenCreate.status).toBe(403)
        await expect(tokenCreate.json()).resolves.toMatchObject({ code: 'auth_required' })

        // Log the editor into a session, then create within the quota.
        const login = await fetch(`${server.baseUrl}/api/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: editorToken })
        })
        expect(login.status).toBe(200)
        const cookie = (login.headers.get('set-cookie') || '').split(';')[0]

        const create = (slug) => fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ label: slug, slug })
        })

        expect((await create('quota-one')).status).toBe(201)
        expect((await create('quota-two')).status).toBe(201)

        const third = await create('quota-three')
        expect(third.status).toBe(403)
        await expect(third.json()).resolves.toMatchObject({ code: 'space_limit', limit: 2, owned: 2 })

        const status = await fetch(`${server.baseUrl}/api/auth/session`, { headers: { Cookie: cookie } })
        await expect(status.json()).resolves.toMatchObject({
            spaceLimit: 2,
            ownedSpaceCount: 2,
            canCreateSpace: false
        })
    })

    it('lets a space owner self-manage their space, but keeps admin-only fields and others\' spaces off-limits', async () => {
        const editorToken = 'owner-editor-token'
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                EDITOR_API_TOKEN: editorToken,
                // Token-login sessions are not DB users, so the on-create scope
                // grant can't reach them — pre-scope the owned space instead.
                EDITOR_ALLOWED_SPACES: 'admin-space,owned-space'
            }
        })

        // Space created by the admin API token — no ownerUserId.
        const adminSpace = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ label: 'Admin Space', slug: 'admin-space' })
        })
        expect(adminSpace.status).toBe(201)

        const login = await fetch(`${server.baseUrl}/api/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: editorToken })
        })
        expect(login.status).toBe(200)
        const cookie = (login.headers.get('set-cookie') || '').split(';')[0]

        // The session account creates a space and becomes its owner.
        const created = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ label: 'Mine', slug: 'owned-space' })
        })
        expect(created.status).toBe(201)

        // GET /api/spaces reports isOwner per requester.
        const listed = await fetch(`${server.baseUrl}/api/spaces`, { headers: { Cookie: cookie } })
        const { spaces } = await listed.json()
        const bySlug = Object.fromEntries(spaces.map(space => [space.id, space.isOwner]))
        expect(bySlug['owned-space']).toBe(true)
        expect(bySlug['admin-space']).toBe(false)

        // Owner self-service: rename, visibility, publish target.
        const ownerProject = await createServerProject(server, 'owned-space', { title: 'Own Project', slug: 'own-project' })
        const patched = await fetch(`${server.baseUrl}/api/spaces/owned-space`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ label: 'Renamed Mine', isPublic: true, publishedProjectId: ownerProject.id })
        })
        expect(patched.status).toBe(200)
        await expect(patched.json()).resolves.toMatchObject({
            space: { label: 'Renamed Mine', isPublic: true, publishedProjectId: ownerProject.id }
        })

        // kind/permanent change platform behavior — admin-only even for the owner.
        const deniedKind = await fetch(`${server.baseUrl}/api/spaces/owned-space`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ permanent: true })
        })
        expect(deniedKind.status).toBe(403)
        await expect(deniedKind.json()).resolves.toMatchObject({
            error: 'Only an admin can change kind or permanent.'
        })

        // Someone else's space stays off-limits even in scope.
        const deniedOther = await fetch(`${server.baseUrl}/api/spaces/admin-space`, {
            method: 'DELETE',
            headers: { Cookie: cookie }
        })
        expect(deniedOther.status).toBe(403)
        await expect(deniedOther.json()).resolves.toMatchObject({
            error: 'Only the space owner or an admin can manage this space.'
        })

        // Owner deletes their own project, then their own space.
        const deletedProject = await fetch(`${server.baseUrl}/api/projects/${ownerProject.id}`, {
            method: 'DELETE',
            headers: { Cookie: cookie }
        })
        expect(deletedProject.status).toBe(200)

        const deletedSpace = await fetch(`${server.baseUrl}/api/spaces/owned-space`, {
            method: 'DELETE',
            headers: { Cookie: cookie }
        })
        expect(deletedSpace.status).toBe(200)
        await expect(deletedSpace.json()).resolves.toMatchObject({ ok: true })
    })

    it('gives every session the communal open space plus one private sandbox', async () => {
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                GUEST_SPACES: ''
            }
        })

        // Fresh anonymous visitor → guest session scoped to the open space
        // plus a private sandbox.
        const guest = await fetch(`${server.baseUrl}/api/auth/session`)
        expect(guest.status).toBe(200)
        const guestState = await guest.json()
        expect(guestState).toMatchObject({ authenticated: true, type: 'guest', role: 'editor', openSpaceId: 'open' })
        expect(guestState.spaces).toHaveLength(2)
        expect(guestState.spaces[0]).toBe('open')
        expect(guestState.spaces[1]).toMatch(/^sandbox-/)
        expect(guestState.sandboxSpaceId).toBe(guestState.spaces[1])
        const guestCookie = (guest.headers.get('set-cookie') || '').split(';')[0]

        // Two guests share the open space but never a sandbox.
        const secondGuest = await fetch(`${server.baseUrl}/api/auth/session`)
        const secondState = await secondGuest.json()
        expect(secondState.spaces[0]).toBe('open')
        expect(secondState.spaces[1]).not.toBe(guestState.spaces[1])

        // The open space is ensured at boot — public, communal, sweep-proof —
        // and guests can write to it.
        const openMeta = await fetch(`${server.baseUrl}/api/spaces/open`, { headers: { Cookie: guestCookie } })
        expect(openMeta.status).toBe(200)
        await expect(openMeta.json()).resolves.toMatchObject({ space: { kind: 'global', isPublic: true } })
        const openWrite = await fetch(`${server.baseUrl}/api/spaces/open/scene`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
            body: JSON.stringify({ objects: [{ id: 'guest-cube' }], assets: [] })
        })
        expect(openWrite.status).toBe(200)

        // The shared jam project is ensured with the space — the door never
        // opens onto an empty project hub.
        const jam = await fetch(`${server.baseUrl}/api/projects/open-jam`, { headers: { Cookie: guestCookie } })
        expect(jam.status).toBe(200)
        await expect(jam.json()).resolves.toMatchObject({ project: { id: 'open-jam', spaceId: 'open' } })

        // Guests cannot create named spaces.
        const guestCreate = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
            body: JSON.stringify({ label: 'Guest Space', slug: 'guest-space' })
        })
        expect(guestCreate.status).toBe(403)
        await expect(guestCreate.json()).resolves.toMatchObject({ code: 'auth_required' })

        // Issuing sessions alone writes nothing: sandboxes are provisioned
        // lazily on first access, so pure viewers never mint spaces.
        const sandboxId = guestState.spaces[1]
        const adminListBefore = await fetch(`${server.baseUrl}/api/spaces`, { headers: withAuth(server.apiToken) })
        const beforeIds = (await adminListBefore.json()).spaces.map((s) => s.id)
        expect(beforeIds).toContain('open')
        expect(beforeIds.some((id) => id.startsWith('sandbox-'))).toBe(false)

        // The guest still sees their own sandbox card (synthesized until provisioned).
        const guestList = await fetch(`${server.baseUrl}/api/spaces`, { headers: { Cookie: guestCookie } })
        const guestSpaces = (await guestList.json()).spaces
        expect(guestSpaces.some((s) => s.id === sandboxId && s.kind === 'sandbox')).toBe(true)

        // First real access provisions the sandbox for its own session…
        const scene = await fetch(`${server.baseUrl}/api/spaces/${sandboxId}/scene`, { headers: { Cookie: guestCookie } })
        expect(scene.status).toBe(200)
        const provisioned = await fetch(`${server.baseUrl}/api/spaces/${sandboxId}`, { headers: withAuth(server.apiToken) })
        expect(provisioned.status).toBe(200)
        await expect(provisioned.json()).resolves.toMatchObject({ space: { kind: 'sandbox', label: 'Guest Sandbox' } })

        // …while a stranger requesting an unprovisioned sandbox id mints nothing.
        const strangerProbe = await fetch(`${server.baseUrl}/api/spaces/${secondState.spaces[1]}`, { headers: withAuth(server.apiToken) })
        expect(strangerProbe.status).toBe(404)

        // Even once provisioned, sandboxes stay out of everyone else's
        // directory — the admin gets the collapsed summary instead of cards.
        const adminListAfter = await fetch(`${server.baseUrl}/api/spaces`, { headers: withAuth(server.apiToken) })
        const adminAfter = await adminListAfter.json()
        expect(adminAfter.spaces.some((s) => s.id.startsWith('sandbox-'))).toBe(false)
        expect(adminAfter.sandboxSummary).toMatchObject({ total: 1 })

        // Admin repoints the open space → new guests land there, sandbox still private.
        const sharedSpace = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ label: 'Shared Main', slug: 'shared-main' })
        })
        expect(sharedSpace.status).toBe(201)
        const configPatch = await fetch(`${server.baseUrl}/api/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ globalSpaceId: 'shared-main' })
        })
        expect(configPatch.status).toBe(200)

        const sharedGuest = await fetch(`${server.baseUrl}/api/auth/session`)
        const sharedState = await sharedGuest.json()
        expect(sharedState.type).toBe('guest')
        expect(sharedState.spaces[0]).toBe('shared-main')
        expect(sharedState.spaces[1]).toMatch(/^sandbox-/)
    })

    it('accounts reach their own persistent sandbox without cookie scope, and admins can purge stale guest sandboxes', async () => {
        const editorToken = 'sandbox-editor-token'
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                SANDBOX_TTL_MS: '1',
                EDITOR_API_TOKEN: editorToken,
                EDITOR_ALLOWED_SPACES: 'role-space'
            }
        })

        // Mint a cookie session for the editor identity (stands in for an
        // OAuth account: type 'session', non-guest subject, scoped spaces).
        const mint = await fetch(`${server.baseUrl}/api/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: editorToken })
        })
        expect(mint.status).toBe(200)
        const accountCookie = (mint.headers.get('set-cookie') || '').split(';')[0]

        // The session reports its deterministic sandbox even though the
        // cookie scope never mentions it.
        const session = await fetch(`${server.baseUrl}/api/auth/session`, { headers: { Cookie: accountCookie } })
        const sessionState = await session.json()
        expect(sessionState.sandboxSpaceId).toMatch(/^sandbox-/)
        expect(sessionState.spaces || []).not.toContain(sessionState.sandboxSpaceId)

        // First access provisions it as a permanent (sweep-proof) sandbox.
        const sceneRead = await fetch(`${server.baseUrl}/api/spaces/${sessionState.sandboxSpaceId}/scene`, {
            headers: { Cookie: accountCookie }
        })
        expect(sceneRead.status).toBe(200)
        const meta = await fetch(`${server.baseUrl}/api/spaces/${sessionState.sandboxSpaceId}`, { headers: withAuth(server.apiToken) })
        await expect(meta.json()).resolves.toMatchObject({ space: { kind: 'sandbox', label: 'Sandbox', permanent: true } })

        // A guest provisions a throwaway sandbox; with SANDBOX_TTL_MS=1 it is
        // immediately stale — the admin purge removes it but never the
        // permanent account sandbox.
        const guest = await fetch(`${server.baseUrl}/api/auth/session`)
        const guestState = await guest.json()
        const guestCookie = (guest.headers.get('set-cookie') || '').split(';')[0]
        await fetch(`${server.baseUrl}/api/spaces/${guestState.sandboxSpaceId}/scene`, { headers: { Cookie: guestCookie } })
        await wait(20)

        const purge = await fetch(`${server.baseUrl}/api/admin/sandboxes/purge`, {
            method: 'POST',
            headers: withAuth(server.apiToken)
        })
        expect(purge.status).toBe(200)
        await expect(purge.json()).resolves.toMatchObject({ ok: true, removed: 1 })
        const guestProbe = await fetch(`${server.baseUrl}/api/spaces/${guestState.sandboxSpaceId}`, { headers: withAuth(server.apiToken) })
        expect(guestProbe.status).toBe(404)
        const accountProbe = await fetch(`${server.baseUrl}/api/spaces/${sessionState.sandboxSpaceId}`, { headers: withAuth(server.apiToken) })
        expect(accountProbe.status).toBe(200)
    })

    it('restores the open space scene from its boot snapshot', async () => {
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: { AUTH_SESSION_COOKIE_SECURE: 'false' }
        })

        // Vandalize the open space…
        const vandalize = await fetch(`${server.baseUrl}/api/spaces/open/scene`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ objects: [{ id: 'vandal' }], assets: [] })
        })
        expect(vandalize.status).toBe(200)

        // …then restore the latest snapshot (taken at boot; poll briefly in
        // case the boot snapshot write is still in flight).
        let restore
        const deadline = Date.now() + 5000
        for (;;) {
            restore = await fetch(`${server.baseUrl}/api/spaces/open/restore-snapshot`, {
                method: 'POST',
                headers: withAuth(server.apiToken)
            })
            if (restore.status !== 404 || Date.now() > deadline) break
            await wait(200)
        }
        expect(restore.status).toBe(200)
        const restored = await restore.json()
        expect(restored.ok).toBe(true)
        expect(restored.restoredFrom).toBeTruthy()

        const scene = await (await fetch(`${server.baseUrl}/api/spaces/open/scene`, { headers: withAuth(server.apiToken) })).json()
        expect((scene.scene.objects || []).some((o) => o.id === 'vandal')).toBe(false)
    })

    it('enforces the same space scope on reads as on writes, except for isPublic spaces', async () => {
        const editorToken = 'reader-editor-token'
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                EDITOR_API_TOKEN: editorToken,
                EDITOR_ALLOWED_SPACES: 'role-space'
            }
        })

        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ label: 'Role Space', slug: 'role-space' })
        })
        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ label: 'Other Space', slug: 'other-space' })
        })

        const deniedRead = await fetch(`${server.baseUrl}/api/spaces/other-space`, {
            headers: withAuth(editorToken)
        })
        expect(deniedRead.status).toBe(403)
        await expect(deniedRead.json()).resolves.toMatchObject({
            error: 'Space access denied.',
            requiredSpaceId: 'other-space',
            allowedSpaces: ['role-space']
        })

        const unauthenticatedRead = await fetch(`${server.baseUrl}/api/spaces/other-space`)
        expect(unauthenticatedRead.status).toBe(401)

        const allowedRead = await fetch(`${server.baseUrl}/api/spaces/role-space`, {
            headers: withAuth(editorToken)
        })
        expect(allowedRead.status).toBe(200)

        const makePublic = await fetch(`${server.baseUrl}/api/spaces/other-space`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ isPublic: true })
        })
        expect(makePublic.status).toBe(200)

        const publicReadNoAuth = await fetch(`${server.baseUrl}/api/spaces/other-space`)
        expect(publicReadNoAuth.status).toBe(200)
        await expect(publicReadNoAuth.json()).resolves.toMatchObject({
            space: expect.objectContaining({ id: 'other-space', isPublic: true })
        })

        const publicReadOutOfScopeToken = await fetch(`${server.baseUrl}/api/spaces/other-space`, {
            headers: withAuth(editorToken)
        })
        expect(publicReadOutOfScopeToken.status).toBe(200)
    })

    it('scopes the GET /api/spaces list to public spaces plus the caller\'s own scope', async () => {
        const editorToken = 'list-scope-editor-token'
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                EDITOR_API_TOKEN: editorToken,
                EDITOR_ALLOWED_SPACES: 'role-space'
            }
        })

        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ label: 'Role Space', slug: 'role-space' })
        })
        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ label: 'Public Space', slug: 'public-space' })
        })
        await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ label: 'Hidden Space', slug: 'hidden-space' })
        })
        await fetch(`${server.baseUrl}/api/spaces/public-space`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ isPublic: true })
        })

        const unauthenticatedList = await fetch(`${server.baseUrl}/api/spaces`)
        expect(unauthenticatedList.status).toBe(200)
        // The communal open space is public by design, so it shows for everyone.
        const unauthenticatedIds = (await unauthenticatedList.json()).spaces.map((space) => space.id).sort()
        expect(unauthenticatedIds).toEqual(['open', 'public-space'])

        const editorList = await fetch(`${server.baseUrl}/api/spaces`, {
            headers: withAuth(editorToken)
        })
        expect(editorList.status).toBe(200)
        const editorIds = (await editorList.json()).spaces.map((space) => space.id).sort()
        expect(editorIds).toEqual(['open', 'public-space', 'role-space'])

        const adminList = await fetch(`${server.baseUrl}/api/spaces`, {
            headers: withAuth(server.apiToken)
        })
        expect(adminList.status).toBe(200)
        const adminIds = (await adminList.json()).spaces.map((space) => space.id).sort()
        expect(adminIds).toEqual(['hidden-space', 'main', 'open', 'public-space', 'role-space'])
    })

    it('restricts /api/users to admins on every method, including GET', async () => {
        const editorToken = 'user-mgmt-editor-token'
        const server = await startServer({
            nodeEnv: 'production',
            extraEnv: {
                AUTH_SESSION_COOKIE_SECURE: 'false',
                EDITOR_API_TOKEN: editorToken
            }
        })

        const unauthenticatedList = await fetch(`${server.baseUrl}/api/users`)
        expect(unauthenticatedList.status).toBe(401)

        const editorList = await fetch(`${server.baseUrl}/api/users`, {
            headers: withAuth(editorToken)
        })
        expect(editorList.status).toBe(403)
        await expect(editorList.json()).resolves.toMatchObject({
            error: 'Admin role required.',
            requiredRole: 'admin',
            currentRole: 'editor'
        })

        const adminList = await fetch(`${server.baseUrl}/api/users`, {
            headers: withAuth(server.apiToken)
        })
        expect(adminList.status).toBe(200)
        await expect(adminList.json()).resolves.toMatchObject({ users: [] })

        const editorPatch = await fetch(`${server.baseUrl}/api/users/some-user-id`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(editorToken) },
            body: JSON.stringify({ spaces: ['main'] })
        })
        expect(editorPatch.status).toBe(403)

        const adminPatchMissing = await fetch(`${server.baseUrl}/api/users/some-user-id`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ spaces: ['main'] })
        })
        expect(adminPatchMissing.status).toBe(404)
    })

    it('allows writes outside production when REQUIRE_AUTH is unset', async () => {
        const server = await startServer({ nodeEnv: 'test' })

        const response = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'Dev Space', slug: 'dev-space' })
        })

        expect(response.status).toBe(201)
    })

    it('mounts health at the root when APP_BASE_PATH is empty', async () => {
        const server = await startServer({ appBasePath: '' })
        const response = await fetch(`${server.baseUrl}/api/health`)
        expect(response.status).toBe(200)
    })

    it('mounts health under custom base paths', async () => {
        const server = await startServer({ appBasePath: '/nested/app' })
        const response = await fetch(`${server.baseUrl}/api/health`)
        expect(response.status).toBe(200)
    })

    it('hides recent-events detail from unauthenticated callers when auth is required', async () => {
        const server = await startServer({ requireAuth: true })

        const response = await fetch(`${server.baseUrl}/api/events`)

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ events: [] })
    })

    it('returns full recent-events detail for an admin-authenticated caller', async () => {
        const server = await startServer({ requireAuth: true })

        // Generate at least one request for /api/events to report back.
        await fetch(`${server.baseUrl}/api/health`)

        const response = await fetch(`${server.baseUrl}/api/events`, {
            headers: withAuth(server.apiToken)
        })

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(Array.isArray(body.events)).toBe(true)
        expect(body.events.length).toBeGreaterThan(0)
    })

    it('still returns full recent-events detail unauthenticated when REQUIRE_AUTH is unset', async () => {
        const server = await startServer({ nodeEnv: 'test' })

        const response = await fetch(`${server.baseUrl}/api/events`)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(Array.isArray(body.events)).toBe(true)
    })

    it('reports release metadata from the runtime manifest', async () => {
        const releaseManifest = {
            deployEnv: 'staging',
            sourceRef: 'dev',
            gitCommit: 'abcdef1234567890',
            releaseId: 'cpanel-20260412-120000',
            generatedAt: '2026-04-12T12:00:00.000Z'
        }
        const server = await startServer({ releaseManifest })
        const response = await fetch(`${server.baseUrl}/api/health`)

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            release: releaseManifest
        })
    })

    it('hydrates a scene asset manifest from object asset refs for legacy scenes', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })
        const assetId = '4c122913-7872-42b3-8b04-9f73942022fd'
        const spaceId = await createSpaceWithScene(server, {
            scene: {
                version: 4,
                objects: [{
                    id: 'image-1',
                    type: 'image',
                    assetRef: {
                        id: assetId,
                        name: '1.webp',
                        mimeType: 'image/webp',
                        size: 6872,
                        createdAt: 1773766320415
                    }
                }]
            }
        })
        const assetsDir = path.join(server.dataRoot, 'spaces', spaceId, 'assets')
        await writeFile(path.join(assetsDir, assetId), Buffer.from('image'))
        await writeFile(path.join(assetsDir, `${assetId}.json`), JSON.stringify({
            id: assetId,
            name: '1.webp',
            mimeType: 'image/webp',
            size: 5,
            createdAt: 1773766320415
        }, null, 2))

        const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`, {
            headers: withAuth(server.apiToken)
        })
        expect(response.status).toBe(200)

        const payload = await response.json()
        expect(payload.version).toBe(1)
        expect(payload.scene.assetsBaseUrl).toBe(`/serverXR/api/spaces/${spaceId}/assets`)
        expect(payload.scene.assets).toEqual([
            expect.objectContaining({
                id: assetId,
                name: '1.webp',
                mimeType: 'image/webp',
                url: `/serverXR/api/spaces/${spaceId}/assets/${assetId}`
            })
        ])
    })

    it('omits scene asset manifest entries when the backing asset file is missing', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })
        const assetId = '4c122913-7872-42b3-8b04-9f73942022fd'
        const missingAssetId = '5d233024-8983-4ba6-a7df-61818c45ec60'
        const spaceId = await createSpaceWithScene(server, {
            scene: {
                version: 4,
                objects: [{
                    id: 'image-1',
                    type: 'image',
                    assetRef: {
                        id: assetId,
                        name: '1.webp',
                        mimeType: 'image/webp',
                        size: 6872,
                        createdAt: 1773766320415
                    }
                }],
                assets: [
                    {
                        id: assetId,
                        name: '1.webp',
                        mimeType: 'image/webp',
                        archivePath: `assets/${assetId}`
                    },
                    {
                        id: missingAssetId,
                        name: 'missing.webp',
                        mimeType: 'image/webp',
                        archivePath: `assets/${missingAssetId}`
                    }
                ]
            }
        })

        const assetsDir = path.join(server.dataRoot, 'spaces', spaceId, 'assets')
        await writeFile(path.join(assetsDir, assetId), Buffer.from('image'))
        await writeFile(path.join(assetsDir, `${assetId}.json`), JSON.stringify({
            id: assetId,
            name: '1.webp',
            mimeType: 'image/webp',
            size: 5,
            createdAt: 1773766320415
        }, null, 2))
        expect(fs.existsSync(path.join(assetsDir, missingAssetId))).toBe(false)

        const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`, {
            headers: withAuth(server.apiToken)
        })
        expect(response.status).toBe(200)

        const payload = await response.json()
        expect(payload.scene.assets).toEqual([
            expect.objectContaining({
                id: assetId,
                url: `/serverXR/api/spaces/${spaceId}/assets/${assetId}`
            })
        ])
    })

    it('gets and updates the live published project for a space', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })

        const createSpaceResponse = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ label: 'Showcase Space', slug: 'showcase-space' })
        })
        expect(createSpaceResponse.status).toBe(201)

        const project = await createServerProject(server, 'showcase-space', {
            title: 'Showcase Live Project',
            slug: 'showcase-live-project'
        })

        const readResponse = await fetch(`${server.baseUrl}/api/spaces/showcase-space`, {
            headers: withAuth(server.apiToken)
        })
        expect(readResponse.status).toBe(200)
        const readPayload = await readResponse.json()
        expect(readPayload.space.publishedProjectId).toBeNull()

        const publishResponse = await fetch(`${server.baseUrl}/api/spaces/showcase-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ publishedProjectId: project.id })
        })
        expect(publishResponse.status).toBe(200)
        const publishPayload = await publishResponse.json()
        expect(publishPayload.space.publishedProjectId).toBe(project.id)

        const clearResponse = await fetch(`${server.baseUrl}/api/spaces/showcase-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ publishedProjectId: null })
        })
        expect(clearResponse.status).toBe(200)
        const clearPayload = await clearResponse.json()
        expect(clearPayload.space.publishedProjectId).toBeNull()
    })

    it('rejects publishing a project that belongs to another space', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })

        const createOriginSpace = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ label: 'Origin Space', slug: 'origin-space' })
        })
        expect(createOriginSpace.status).toBe(201)

        const createTargetSpace = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ label: 'Target Space', slug: 'target-space' })
        })
        expect(createTargetSpace.status).toBe(201)

        const project = await createServerProject(server, 'origin-space', {
            title: 'Origin Live Project',
            slug: 'origin-live-project'
        })

        const publishResponse = await fetch(`${server.baseUrl}/api/spaces/target-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ publishedProjectId: project.id })
        })
        expect(publishResponse.status).toBe(404)
        await expect(publishResponse.json()).resolves.toMatchObject({
            error: 'Published project not found in this space.'
        })
    })

    it('rejects invalid published project ids and accepts empty-string clear', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })

        const createSpaceResponse = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ label: 'Publish Edge Space', slug: 'publish-edge-space' })
        })
        expect(createSpaceResponse.status).toBe(201)

        const project = await createServerProject(server, 'publish-edge-space', {
            title: 'Publish Edge Project',
            slug: 'publish-edge-project'
        })

        const publishResponse = await fetch(`${server.baseUrl}/api/spaces/publish-edge-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ publishedProjectId: project.id })
        })
        expect(publishResponse.status).toBe(200)

        const invalidPublishResponse = await fetch(`${server.baseUrl}/api/spaces/publish-edge-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ publishedProjectId: '***' })
        })
        expect(invalidPublishResponse.status).toBe(400)
        await expect(invalidPublishResponse.json()).resolves.toMatchObject({
            error: 'Invalid published project id.'
        })

        const clearWithEmptyString = await fetch(`${server.baseUrl}/api/spaces/publish-edge-space`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ publishedProjectId: '' })
        })
        expect(clearWithEmptyString.status).toBe(200)
        const clearedPayload = await clearWithEmptyString.json()
        expect(clearedPayload.space.publishedProjectId).toBeNull()
    })

    it('rejects read-only scene, asset, and live mutations with 403', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })
        const spaceId = await createReadOnlySpace(server)

        const opsResponse = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/ops`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({
                baseVersion: 0,
                ops: [{ type: 'replaceScene', payload: { scene: { version: 4, objects: [] } } }]
            })
        })
        expect(opsResponse.status).toBe(403)

        const sceneResponse = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ version: 4, objects: [] })
        })
        expect(sceneResponse.status).toBe(403)

        const liveResponse = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/live`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...withAuth(server.apiToken)
            },
            body: JSON.stringify({ payload: { objects: [] } })
        })
        expect(liveResponse.status).toBe(403)

        const formData = new FormData()
        formData.append('asset', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt')
        const assetResponse = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets`, {
            method: 'POST',
            headers: withAuth(server.apiToken),
            body: formData
        })
        expect(assetResponse.status).toBe(403)

        const deleteResponse = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets/4c122913-7872-42b3-8b04-9f73942022fd`, {
            method: 'DELETE',
            headers: withAuth(server.apiToken)
        })
        expect(deleteResponse.status).toBe(403)

        const uploads = await readdir(path.join(server.dataRoot, 'uploads'))
        expect(uploads).toEqual([])
    })

    it('throttles repeated login attempts with 429 + Retry-After', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })

        let sawTooMany = null
        for (let i = 0; i < 11; i++) {
            const attempt = await fetch(`${server.baseUrl}/api/auth/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: `wrong-token-${i}` })
            })
            if (attempt.status === 429) {
                sawTooMany = attempt
                break
            }
            expect(attempt.status).toBe(401)
        }

        expect(sawTooMany).not.toBeNull()
        expect(Number(sawTooMany.headers.get('retry-after'))).toBeGreaterThan(0)
    })

    // undici (global fetch) instantiates a WASM HTTP parser that OOMs under
    // cPanel/LVE memory limits — every outbound HTTP call in serverXR must go
    // through httpClient.js (node:http/https). This bug class shipped twice
    // (GitHub sync, then syncRoutes); this contract keeps it at zero.
    it('serverXR source never calls global fetch', async () => {
        const offenders = []
        const scan = async (dir) => {
            for (const entry of await readdir(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) { await scan(fullPath); continue }
                if (!entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) continue
                if (entry.name === 'httpClient.js') continue
                const source = fs.readFileSync(fullPath, 'utf8')
                for (const [index, line] of source.split('\n').entries()) {
                    const code = line.replace(/\/\/.*$/, '')
                    if (/(^|[^.\w])fetch\s*\(/.test(code)) {
                        offenders.push(`${path.relative(SERVER_ROOT, fullPath)}:${index + 1}`)
                    }
                }
            }
        }
        await scan(path.join(SERVER_ROOT, 'src'))
        expect(offenders).toEqual([])
    })

    // Regression guard: the used-by check once scanned only project documents —
    // an asset referenced solely by the space's legacy V1 scene.json could be
    // deleted silently, breaking the scene's rendering.
    it('refuses to delete an asset referenced only by the V1 scene, unless forced', async () => {
        const server = await startServer()
        const spaceId = 'v1-del-space'
        const createRes = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ slug: spaceId, label: 'V1 Delete Space', permanent: true })
        })
        expect(createRes.status).toBe(201)

        const formData = new FormData()
        formData.append('asset', new Blob(['v1-bytes'], { type: 'text/plain' }), 'v1.txt')
        const uploadRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets`, {
            method: 'POST',
            headers: withAuth(server.apiToken),
            body: formData
        })
        expect(uploadRes.status).toBe(200)
        const { assetId } = await uploadRes.json()

        const sceneRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({
                version: 1,
                objects: [{ id: 'obj-1', type: 'image', name: 'Legacy Poster', assetRef: { id: assetId } }]
            })
        })
        expect(sceneRes.status).toBe(200)

        const blockedRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets/${assetId}`, {
            method: 'DELETE',
            headers: withAuth(server.apiToken)
        })
        expect(blockedRes.status).toBe(409)
        const blocked = await blockedRes.json()
        expect(blocked.code).toBe('asset_in_use')
        expect(blocked.usedBy[0].title).toBe('Space scene (V1)')
        expect(blocked.usedBy[0].entities).toContain('Legacy Poster')

        const forcedRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets/${assetId}?force=1`, {
            method: 'DELETE',
            headers: withAuth(server.apiToken)
        })
        expect(forcedRes.status).toBe(200)
    })

    it('lets an owner set, validate, and clear the card preview image', async () => {
        const server = await startServer()
        const spaceId = 'preview-image-space'
        const createRes = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ slug: spaceId, label: 'Preview Image Space', permanent: true })
        })
        expect(createRes.status).toBe(201)

        // malformed id → 400; well-formed but missing asset → 404
        const invalidRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ previewImageAssetId: '../escape' })
        })
        expect(invalidRes.status).toBe(400)
        const missingRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ previewImageAssetId: 'deadbeef-0000-4000-8000-000000000000' })
        })
        expect(missingRes.status).toBe(404)

        const formData = new FormData()
        formData.append('asset', new Blob(['cover-bytes'], { type: 'image/png' }), 'cover.png')
        const uploadRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets`, {
            method: 'POST',
            headers: withAuth(server.apiToken),
            body: formData
        })
        expect(uploadRes.status).toBe(200)
        const { assetId } = await uploadRes.json()

        const setRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ previewImageAssetId: assetId })
        })
        expect(setRes.status).toBe(200)
        expect((await setRes.json()).space.previewImageAssetId).toBe(assetId)

        // the hub reads spaces from the list endpoint — the override must survive it
        const listRes = await fetch(`${server.baseUrl}/api/spaces`, { headers: withAuth(server.apiToken) })
        const listed = (await listRes.json()).spaces.find((space) => space.id === spaceId)
        expect(listed.previewImageAssetId).toBe(assetId)

        const clearRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ previewImageAssetId: null })
        })
        expect(clearRes.status).toBe(200)
        expect((await clearRes.json()).space.previewImageAssetId).toBe(null)
    })

    it('gates GitHub App discovery behind sign-in and reports unconfigured cleanly', async () => {
        // Blank the App vars explicitly — dotenv won't override set env vars, so
        // this wins over any developer serverXR/.env.local on the machine.
        const server = await startServer({
            nodeEnv: 'production',
            requireAuth: true,
            extraEnv: { GITHUB_APP_ID: '', GITHUB_APP_PRIVATE_KEY: '', GITHUB_APP_PRIVATE_KEY_B64: '', GITHUB_APP_PRIVATE_KEY_PATH: '' }
        })

        const anonApp = await fetch(`${server.baseUrl}/api/github/app`)
        expect(anonApp.status).toBe(403)
        const anonRepos = await fetch(`${server.baseUrl}/api/github/repos`)
        expect(anonRepos.status).toBe(403)

        const login = await fetch(`${server.baseUrl}/api/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: server.apiToken })
        })
        const cookie = (login.headers.get('set-cookie') || '').split(';')[0]

        // No GITHUB_APP_ID in the test env — endpoints must degrade, not 500.
        const appRes = await fetch(`${server.baseUrl}/api/github/app`, { headers: { Cookie: cookie } })
        expect(appRes.status).toBe(200)
        await expect(appRes.json()).resolves.toMatchObject({ configured: false })

        const reposRes = await fetch(`${server.baseUrl}/api/github/repos`, { headers: { Cookie: cookie } })
        expect(reposRes.status).toBe(200)
        await expect(reposRes.json()).resolves.toMatchObject({ configured: false, repos: [] })
    })

    it('deletes space assets with used-by protection, force override, and commons unshare', async () => {

        const server = await startServer()
        const spaceId = 'del-space'
        const createRes = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ slug: spaceId, label: 'Delete Space', permanent: true })
        })
        expect(createRes.status).toBe(201)

        const formData = new FormData()
        formData.append('asset', new Blob(['space-bytes'], { type: 'text/plain' }), 'space.txt')
        const uploadRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets`, {
            method: 'POST',
            headers: withAuth(server.apiToken),
            body: formData
        })
        expect(uploadRes.status).toBe(200)
        const { assetId } = await uploadRes.json()

        const shareRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets/${assetId}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ public: true })
        })
        expect(shareRes.status).toBe(200)

        const projectRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ title: 'Uses Asset', slug: 'uses-asset' })
        })
        expect(projectRes.status).toBe(201)
        const docRes = await fetch(`${server.baseUrl}/api/projects/uses-asset/document`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({
                entities: [{
                    id: 'e1',
                    type: 'image',
                    name: 'Poster',
                    components: { media: { assetId } }
                }]
            })
        })
        expect(docRes.status).toBe(200)

        const blockedRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets/${assetId}`, {
            method: 'DELETE',
            headers: withAuth(server.apiToken)
        })
        expect(blockedRes.status).toBe(409)
        const blocked = await blockedRes.json()
        expect(blocked.code).toBe('asset_in_use')
        expect(blocked.usedBy[0].projectId).toBe('uses-asset')
        expect(blocked.usedBy[0].entities).toContain('Poster')

        const forcedRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets/${assetId}?force=1`, {
            method: 'DELETE',
            headers: withAuth(server.apiToken)
        })
        expect(forcedRes.status).toBe(200)

        const goneRes = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/assets/${assetId}`, {
            headers: withAuth(server.apiToken)
        })
        expect(goneRes.status).toBe(404)

        const commonsRes = await fetch(`${server.baseUrl}/api/commons/assets`)
        expect(commonsRes.status).toBe(200)
        const commons = await commonsRes.json()
        expect(commons.assets.some((a) => a.id === assetId)).toBe(false)
    })
})

describe('open-call application contracts', () => {
    it('accepts public submissions without auth, gates review behind admin, and validates status updates', async () => {
        const server = await startServer({ nodeEnv: 'production' })

        const submitRes = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Applicant',
                email: 'test@example.am',
                city: 'Gyumri',
                why: 'City and Time',
                experience: ['3D մոդելավորում']
            })
        })
        expect(submitRes.status).toBe(201)
        const submitted = await submitRes.json()
        expect(submitted.ok).toBe(true)
        expect(submitted.id).toBeTruthy()

        const invalidRes = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '', email: 'nope' })
        })
        expect(invalidRes.status).toBe(400)

        const unauthenticatedList = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications`)
        expect([401, 403]).toContain(unauthenticatedList.status)

        const listRes = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications`, {
            headers: withAuth(server.apiToken)
        })
        expect(listRes.status).toBe(200)
        const listed = await listRes.json()
        expect(listed.applications).toHaveLength(1)
        expect(listed.applications[0].id).toBe(submitted.id)
        expect(listed.applications[0].status).toBe('new')
        expect(listed.applications[0].payload.why).toBe('City and Time')

        const patchRes = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications/${submitted.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ status: 'shortlist', notes: 'strong portfolio' })
        })
        expect(patchRes.status).toBe(200)
        const patched = await patchRes.json()
        expect(patched.application.status).toBe('shortlist')
        expect(patched.application.notes).toBe('strong portfolio')

        const badPatch = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications/${submitted.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...withAuth(server.apiToken) },
            body: JSON.stringify({ status: 'maybe' })
        })
        expect(badPatch.status).toBe(400)
    })

    it('answers submission preflights permissively for sandboxed (Origin: null) iframes', async () => {
        const server = await startServer({ nodeEnv: 'production', extraEnv: { CORS_ORIGINS: 'https://di-studio.xyz' } })

        const preflight = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'null',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        })
        expect(preflight.status).toBe(204)
        expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
        expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')

        const submitRes = await fetch(`${server.baseUrl}/api/open-calls/beyond_form/applications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'null' },
            body: JSON.stringify({ name: 'Sandboxed Applicant', email: 'sandbox@example.am' })
        })
        expect(submitRes.status).toBe(201)
        expect(submitRes.headers.get('access-control-allow-origin')).toBe('*')
    })

    it('serves project asset reads with permissive CORS for sandboxed iframes', async () => {
        const server = await startServer({ nodeEnv: 'production', extraEnv: { CORS_ORIGINS: 'https://di-studio.xyz' } })

        const preflight = await fetch(`${server.baseUrl}/api/projects/some-project/assets/some-asset`, {
            method: 'OPTIONS',
            headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET' }
        })
        expect(preflight.status).toBe(204)
        expect(preflight.headers.get('access-control-allow-origin')).toBe('*')

        const missing = await fetch(`${server.baseUrl}/api/projects/some-project/assets/some-asset`, {
            headers: { Origin: 'null' }
        })
        expect(missing.headers.get('access-control-allow-origin')).toBe('*')
    })
})
