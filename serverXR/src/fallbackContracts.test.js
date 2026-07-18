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

const startServer = async () => {
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
            REQUIRE_AUTH: '',
            CORS_ORIGINS: '*'
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
