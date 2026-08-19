// @vitest-environment node
//
// What a whole-scene write is allowed to destroy: nothing, silently.
//
// These four contracts exist because `POST /api/sync/spaces/:id/pull` — a
// route an artist runs on their own machine — reached `replaceSceneAndBroadcast`,
// which called `writeOpsHistory`, which is delete-all-then-insert. A pull threw
// away every op the space had; a push did the same upstream. Nothing failed,
// nothing warned, and the loss is only visible later, when a catching-up client
// finds no history to replay or the blob gc decides an asset is unreferenced.
//
// A real server process, because none of this is visible from a unit test: the
// destruction was in the wiring between a route, an injected store function and
// SQLite, and every layer in isolation behaved correctly.

import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Same budget as bundleContracts: spawn + listen + first request can cross
// vitest's 5s default on a loaded machine with nothing actually wrong.
vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const activeServers = []
const tempDirs = []

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const getFreePort = async () => new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        server.close((error) => (error ? reject(error) : resolve(port)))
    })
})

const makeTempDir = async (prefix) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}

const startServer = async (extraEnv = {}) => {
    const dataRoot = await makeTempDir('dii-sync-data-')
    const sandboxCwd = await makeTempDir('dii-sync-cwd-')
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
            CORS_ORIGINS: '*',
            ...extraEnv
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

    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Server exited early.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
        try {
            const response = await fetch(`${baseUrl}/api/health`)
            if (response.ok) break
        } catch { /* retry */ }
        await wait(200)
    }

    const handle = { baseUrl, dataRoot, stop, logs: () => `STDOUT:\n${stdout}\nSTDERR:\n${stderr}` }
    activeServers.push(handle)
    return handle
}

afterEach(async () => {
    await Promise.all(activeServers.splice(0).map(server => server.stop()))
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
}, 30000)

const api = async (baseUrl, urlPath, options = {}) => {
    const response = await fetch(`${baseUrl}${urlPath}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
            ...options.headers
        }
    })
    let body = null
    try { body = await response.json() } catch { /* some responses have no body */ }
    return { status: response.status, body }
}

const createSpace = async (baseUrl, slug) => {
    const { status, body } = await api(baseUrl, '/api/spaces', {
        method: 'POST',
        body: JSON.stringify({ label: slug, slug })
    })
    expect(status, JSON.stringify(body)).toBeLessThan(300)
    return body?.space?.id || slug
}

const sceneWith = (count) => ({
    version: 4,
    objects: Array.from({ length: count }, (_, index) => ({
        id: `obj-${index}`,
        type: 'box',
        position: [index, 0, 0]
    })),
    assets: []
})

describe('a whole-scene replace', () => {
    it('keeps the op history instead of wiping it', async () => {
        const server = await startServer()
        const spaceId = await createSpace(server.baseUrl, 'canary')

        // Three separate edits, so there is a history worth losing.
        for (let index = 0; index < 3; index += 1) {
            const { body: before } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`)
            const { status } = await api(server.baseUrl, `/api/spaces/${spaceId}/ops`, {
                method: 'POST',
                body: JSON.stringify({
                    baseVersion: before.version,
                    ops: [{
                        opId: `seed-${index}`,
                        clientId: 'test',
                        type: 'addObject',
                        payload: { object: { id: `seed-${index}`, type: 'box', position: [index, 0, 0] } }
                    }]
                })
            })
            expect(status).toBe(200)
        }

        const { body: beforeReplace } = await api(server.baseUrl, `/api/spaces/${spaceId}/ops?since=0`)
        expect(beforeReplace.ops.map(op => op.opId)).toEqual(
            expect.arrayContaining(['seed-0', 'seed-1', 'seed-2'])
        )

        const { status: putStatus } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            body: JSON.stringify(sceneWith(1))
        })
        expect(putStatus).toBe(200)

        const { body: afterReplace } = await api(server.baseUrl, `/api/spaces/${spaceId}/ops?since=0`)
        const opIds = afterReplace.ops.map(op => op.opId)

        // The heart of it: the three earlier edits are still replayable, and
        // the replace sits on top of them rather than in place of them.
        expect(opIds).toEqual(expect.arrayContaining(['seed-0', 'seed-1', 'seed-2']))
        expect(afterReplace.ops.at(-1).type).toBe('replaceScene')
    })

    it('refuses a stale conditional write and leaves the scene alone', async () => {
        const server = await startServer()
        const spaceId = await createSpace(server.baseUrl, 'stale')

        await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            body: JSON.stringify(sceneWith(5))
        })
        const { body: seen } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`)
        const staleVersion = seen.version

        // Somebody else moves the space on.
        await api(server.baseUrl, `/api/spaces/${spaceId}/ops`, {
            method: 'POST',
            body: JSON.stringify({
                baseVersion: staleVersion,
                ops: [{ opId: 'someone-else', clientId: 'other', type: 'addObject', payload: { object: { id: 'theirs', type: 'box' } } }]
            })
        })

        const { status, body } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            headers: { 'If-Match': `"${staleVersion}"` },
            body: JSON.stringify(sceneWith(1))
        })

        expect(status).toBe(409)
        expect(body.latestVersion).toBeGreaterThan(staleVersion)
        expect(Array.isArray(body.pendingOps)).toBe(true)

        // And the write did not happen.
        const { body: after } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`)
        expect(after.scene.objects).toHaveLength(6)
        expect(after.scene.objects.some(object => object.id === 'theirs')).toBe(true)
    })

    it('rejects a malformed precondition rather than treating it as absent', async () => {
        const server = await startServer()
        const spaceId = await createSpace(server.baseUrl, 'malformed')

        const { status } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            headers: { 'If-Match': '"not-a-version"' },
            body: JSON.stringify(sceneWith(1))
        })
        expect(status).toBe(400)
    })

    it('requires a precondition when the server is configured to demand one', async () => {
        const server = await startServer({ SCENE_REPLACE_REQUIRE_PRECONDITION: 'true' })
        const spaceId = await createSpace(server.baseUrl, 'strict')

        await api(server.baseUrl, `/api/spaces/${spaceId}/ops`, {
            method: 'POST',
            body: JSON.stringify({
                baseVersion: 0,
                ops: [{ opId: 'keep-me', clientId: 'test', type: 'addObject', payload: { object: { id: 'keep-me', type: 'box' } } }]
            })
        })

        const { status } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            body: JSON.stringify(sceneWith(1))
        })
        expect(status).toBe(428)

        const { body: after } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`)
        expect(after.scene.objects.some(object => object.id === 'keep-me')).toBe(true)

        // The same write, stating what it replaces, is allowed through.
        const { status: conditional } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            headers: { 'If-Match': `"${after.version}"` },
            body: JSON.stringify(sceneWith(1))
        })
        expect(conditional).toBe(200)
    })
})

describe('reading a scene in order to copy it', () => {
    it('returns what is stored, and names the assets it could not find', async () => {
        const server = await startServer()
        const spaceId = await createSpace(server.baseUrl, 'verbatim')

        // A manifest entry whose file does not exist here, with a url pointing
        // at somewhere else entirely — exactly what a scene pulled from another
        // instance looks like before its assets are downloaded.
        const scene = {
            version: 4,
            objects: [{ id: 'a', type: 'box' }],
            assets: [{
                id: 'a'.repeat(64),
                name: 'absent.png',
                url: 'https://elsewhere.invalid/assets/absent.png'
            }]
        }
        await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            body: JSON.stringify(scene)
        })

        const { body: rendered } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene`)
        const { body: verbatim } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene?verbatim=1`)

        // The normal read is a rendering: the entry is gone, because its file
        // is not on this disk. Copying THAT upstream is the manifest erasure.
        expect(rendered.scene.assets).toHaveLength(0)

        // The verbatim read keeps it, keeps its foreign url, and says why the
        // normal read would have dropped it.
        expect(verbatim.verbatim).toBe(true)
        expect(verbatim.scene.assets).toHaveLength(1)
        expect(verbatim.scene.assets[0].url).toBe('https://elsewhere.invalid/assets/absent.png')
        expect(verbatim.missingAssetIds).toEqual(['a'.repeat(64)])

        // And it round-trips: writing the verbatim body back changes nothing.
        await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            headers: { 'If-Match': `"${verbatim.version}"` },
            body: JSON.stringify(verbatim.scene)
        })
        const { body: again } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene?verbatim=1`)
        expect(again.scene).toEqual(verbatim.scene)
    })

    it('does not stamp the serving host into the stored scene', async () => {
        const server = await startServer()
        const spaceId = await createSpace(server.baseUrl, 'origin')

        await api(server.baseUrl, `/api/spaces/${spaceId}/scene`, {
            method: 'PUT',
            body: JSON.stringify({ version: 4, objects: [], assets: [] })
        })

        const { body: verbatim } = await api(server.baseUrl, `/api/spaces/${spaceId}/scene?verbatim=1`)
        // assetsBaseUrl is reported beside the scene, never inside it — a
        // scene carrying one instance's base url breaks on every other.
        expect(verbatim.assetsBaseUrl).toContain('/api/spaces/')
        expect(verbatim.scene.assetsBaseUrl).toBeUndefined()
    })
})
