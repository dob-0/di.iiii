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

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const SPA_MARKER = '<div id="root"></div><!-- spa fixture -->'
const ASSET_BODY = 'export const marker = "real asset file"\n'
// The PNG signature and a marker: enough for "this is the icon, not the shell".
const ICON_BODY = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('icon fixture')])

const activeServers = []

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A minimal stand-in for a built dist/: an index.html and one hashed asset.
 *
 * Nested under a HIDDEN directory on purpose. A local install lives in ~/.di,
 * and `res.sendFile(absolutePath)` with no root applies send's
 * dotfiles:'ignore' rule to every segment of that absolute path — so serving
 * from anywhere under a dot-directory 404s the whole app while the API and
 * express.static both keep working. It looks like a routing bug and is not one.
 * A fixture in a plain tmpdir passes happily and proves nothing.
 */
const makeClientDir = async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'dii-spa-'))
    const dir = path.join(base, '.di', 'versions', '0.0.0', 'dist')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'index.html'), SPA_MARKER)
    await mkdir(path.join(dir, 'assets'), { recursive: true })
    await writeFile(path.join(dir, 'assets', 'app-abc123.js'), ASSET_BODY)
    await mkdir(path.join(dir, 'suite'), { recursive: true })
    await writeFile(path.join(dir, 'suite', 'apple-touch-icon.png'), ICON_BODY)
    return { dir, base }
}

const startServer = async ({ clientDir, extraEnv = {} } = {}) => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-spa-server-cwd-'))
    const sandboxDataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-spa-server-data-'))
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY,
        cwd: sandboxCwd,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: sandboxDataRoot,
            API_TOKEN: 'test-token',
            REQUIRE_AUTH: '',
            AUTH_SESSION_SECRET: 'test-session-secret',
            CORS_ORIGINS: '*',
            ...(clientDir ? { CLIENT_DIR: clientDir } : {}),
            ...extraEnv
        }
    })

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

    const handle = { origin, baseUrl: `${origin}/serverXR`, stop }
    activeServers.push(handle)
    return handle
}

const clientDirs = []
const withClientDir = async () => {
    const { dir, base } = await makeClientDir()
    clientDirs.push(base)
    return dir
}

afterEach(async () => {
    await Promise.all(activeServers.splice(0).map(server => server.stop()))
    await Promise.all(clientDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('CLIENT_DIR set: one process serves both the API and the app', () => {
    it('serves the SPA from a hidden directory — the default install lives in ~/.di', async () => {
        // The bug this exists for: sendFile(absolutePath) 404s every route under
        // a dot-directory, so a real install answered its API but never its app.
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

    it('answers both root apple-touch-icon names with the suite icon, not the shell (G49)', async () => {
        // iOS probes the root without reading <head>; the shell answered both
        // with 200 text/html before the alias existed.
        const server = await startServer({ clientDir: await withClientDir() })

        for (const name of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) {
            const response = await fetch(`${server.origin}/${name}`)
            expect(response.status).toBe(200)
            expect(response.headers.get('content-type')).toBe('image/png')
            expect(Buffer.from(await response.arrayBuffer()).equals(ICON_BODY)).toBe(true)
        }
    })

    it('404s a missing asset instead of returning index.html with a 200', async () => {
        // Serving the SPA for /assets/missing.js turns a stale cache reference
        // into a JS syntax error thrown from inside a working page.
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/assets/gone-xyz789.js`)

        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain(SPA_MARKER)
        expect(response.headers.get('cache-control')).toBe('no-store')
    })
})

// Audit 2026-10-21 (G01, G02, G04): the same page route nginx uses on the
// hosted tiers. Every unknown address used to answer 200 with the one shell,
// and every address carried the front door's head.
describe('CLIENT_DIR set: each address carries its own head and its true status', () => {
    const SHELL = `<!doctype html><html><head><meta charset="utf-8"><title>shell title</title><meta name="description" content="shell line"></head><body>${SPA_MARKER}</body></html>`
    const withShell = async () => {
        const dir = await withClientDir()
        await writeFile(path.join(dir, 'index.html'), SHELL)
        return dir
    }

    it('an address nothing answers to is a 404 that still carries the app', async () => {
        const server = await startServer({ clientDir: await withShell(), extraEnv: { SITE_ORIGIN: 'https://diiii.test' } })

        const response = await fetch(`${server.origin}/no-such-space-zz9`)

        expect(response.status).toBe(404)
        const body = await response.text()
        expect(body).toContain(SPA_MARKER)
        expect(body).toContain('<meta name="robots" content="noindex">')
    })

    it('a real address keeps its 200 and gets its own head, said once', async () => {
        const server = await startServer({ clientDir: await withShell(), extraEnv: { SITE_ORIGIN: 'https://diiii.test' } })

        for (const route of ['/', '/terms']) {
            const response = await fetch(`${server.origin}${route}`)
            expect(response.status, route).toBe(200)
            const body = await response.text()
            expect(body).toContain(SPA_MARKER)
            expect(body).not.toContain('shell title')
            expect(body.match(/<title>/g), route).toHaveLength(1)
            expect(body).toContain(`<link rel="canonical" href="https://diiii.test${route === '/' ? '' : route}">`)
        }
    })

    it('/sitemap.xml is written from the records', async () => {
        const server = await startServer({ clientDir: await withShell(), extraEnv: { SITE_ORIGIN: 'https://diiii.test' } })

        const response = await fetch(`${server.origin}/sitemap.xml`)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toMatch(/^application\/xml/)
        expect(await response.text()).toContain('<loc>https://diiii.test/terms</loc>')
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

// What di.iiii tells a language model (serverXR/src/aiPublic.js). Until
// 2026-10-27 /llms-full.txt and every /ai/… address answered 200 with the
// app's HTML shell, and an assistant fetching one read the shell as content.
describe('/llms.txt and /ai/: answered by the server, never by the shell', () => {
    it('CLIENT_DIR set: /llms-full.txt is a 404, not 200 html', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/llms-full.txt`)

        expect(response.status).not.toBe(200)
        expect(response.headers.get('content-type')).not.toContain('text/html')
        expect(await response.text()).not.toContain(SPA_MARKER)
    })

    it('CLIENT_DIR set: an unknown /ai/ address is a 404, not the app', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        for (const url of ['/ai/context', '/ai/no-such-file.md', '/ai/']) {
            const response = await fetch(`${server.origin}${url}`)
            expect(response.status, url).toBe(404)
            expect(await response.text(), url).not.toContain(SPA_MARKER)
        }
    })

    it('CLIENT_DIR set: the shell still answers everything outside /ai/', async () => {
        const server = await startServer({ clientDir: await withClientDir() })

        const response = await fetch(`${server.origin}/main`)

        expect(response.status).toBe(200)
        expect(await response.text()).toContain(SPA_MARKER)
    })

    it('CLIENT_DIR unset: nginx\'s targets answer — /serverXR/llms.txt and /serverXR/ai/*.md', async () => {
        const server = await startServer()

        const llms = await fetch(`${server.baseUrl}/llms.txt`)
        expect(llms.status).toBe(200)
        expect(llms.headers.get('content-type')).toContain('text/plain')
        expect(await llms.text()).toMatch(/^# di\.iiii\n/)

        const about = await fetch(`${server.baseUrl}/ai/about.md`)
        expect(about.status).toBe(200)
        expect(about.headers.get('content-type')).toContain('text/markdown')

        const full = await fetch(`${server.baseUrl}/llms-full.txt`)
        expect(full.status).toBe(404)
        expect(full.headers.get('content-type')).not.toContain('text/html')
    })
})
