// @vitest-environment node
//
// Regression guards for CLIENT_DIR — the mode where serverXR is not only the
// API but also the web server, so one process on one port is the whole product.
// This is what a local `di` install runs; the deployed topology leaves
// CLIENT_DIR unset and lets nginx serve dist/.
//
// The bug class this guards is ordering. An SPA fallback is a catch-all by
// definition, so if it is mounted before the API router — or forgets to exclude
// the API prefixes — then /serverXR/api/whatever quietly returns an HTML page
// with status 200, and every fetch() in the app dies on `Unexpected token '<'`
// instead of on a 404 anyone could read.
//
// Same real-server-subprocess harness as fallbackContracts.test.js (each
// contract-test file owns its own copy — established convention).

import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const SPA_MARKER = '<div id="root"></div><!-- spa fixture -->'
const ASSET_BODY = 'export const marker = "real asset file"\n'

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

/** A minimal stand-in for a built dist/: an index.html and one hashed asset. */
const makeClientDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-spa-client-'))
    await writeFile(path.join(dir, 'index.html'), SPA_MARKER)
    await mkdir(path.join(dir, 'assets'), { recursive: true })
    await writeFile(path.join(dir, 'assets', 'app-abc123.js'), ASSET_BODY)
    return dir
}

const startServer = async ({ clientDir, extraEnv = {} } = {}) => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-spa-server-cwd-'))
    const sandboxDataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-spa-server-data-'))
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
            AUTH_SESSION_SECRET: 'test-session-secret',
            CORS_ORIGINS: '*',
            ...(clientDir ? { CLIENT_DIR: clientDir } : {}),
            ...extraEnv
        },
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    const origin = `http://127.0.0.1:${port}`

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
        url: `${origin}/serverXR/api/health`,
        child,
        getLogs: () => `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`
    })

    const handle = { origin, baseUrl: `${origin}/serverXR`, stop }
    activeServers.push(handle)
    return handle
}

const clientDirs = []
const withClientDir = async () => {
    const dir = await makeClientDir()
    clientDirs.push(dir)
    return dir
}

afterEach(async () => {
    await Promise.all(activeServers.splice(0).map(server => server.stop()))
    await Promise.all(clientDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('CLIENT_DIR set: one process serves both the API and the app', () => {
    it('serves the SPA for a space URL that is not a file and not an API route', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/main`)

        expect(response.status).toBe(200)
        expect(await response.text()).toContain(SPA_MARKER)
    })

    it('serves the SPA at the root', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/`)

        expect(response.status).toBe(200)
        expect(await response.text()).toContain(SPA_MARKER)
    })

    it('serves a deep client route, not just one path segment', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/main/p/some-project`)

        expect(response.status).toBe(200)
        expect(await response.text()).toContain(SPA_MARKER)
    })

    it('still answers the API as the API — the catch-all must not shadow it', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.baseUrl}/api/health`)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('application/json')
        await expect(response.json()).resolves.toBeTruthy()
    })

    it('404s an unknown API route instead of handing back the app', async () => {
        // The failure this guards: a fetch() gets 200 + HTML and dies on
        // "Unexpected token '<'" somewhere far from the actual mistake.
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.baseUrl}/api/definitely-not-a-route`)

        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain(SPA_MARKER)
    })

    it('serves a real static asset as itself', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/assets/app-abc123.js`)

        expect(response.status).toBe(200)
        expect(await response.text()).toBe(ASSET_BODY)
    })

    it('404s a missing asset instead of returning index.html with a 200', async () => {
        // Serving the SPA for /assets/missing.js turns a stale cache reference
        // into a JS syntax error thrown from inside a working page.
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/assets/gone-xyz789.js`)

        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain(SPA_MARKER)
    })
})

describe('CLIENT_DIR unset: the deployed topology is untouched', () => {
    it('does not serve an SPA — a non-API path is still a 404, as nginx expects', async () => {
        const server = await startServer()

        const response = await fetch(`${server.origin}/main`)

        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain(SPA_MARKER)
    })

    it('still answers the API', async () => {
        const server = await startServer()

        const response = await fetch(`${server.baseUrl}/api/health`)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('application/json')
    })
})
