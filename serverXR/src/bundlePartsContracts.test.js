// @vitest-environment node

// A space file sent in parts (routes/bundleParts.js): POST /api/spaces/bundle/uploads,
// PUT .../parts/:n, POST .../finish. A real serverXR child; parts of ~1 KB
// (BUNDLE_PART_MB=0.0001) so nothing big is ever written.
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ENTRY = path.join(HERE, 'index.js')
const ADMIN = { Authorization: 'Bearer test-token' }
const JSON_HEADERS = { 'Content-Type': 'application/json' }
const servers = []

const startServer = async ({ requireAuth = false, extraEnv = {} } = {}) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-parts-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-parts-data-'))
    const env = {
        ...process.env, NODE_ENV: 'test', APP_BASE_PATH: '/serverXR', DATA_ROOT: dataRoot,
        API_TOKEN: 'test-token', CORS_ORIGINS: '*', AUTH_SESSION_SECRET: 'test-session-secret', AUTH_HUB_URL: 'off',
        REQUIRE_AUTH: String(requireAuth), BUNDLE_PART_MB: '0.0001', ...extraEnv
    }
    delete env.SPACES_DIR
    delete env.UPLOADS_DIR
    const { child, port } = await spawnServerUntilReady({ entry: ENTRY, cwd, env })
    const handle = {
        base: `http://127.0.0.1:${port}/serverXR`,
        partsDir: path.join(dataRoot, 'uploads', 'bundle-parts'),
        stop: async () => {
            child.kill('SIGKILL')
            await new Promise((resolve) => (child.exitCode === null ? child.once('exit', resolve) : resolve()))
            await rm(cwd, { recursive: true, force: true })
            await rm(dataRoot, { recursive: true, force: true })
        }
    }
    servers.push(handle)
    return handle
}
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.stop())) })

// A real saved file, so the finish step imports something the tool accepts.
const savedFile = async (server, label) => {
    await fetch(`${server.base}/api/spaces`, { method: 'POST', headers: { ...JSON_HEADERS, ...ADMIN }, body: JSON.stringify({ label, permanent: true }) })
    return Buffer.from(await (await fetch(`${server.base}/api/spaces/${label}/bundle`, { headers: ADMIN })).arrayBuffer())
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const start = (server, bytes, extra = {}, headers = ADMIN) => fetch(`${server.base}/api/spaces/bundle/uploads`, {
    method: 'POST', headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify({ size: bytes.length, sha256: sha(bytes), name: 'x.diiii', ...extra })
})
const put = (server, id, n, bytes, headers = ADMIN) => fetch(`${server.base}/api/spaces/bundle/uploads/${id}/parts/${n}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: bytes
})
const finishRaw = (server, id, headers = ADMIN) => fetch(`${server.base}/api/spaces/bundle/uploads/${id}/finish`, { method: 'POST', headers: { ...JSON_HEADERS, ...headers }, body: '{}' })
const state = (server, id, headers = ADMIN) => fetch(`${server.base}/api/spaces/bundle/uploads/${id}`, { headers })
// Finish answers 202 and the work runs in the background: wait for the job to
// end and answer like the single POST would (status + body).
const finish = async (server, id, headers = ADMIN) => {
    const first = await finishRaw(server, id, headers)
    if (first.status !== 202) return first
    let said = null
    await vi.waitFor(async () => {
        said = await (await state(server, id, headers)).json()
        expect(['done', 'failed']).toContain(said.state)
    }, { timeout: 30000, interval: 100 })
    const { state: _state, httpStatus, ...body } = said
    return { status: httpStatus, json: async () => body }
}
const sendAll = async (server, id, bytes, partBytes, skip = []) => {
    const parts = Math.ceil(bytes.length / partBytes)
    for (let n = 1; n <= parts; n += 1) {
        if (skip.includes(n)) continue
        expect((await put(server, id, n, bytes.subarray((n - 1) * partBytes, n * partBytes))).status).toBe(200)
    }
    return parts
}
const left = (server) => readdir(server.partsDir).catch(() => [])
const gone = (server) => vi.waitFor(async () => { expect(await readdir(server.partsDir).catch(() => [])).toEqual([]) })
// After a job only meta.json + status.json (the result) stay: no part, no joined copy.
const noBytes = async (server) => {
    for (const id of await left(server)) expect((await readdir(path.join(server.partsDir, id))).sort()).toEqual(['meta.json', 'status.json'])
}

describe('a space file sent in parts', () => {
    it('opens a file sent in several parts, as the name asked, and leaves no parts behind', async () => {
        const server = await startServer()
        const bytes = await savedFile(server, 'in-parts')
        const begun = await (await start(server, bytes, { as: 'arrived' })).json()
        expect(begun.partBytes).toBe(104)
        expect(begun.parts).toBeGreaterThan(1)
        await sendAll(server, begun.uploadId, bytes, begun.partBytes)
        expect((await left(server)).length).toBe(1)
        const done = await finish(server, begun.uploadId)
        expect(done.status).toBe(201)
        expect((await done.json()).spaceId).toBe('arrived')
        await noBytes(server)
        const listed = await (await fetch(`${server.base}/api/spaces`, { headers: ADMIN })).json()
        expect(listed.spaces.map((space) => space.id)).toContain('arrived')
    }, 60000)

    it('keeps every refusal of the single route: a name already taken is 409 space_exists', async () => {
        const server = await startServer()
        const bytes = await savedFile(server, 'taken')
        const begun = await (await start(server, bytes)).json()
        await sendAll(server, begun.uploadId, bytes, begun.partBytes)
        const done = await finish(server, begun.uploadId)
        expect(done.status).toBe(409)
        expect((await done.json()).code).toBe('space_exists')
        await noBytes(server)
    }, 60000)

    it('refuses a file whose sha256 is not the one announced, opens nothing, removes the parts', async () => {
        const server = await startServer()
        const bytes = await savedFile(server, 'wrong-sha')
        const begun = await (await fetch(`${server.base}/api/spaces/bundle/uploads`, {
            method: 'POST', headers: { ...JSON_HEADERS, ...ADMIN },
            body: JSON.stringify({ size: bytes.length, sha256: 'a'.repeat(64), name: 'x.diiii', as: 'never' })
        })).json()
        await sendAll(server, begun.uploadId, bytes, begun.partBytes)
        const done = await finish(server, begun.uploadId)
        expect(done.status).toBe(422)
        expect((await done.json()).code).toBe('sha256_mismatch')
        await noBytes(server)
        const listed = await (await fetch(`${server.base}/api/spaces`, { headers: ADMIN })).json()
        expect(listed.spaces.map((space) => space.id)).not.toContain('never')
    }, 60000)

    it('refuses to finish with a part missing, says which, and lets it be sent afterwards', async () => {
        const server = await startServer()
        const bytes = await savedFile(server, 'gappy')
        const begun = await (await start(server, bytes, { as: 'gappy-copy' })).json()
        await sendAll(server, begun.uploadId, bytes, begun.partBytes, [2])
        const early = await finish(server, begun.uploadId)
        expect(early.status).toBe(409)
        const said = await early.json()
        expect(said.code).toBe('parts_missing')
        expect(said.missing).toEqual([2])
        expect((await put(server, begun.uploadId, 2, bytes.subarray(begun.partBytes, 2 * begun.partBytes))).status).toBe(200)
        expect((await finish(server, begun.uploadId)).status).toBe(201)
    }, 60000)

    it('refuses a part of the wrong size and a file over MAX_BUNDLE_MB', async () => {
        const server = await startServer({ extraEnv: { MAX_BUNDLE_MB: '1' } })
        const bytes = Buffer.alloc(3000, 7)
        const begun = await (await start(server, bytes)).json()
        expect((await put(server, begun.uploadId, 1, bytes.subarray(0, 50))).status).toBe(422)
        expect((await put(server, begun.uploadId, 1, bytes.subarray(0, 500))).status).toBe(413)
        expect((await put(server, begun.uploadId, 99, bytes.subarray(0, 104))).status).toBe(400)
        const big = await fetch(`${server.base}/api/spaces/bundle/uploads`, {
            method: 'POST', headers: { ...JSON_HEADERS, ...ADMIN }, body: JSON.stringify({ size: 2 * 1024 * 1024, sha256: 'b'.repeat(64), name: 'x.diiii' })
        })
        expect(big.status).toBe(413)
    }, 60000)

    it('cancelling removes the parts', async () => {
        const server = await startServer()
        const bytes = Buffer.alloc(3000, 7)
        const begun = await (await start(server, bytes)).json()
        await put(server, begun.uploadId, 1, bytes.subarray(0, 104))
        const cancelled = await fetch(`${server.base}/api/spaces/bundle/uploads/${begun.uploadId}`, { method: 'DELETE', headers: ADMIN })
        expect(cancelled.status).toBe(200)
        await gone(server)
    }, 60000)

    it('finish answers 202 at once, a second finish is already_finishing, GET reports the job to the owner and clears on DELETE', async () => {
        const server = await startServer()
        const bytes = await savedFile(server, 'job-source')
        const begun = await (await start(server, bytes, { as: 'job-copy' })).json()
        await sendAll(server, begun.uploadId, bytes, begun.partBytes)
        expect((await (await state(server, begun.uploadId)).json()).state).toBe('receiving')
        const first = await finishRaw(server, begun.uploadId)
        expect(first.status).toBe(202)
        const second = await finishRaw(server, begun.uploadId)
        expect(second.status).toBe(409)
        expect((await second.json()).code).toBe('already_finishing')
        let said
        await vi.waitFor(async () => {
            said = await (await state(server, begun.uploadId)).json()
            expect(said.state).toBe('done')
        }, { timeout: 30000, interval: 100 })
        expect(said.spaceId).toBe('job-copy')
        expect((await fetch(`${server.base}/api/spaces/bundle/uploads/${begun.uploadId}`, { method: 'DELETE', headers: ADMIN })).status).toBe(200)
        await gone(server)
        expect((await state(server, begun.uploadId)).status).toBe(404)
    }, 60000)

    it('with auth on: no sign-in is refused at every step', async () => {
        const server = await startServer({ requireAuth: true })
        const bytes = Buffer.alloc(3000, 7)
        expect([401, 403]).toContain((await start(server, bytes, {}, {})).status)
        const begun = await (await start(server, bytes)).json()
        expect(begun.uploadId).toBeTruthy()
        expect([401, 403]).toContain((await put(server, begun.uploadId, 1, bytes.subarray(0, 104), {})).status)
        expect([401, 403]).toContain((await finish(server, begun.uploadId, {})).status)
        expect([401, 403]).toContain((await state(server, begun.uploadId, {})).status)
        expect((await state(server, begun.uploadId)).status).toBe(200)
        expect((await put(server, begun.uploadId, 1, bytes.subarray(0, 104))).status).toBe(200)
    }, 60000)
})
