// @vitest-environment node

// A space's scene written by two serverXR processes on ONE data folder, and a
// scene write cut off between its steps — the scene half of what
// follow/oneDataFolder.test.js proves for projects.
//
// Audit 2026-10-09 (data §F1): POST /api/spaces/:id/ops wrote scene.json, then
// the ops, then the version — three separate steps behind an in-process lock
// only. Two servers on one folder: 64 of 190 writes answered 500, scene.json
// held 70 objects for 36 acknowledged writes, and every later write was a 500.
// A crash between the ops and the version left one op row above the version,
// and the space refused every write after a restart.
//
// Real processes, real HTTP, real SQLite. Every data folder is a temp dir;
// every port is a free one the OS handed out (never 4000/443/80).

import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 90_000, hookTimeout: 60_000 })

const SERVER_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.js')
const API_TOKEN = 'scene-one-folder-token'
const SPACE = 'room-one'
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` }

const dirs = []
const servers = []
const tempDir = async (prefix) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
    dirs.push(dir)
    return dir
}

const startServer = async (dataRoot) => {
    const cwd = await tempDir('dii-scene-folder-cwd-')
    const env = { ...process.env, NODE_ENV: 'test', APP_BASE_PATH: '/serverXR', DATA_ROOT: dataRoot, API_TOKEN, REQUIRE_AUTH: '', CORS_ORIGINS: '*' }
    delete env.SPACES_DIR
    delete env.UPLOADS_DIR
    delete env.DB_PATH
    const { child, port, logs } = await spawnServerUntilReady({ entry: SERVER_ENTRY, cwd, env })
    const server = {
        child, port, logs,
        baseUrl: `http://127.0.0.1:${port}/serverXR`,
        async stop(signal = 'SIGTERM') {
            if (child.exitCode !== null || child.signalCode) return
            const exited = new Promise(resolve => child.once('exit', resolve))
            child.kill(signal)
            await Promise.race([exited, wait(3000)])
            if (child.exitCode === null && !child.signalCode) { child.kill('SIGKILL'); await exited }
        }
    }
    servers.push(server)
    return server
}

const createSpace = async (server, spaceId) => {
    const response = await fetch(`${server.baseUrl}/api/spaces`, { method: 'POST', headers, body: JSON.stringify({ slug: spaceId, label: spaceId, permanent: true }) })
    expect(response.status).toBe(201)
}

const sceneVersion = async (server, spaceId) =>
    (await (await fetch(`${server.baseUrl}/api/spaces/${spaceId}/ops?since=999999999`, { headers })).json()).latestVersion

const postOp = async (server, spaceId, baseVersion, opId) => {
    const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/ops`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ baseVersion, ops: [{ opId, type: 'addObject', payload: { object: { id: opId, type: 'box' } } }] })
    })
    return { status: response.status, body: await response.json().catch(() => null) }
}

// What every editor does: write at the version you hold; on a 409 take the
// version the server names and try again. Anything else is recorded and the
// editor moves on, so the test can count every answer.
const writer = async (server, spaceId, name, count, statuses, acknowledged) => {
    let base = await sceneVersion(server, spaceId)
    for (let i = 0; i < count; i += 1) {
        const opId = `${name}-${i}`
        for (let attempt = 0; attempt < 400; attempt += 1) {
            const answer = await postOp(server, spaceId, base, opId)
            statuses.push(answer.status)
            if (answer.status === 200) { base = answer.body.newVersion; acknowledged.add(opId); break }
            if (answer.status === 409) { base = answer.body.latestVersion; continue }
            break
        }
    }
}

const readDb = (dataRoot) => new DatabaseSync(path.join(dataRoot, 'di.db'), { readOnly: true })
const readScene = async (dataRoot, spaceId) => JSON.parse(await readFile(path.join(dataRoot, 'spaces', spaceId, 'scene.json'), 'utf8'))

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.stop()))
})

afterAll(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('a space scene on one data folder', () => {
    it('two servers, four editors: every write is a 200 or a 409, and the scene, the ops and the version agree', async () => {
        const shared = await tempDir('dii-scene-folder-shared-')
        const first = await startServer(shared)
        const second = await startServer(shared)
        await createSpace(first, SPACE)

        const statuses = []
        const acknowledged = new Set()
        const perWriter = 15
        await Promise.all([
            writer(first, SPACE, 'a1', perWriter, statuses, acknowledged),
            writer(first, SPACE, 'a2', perWriter, statuses, acknowledged),
            writer(second, SPACE, 'b1', perWriter, statuses, acknowledged),
            writer(second, SPACE, 'b2', perWriter, statuses, acknowledged)
        ])
        const others = statuses.filter(status => status !== 200 && status !== 409)
        expect(others, `answers other than 200/409: ${JSON.stringify(others.slice(0, 10))}`).toEqual([])
        expect(acknowledged.size).toBe(4 * perWriter)

        const db = readDb(shared)
        const version = db.prepare('SELECT scene_version AS v FROM spaces WHERE id = ?').get(SPACE).v
        const ops = db.prepare('SELECT MAX(version) AS mx, COUNT(*) AS n FROM space_ops WHERE space_id = ?').get(SPACE)
        db.close()
        expect(version).toBe(4 * perWriter)
        expect(ops).toEqual({ mx: version, n: version })

        // The scene holds exactly the acknowledged writes — nothing a refused
        // write made, nothing lost.
        const scene = await readScene(shared, SPACE)
        expect(scene.objects.map(object => object.id).sort()).toEqual([...acknowledged].sort())

        // …and the space still takes a write.
        const after = await postOp(first, SPACE, await sceneVersion(first, SPACE), 'after-race')
        expect(after.status).toBe(200)
    })

    it('a write cut off after its ops but before its version: the restarted server takes the next write and sets the stray op aside', async () => {
        const dataRoot = await tempDir('dii-scene-crash-')
        let server = await startServer(dataRoot)
        await createSpace(server, 'room')
        expect((await postOp(server, 'room', 0, 'one')).status).toBe(200)
        await server.stop('SIGKILL')

        // The on-disk state the old three-step write left when killed between
        // the op append and the version bump: an op row above the version.
        const db = new DatabaseSync(path.join(dataRoot, 'di.db'))
        db.prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run('room', 2, JSON.stringify({ opId: 'two', type: 'addObject', version: 2, payload: { object: { id: 'two', type: 'box' } } }), Date.now())
        db.close()

        server = await startServer(dataRoot)
        expect(await sceneVersion(server, 'room')).toBe(1)
        const next = await postOp(server, 'room', 1, 'after-restart')
        expect(next.status, JSON.stringify(next.body)).toBe(200)
        expect(next.body.newVersion).toBe(2)

        const scene = await readScene(dataRoot, 'room')
        expect(scene.objects.map(object => object.id)).toEqual(['one', 'after-restart'])
        const check = readDb(dataRoot)
        const quarantined = check.prepare('SELECT version, document_version AS at FROM space_ops_quarantine WHERE space_id = ?').all('room')
        check.close()
        expect(quarantined.map(row => ({ ...row }))).toEqual([{ version: 2, at: 1 }])
        expect(server.logs()).toMatch(/room: 1 op\(s\) v2–v2 were above the version/)
    })
})
