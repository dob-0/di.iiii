// @vitest-environment node

import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')
const INSTALL_SCRIPT = path.resolve(SERVER_ROOT, '..', 'scripts/install-bundle.mjs')

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

const makeTempDir = async (prefix) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}

const startServer = async (dataRoot) => {
    const sandboxCwd = await makeTempDir('dii-install-server-cwd-')
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

const runInstallScript = (args, dataRoot) => execFileAsync(process.execPath, [INSTALL_SCRIPT, ...args], {
    env: { ...process.env, DATA_ROOT: dataRoot }
})

const seedSpace = async (server, spaceId) => {
    const createSpace = await fetch(`${server.baseUrl}/api/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: spaceId, label: `Install ${spaceId}` })
    })
    expect(createSpace.status).toBe(201)

    const createProject = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Project ${spaceId}`, slug: `${spaceId}-project`, source: 'studio-v3' })
    })
    expect(createProject.status).toBe(201)
    const projectId = (await createProject.json()).project.id

    const assetBytes = Buffer.from(`install-bundle-asset-${spaceId}`)
    const form = new FormData()
    form.append('asset', new Blob([assetBytes], { type: 'application/octet-stream' }), 'blob.bin')
    const upload = await fetch(`${server.baseUrl}/api/projects/${projectId}/assets`, { method: 'POST', body: form })
    expect(upload.status).toBe(200)
    const uploadBody = await upload.json()
    const asset = uploadBody.asset ?? uploadBody
    return { projectId, assetId: asset.id ?? asset.assetId, assetBytes }
}

describe('install bundle contracts', () => {
    it('round-trips every space plus instance config into a fresh data root', async () => {
        const sourceRoot = await makeTempDir('dii-install-data-a-')
        const sourceServer = await startServer(sourceRoot)
        const seededA = await seedSpace(sourceServer, 'install-a')
        const seededB = await seedSpace(sourceServer, 'install-b')
        await sourceServer.stop()

        // instance config lives beside the space dirs; written after the
        // server stops so nothing races the file
        const configPath = path.join(sourceRoot, 'spaces', '_server-config.json')
        await writeFile(configPath, JSON.stringify({ globalSpaceId: 'install-a' }, null, 2))

        const workDir = await makeTempDir('dii-install-out-')
        const bundlePath = path.join(workDir, 'install.tar.gz')
        // the server auto-provisions a 'main' space on boot, so "every space"
        // is main + the two seeded ones
        const { stdout: exportOut } = await runInstallScript(['export', '--out', bundlePath], sourceRoot)
        expect(exportOut).toContain('3 spaces')
        expect(exportOut).toContain('instance config')

        const targetRoot = await makeTempDir('dii-install-data-b-')
        const { stdout: importOut } = await runInstallScript(['import', bundlePath], targetRoot)
        expect(importOut).toMatch(/3 spaces: .*install-a.*install-b/)

        const importedConfig = JSON.parse(
            await readFile(path.join(targetRoot, 'spaces', '_server-config.json'), 'utf8'))
        expect(importedConfig.globalSpaceId).toBe('install-a')

        const targetServer = await startServer(targetRoot)
        for (const [spaceId, seeded] of [['install-a', seededA], ['install-b', seededB]]) {
            const metaResponse = await fetch(`${targetServer.baseUrl}/api/spaces/${spaceId}`)
            expect(metaResponse.status).toBe(200)
            expect((await metaResponse.json()).space.label).toBe(`Install ${spaceId}`)

            const assetResponse = await fetch(
                `${targetServer.baseUrl}/api/projects/${seeded.projectId}/assets/${seeded.assetId}`)
            expect(assetResponse.status).toBe(200)
            const bytes = Buffer.from(await assetResponse.arrayBuffer())
            expect(bytes.equals(seeded.assetBytes)).toBe(true)
        }
    }, 90000)

    it('exports a subset via --spaces and refuses to overwrite without --force', async () => {
        const sourceRoot = await makeTempDir('dii-install-data-c-')
        const sourceServer = await startServer(sourceRoot)
        await seedSpace(sourceServer, 'subset-keep')
        await seedSpace(sourceServer, 'subset-drop')
        await sourceServer.stop()

        const workDir = await makeTempDir('dii-install-out-')
        const bundlePath = path.join(workDir, 'subset.tar.gz')
        const { stdout } = await runInstallScript(
            ['export', '--spaces', 'subset-keep', '--out', bundlePath], sourceRoot)
        expect(stdout).toContain('1 spaces')

        const targetRoot = await makeTempDir('dii-install-data-d-')
        await runInstallScript(['import', bundlePath], targetRoot)

        const targetServer = await startServer(targetRoot)
        expect((await fetch(`${targetServer.baseUrl}/api/spaces/subset-keep`)).status).toBe(200)
        expect((await fetch(`${targetServer.baseUrl}/api/spaces/subset-drop`)).status).toBe(404)
        expect(existsSync(path.join(targetRoot, 'spaces', '_server-config.json'))).toBe(false)
        await targetServer.stop()

        // re-import onto the same root without --force must fail on the space
        await expect(runInstallScript(['import', bundlePath], targetRoot)).rejects.toThrow(/already exists/)
        // with --force it succeeds
        const { stdout: forcedOut } = await runInstallScript(['import', bundlePath, '--force'], targetRoot)
        expect(forcedOut).toContain('1 spaces: subset-keep')
    }, 90000)
})
