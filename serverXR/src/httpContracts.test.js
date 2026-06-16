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
            error: 'Admin role required.',
            requiredRole: 'admin',
            currentRole: 'editor'
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
        expect(deniedPublish.status).toBe(403)
        await expect(deniedPublish.json()).resolves.toMatchObject({
            error: 'Admin role required.',
            requiredRole: 'admin',
            currentRole: 'editor'
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
            error: 'Admin role required.',
            requiredRole: 'admin',
            currentRole: 'editor'
        })

        const adminDelete = await fetch(`${server.baseUrl}/api/projects/editor-project`, {
            method: 'DELETE',
            headers: withAuth(server.apiToken)
        })
        expect(adminDelete.status).toBe(200)
        await expect(adminDelete.json()).resolves.toMatchObject({ ok: true })
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

        const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`)
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

        const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/scene`)
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

        const readResponse = await fetch(`${server.baseUrl}/api/spaces/showcase-space`)
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

        const uploads = await readdir(path.join(server.dataRoot, 'uploads'))
        expect(uploads).toEqual([])
    })
})
