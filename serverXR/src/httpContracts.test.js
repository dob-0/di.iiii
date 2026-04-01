// @vitest-environment node

import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
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
    extraEnv = {}
} = {}) => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-server-cwd-'))
    const sandboxDataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-server-data-'))
    const port = await getFreePort()
    const childEnv = {
        ...process.env,
        ...extraEnv,
        PORT: String(port),
        NODE_ENV: nodeEnv,
        APP_BASE_PATH: appBasePath,
        DATA_ROOT: sandboxDataRoot,
        API_TOKEN: apiToken,
        CORS_ORIGINS: '*'
    }

    delete childEnv.SPACES_DIR
    delete childEnv.UPLOADS_DIR

    if (requireAuth === undefined) {
        delete childEnv.REQUIRE_AUTH
    } else {
        childEnv.REQUIRE_AUTH = String(requireAuth)
    }

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

const createReadOnlySpace = async (dataRoot, spaceId = 'locked-space') => {
    const spaceDir = path.join(dataRoot, 'spaces', spaceId)
    await mkdir(path.join(spaceDir, 'assets'), { recursive: true })
    await writeFile(path.join(spaceDir, 'meta.json'), JSON.stringify({
        id: spaceId,
        label: 'Locked Space',
        permanent: true,
        allowEdits: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTouchedAt: Date.now(),
        sceneVersion: 0
    }, null, 2))
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

    it('rejects read-only scene, asset, and live mutations with 403', async () => {
        const server = await startServer({ nodeEnv: 'production', requireAuth: true })
        const spaceId = await createReadOnlySpace(server.dataRoot)

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
