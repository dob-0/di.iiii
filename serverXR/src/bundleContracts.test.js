// @vitest-environment node

import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')
const BUNDLE_SCRIPT = path.resolve(SERVER_ROOT, '..', 'scripts/space-bundle.mjs')

const activeServers = []
const tempDirs = []

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

// Unlike the other contract suites, data roots outlive their server here —
// export reads the stopped server's data root, import writes the next one's.
const makeTempDir = async (prefix) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}

const startServer = async (dataRoot) => {
    const sandboxCwd = await makeTempDir('dii-bundle-server-cwd-')
    const port = await getFreePort()
    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: sandboxCwd,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: dataRoot,
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

    // child.exitCode stays null when the child dies from a signal — track exit
    // explicitly so a second stop() (mid-test + afterEach) can't wait forever.
    let exited = false
    child.once('exit', () => { exited = true })

    const baseUrl = `http://127.0.0.1:${port}/serverXR`

    const stop = async () => {
        if (exited) return
        child.kill('SIGTERM')
        const sawExit = await Promise.race([
            new Promise(resolve => child.once('exit', () => resolve(true))),
            wait(3000).then(() => false)
        ])
        if (!sawExit && !exited) {
            child.kill('SIGKILL')
            await new Promise(resolve => child.once('exit', resolve))
        }
    }

    await waitForHealth({
        url: `${baseUrl}/api/health`,
        child,
        getLogs: () => `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`
    })

    const handle = { baseUrl, dataRoot, stop }
    activeServers.push(handle)
    return handle
}

afterEach(async () => {
    await Promise.all(activeServers.splice(0).map(server => server.stop()))
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
}, 30000)

const runBundleScript = (args, dataRoot) => execFileAsync(process.execPath, [BUNDLE_SCRIPT, ...args], {
    env: { ...process.env, DATA_ROOT: dataRoot }
})

// Response shapes differ: project route wraps {asset:{id|assetId,…}},
// space route returns {assetId,…} flat — normalize to a bare id.
const uploadAsset = async (url, bytes, filename, type) => {
    const form = new FormData()
    form.append('asset', new Blob([bytes], { type }), filename)
    const response = await fetch(url, { method: 'POST', body: form })
    expect(response.status).toBe(200)
    const body = await response.json()
    const asset = body.asset ?? body
    return { id: asset.id ?? asset.assetId }
}

const seedSpace = async (server, spaceId) => {
    const createSpace = await fetch(`${server.baseUrl}/api/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: spaceId, label: 'Bundle Source' })
    })
    expect(createSpace.status).toBe(201)

    const createProject = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Bundle Project', slug: `${spaceId}-project`, source: 'studio-v3' })
    })
    expect(createProject.status).toBe(201)
    const projectId = (await createProject.json()).project.id

    // CAS-stored project asset (sha256 id → blob store) + legacy space asset
    const projectAssetBytes = Buffer.from(`bundle-project-asset-${spaceId}`)
    const projectAsset = await uploadAsset(
        `${server.baseUrl}/api/projects/${projectId}/assets`, projectAssetBytes, 'blob.bin', 'application/octet-stream')
    const spaceAssetBytes = Buffer.from(`bundle-space-asset-${spaceId}`)
    const spaceAsset = await uploadAsset(
        `${server.baseUrl}/api/spaces/${spaceId}/assets`, spaceAssetBytes, 'cover.bin', 'application/octet-stream')

    // Capture the source server's view of the project — the round-trip
    // assertion is fidelity against this, not any assumed op semantics.
    const sourceProjectResponse = await fetch(`${server.baseUrl}/api/projects/${projectId}`)
    expect(sourceProjectResponse.status).toBe(200)
    const sourceProject = await sourceProjectResponse.json()

    return { projectId, projectAsset, projectAssetBytes, spaceAsset, spaceAssetBytes, sourceProject }
}

const fetchBytes = async (url) => {
    const response = await fetch(url)
    expect(response.status).toBe(200)
    return Buffer.from(await response.arrayBuffer())
}

describe('space bundle contracts', () => {
    it('round-trips a space through export and import into a fresh data root', async () => {
        const spaceId = 'bundle-src'
        const sourceRoot = await makeTempDir('dii-bundle-data-a-')
        const sourceServer = await startServer(sourceRoot)
        const seeded = await seedSpace(sourceServer, spaceId)
        await sourceServer.stop()

        const workDir = await makeTempDir('dii-bundle-out-')
        const bundlePath = path.join(workDir, 'space.tar.gz')
        const { stdout: exportOut } = await runBundleScript(['export', spaceId, '--out', bundlePath], sourceRoot)
        expect(exportOut).toContain(`exported space "${spaceId}"`)

        const targetRoot = await makeTempDir('dii-bundle-data-b-')
        const { stdout: importOut } = await runBundleScript(['import', bundlePath], targetRoot)
        expect(importOut).toContain(`imported "${spaceId}" as "${spaceId}"`)

        const targetServer = await startServer(targetRoot)

        const metaResponse = await fetch(`${targetServer.baseUrl}/api/spaces/${spaceId}`)
        expect(metaResponse.status).toBe(200)
        const meta = await metaResponse.json()
        expect(meta.space.label).toBe('Bundle Source')

        const projectResponse = await fetch(`${targetServer.baseUrl}/api/projects/${seeded.projectId}`)
        expect(projectResponse.status).toBe(200)
        const project = await projectResponse.json()
        expect(project.project.title).toBe(seeded.sourceProject.project.title)
        expect(project.document).toEqual(seeded.sourceProject.document)

        const projectAssetBytes = await fetchBytes(
            `${targetServer.baseUrl}/api/projects/${seeded.projectId}/assets/${seeded.projectAsset.id}`)
        expect(projectAssetBytes.equals(seeded.projectAssetBytes)).toBe(true)

        const spaceAssetBytes = await fetchBytes(
            `${targetServer.baseUrl}/api/spaces/${spaceId}/assets/${seeded.spaceAsset.id}`)
        expect(spaceAssetBytes.equals(seeded.spaceAssetBytes)).toBe(true)
    }, 60000)

    it('refuses to overwrite an existing space without --force and supports --as remap', async () => {
        const spaceId = 'bundle-dup'
        const sourceRoot = await makeTempDir('dii-bundle-data-c-')
        const sourceServer = await startServer(sourceRoot)
        await seedSpace(sourceServer, spaceId)
        await sourceServer.stop()

        const workDir = await makeTempDir('dii-bundle-out-')
        const bundlePath = path.join(workDir, 'space.tar.gz')
        await runBundleScript(['export', spaceId, '--out', bundlePath], sourceRoot)

        // importing back into the same root without --force must fail
        await expect(runBundleScript(['import', bundlePath], sourceRoot)).rejects.toThrow(/already exists/)

        // --as remap into a fresh root gets a new id but same content
        const targetRoot = await makeTempDir('dii-bundle-data-d-')
        const { stdout } = await runBundleScript(['import', bundlePath, '--as', 'bundle-remapped'], targetRoot)
        expect(stdout).toContain('imported "bundle-dup" as "bundle-remapped"')

        const targetServer = await startServer(targetRoot)
        const metaResponse = await fetch(`${targetServer.baseUrl}/api/spaces/bundle-remapped`)
        expect(metaResponse.status).toBe(200)
    }, 60000)
})
