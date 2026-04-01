// @vitest-environment node

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-beta-server-cwd-'))
    const sandboxDataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-beta-server-data-'))
    const port = await getFreePort()
    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: sandboxCwd,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: sandboxDataRoot,
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

describe('beta project contracts', () => {
    it('creates a project inside a space and updates its document via ops', async () => {
        const server = await startServer()

        const createResponse = await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Beta Contracts Project', slug: 'beta-contracts-project' })
        })
        expect(createResponse.status).toBe(201)
        const created = await createResponse.json()
        expect(created.project.id).toBe('beta-contracts-project')

        const submitResponse = await fetch(`${server.baseUrl}/api/projects/beta-contracts-project/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseVersion: 0,
                ops: [{
                    type: 'createEntity',
                    payload: {
                        entity: {
                            id: 'entity-1',
                            type: 'box',
                            name: 'Shared Box'
                        }
                    }
                }]
            })
        })
        expect(submitResponse.status).toBe(200)
        const submitted = await submitResponse.json()
        expect(submitted.newVersion).toBe(1)

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/beta-contracts-project/document`)
        expect(documentResponse.status).toBe(200)
        const documentPayload = await documentResponse.json()
        expect(documentPayload.document.entities).toEqual([
            expect.objectContaining({ id: 'entity-1', name: 'Shared Box' })
        ])

        const opsResponse = await fetch(`${server.baseUrl}/api/projects/beta-contracts-project/ops?since=0`)
        expect(opsResponse.status).toBe(200)
        const opsPayload = await opsResponse.json()
        expect(opsPayload.ops).toHaveLength(1)
        expect(opsPayload.latestVersion).toBe(1)
    })

    it('uploads and serves project assets from the hybrid project container', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Asset Project', slug: 'asset-project' })
        })

        const formData = new FormData()
        formData.append('asset', new Blob(['beta-asset'], { type: 'text/plain' }), 'asset.txt')
        const uploadResponse = await fetch(`${server.baseUrl}/api/projects/asset-project/assets`, {
            method: 'POST',
            body: formData
        })
        expect(uploadResponse.status).toBe(200)
        const uploaded = await uploadResponse.json()
        expect(uploaded.asset.url).toMatch(/\/api\/projects\/asset-project\/assets\//)

        const assetResponse = await fetch(new URL(uploaded.asset.url, server.baseUrl))
        expect(assetResponse.status).toBe(200)
        expect(await assetResponse.text()).toBe('beta-asset')
    })

    it('recovers a corrupted beta project document by trimming trailing garbage', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Recovery Project', slug: 'recovery-project' })
        })

        const documentPath = path.join(
            server.dataRoot,
            'spaces',
            'main',
            'projects',
            'recovery-project',
            'document.json'
        )
        const original = await readFile(documentPath, 'utf8')
        await writeFile(documentPath, `${original}}`)

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/recovery-project/document`)
        expect(documentResponse.status).toBe(200)
        const payload = await documentResponse.json()
        expect(payload.document.projectMeta.id).toBe('recovery-project')

        const repaired = await readFile(documentPath, 'utf8')
        expect(() => JSON.parse(repaired)).not.toThrow()
    })
})
