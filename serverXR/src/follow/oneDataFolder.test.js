// @vitest-environment node

// Two serverXR processes on ONE data folder — the owner's setup on aylmo: the
// installed di and a dev stack sharing ~/.local/share/di.iiii/data. On
// 2026-10-02 both ran a follower for space `test-desk` into the same di.db and
// left project `test` at document_version 809 with ops up to 819; every write
// after that was a 500, every 25 s, for hours (docs/ai/known-fixes.md, "two
// servers on one data folder").
//
// Real processes, real HTTP, a real third server as the followed host. Nothing
// is stubbed: the bug lived between processes, so only processes can prove it
// is gone. Every data folder is a temp dir; every port is a free one the OS
// handed out (never 4000/443/80).

import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from '../testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const SERVER_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.js')
const API_TOKEN = 'one-folder-token'
const SPACE = 'test-desk'
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
    const cwd = await tempDir('dii-one-folder-cwd-')
    const env = { ...process.env, NODE_ENV: 'test', APP_BASE_PATH: '/serverXR', DATA_ROOT: dataRoot, API_TOKEN, REQUIRE_AUTH: '', CORS_ORIGINS: '*' }
    delete env.SPACES_DIR
    delete env.UPLOADS_DIR
    delete env.DB_PATH
    const { child, port, logs } = await spawnServerUntilReady({ entry: SERVER_ENTRY, cwd, env })
    const server = {
        child, port, logs, pid: child.pid,
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

const settle = async (label, probe, { timeout = 20_000, every = 150 } = {}) => {
    const deadline = Date.now() + timeout
    let last = null
    while (Date.now() < deadline) {
        last = await probe()
        if (last) return last
        await wait(every)
    }
    throw new Error(`${label} — never became true within ${timeout} ms (last saw: ${JSON.stringify(last)})`)
}

const follows = async (server) => (await fetch(`${server.baseUrl}/api/follows`)).json()

const createSpace = async (server, spaceId) => {
    const response = await fetch(`${server.baseUrl}/api/spaces`, { method: 'POST', headers, body: JSON.stringify({ slug: spaceId, label: spaceId, permanent: true }) })
    expect(response.status).toBe(201)
}

const createProject = async (server, spaceId, projectId) => {
    const response = await fetch(`${server.baseUrl}/api/spaces/${spaceId}/projects`, { method: 'POST', headers, body: JSON.stringify({ slug: projectId, title: projectId }) })
    expect(response.status).toBe(201)
}

const versionOf = async (server, projectId) => (await (await fetch(`${server.baseUrl}/api/projects/${projectId}/document`, { headers })).json()).version

const postOp = async (server, projectId, baseVersion, opId) => {
    const response = await fetch(`${server.baseUrl}/api/projects/${projectId}/ops`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ baseVersion, ops: [{ opId, type: 'createEntity', payload: { entity: { id: opId, type: 'box', name: opId } } }] })
    })
    return { status: response.status, body: await response.json().catch(() => null) }
}

// What every editor does: write at the version you hold; on a 409 take the
// version the server names and try again.
const writer = async (server, projectId, name, count, statuses) => {
    let base = await versionOf(server, projectId)
    for (let i = 0; i < count; i += 1) {
        const opId = `${name}-${i}`
        for (let attempt = 0; attempt < 200; attempt += 1) {
            const answer = await postOp(server, projectId, base, opId)
            statuses.push(answer.status)
            if (answer.status === 200) { base = answer.body.newVersion; break }
            if (answer.status === 409) { base = answer.body.latestVersion; continue }
            throw new Error(`${name}: write ${i} answered ${answer.status} ${JSON.stringify(answer.body)}`)
        }
    }
}

const readDb = (dataRoot) => new DatabaseSync(path.join(dataRoot, 'di.db'), { readOnly: true })

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.stop()))
})

afterAll(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('two servers on one data folder', () => {
    it('only one of them follows; both write the same project and it stays whole; the other takes over when the first dies', async () => {
        const host = await startServer(await tempDir('dii-one-folder-host-'))
        await createSpace(host, SPACE)

        // The shared folder already follows the host — the state on aylmo.
        const shared = await tempDir('dii-one-folder-shared-')
        await writeFile(path.join(shared, 'follows.json'), JSON.stringify({
            format: 'di.follows', version: 1,
            follows: { [SPACE]: { remote: host.baseUrl, token: API_TOKEN, label: null, followedAt: new Date().toISOString() } }
        }))
        const first = await startServer(shared)
        const second = await startServer(shared)

        // Exactly one carries the follow, and the other names it.
        const [a, b] = await settle('one server carries the follow', async () => {
            const both = [await follows(first), await follows(second)]
            return both.some(state => state.carriedHere && state.follows.length === 1) && both.some(state => state.carriedHere === false) ? both : null
        })
        const holder = a.carriedHere ? first : second
        const other = a.carriedHere ? second : first
        const otherState = a.carriedHere ? b : a
        expect(otherState.follows).toEqual([])
        expect(otherState.carriedBy).toEqual(expect.objectContaining({ pid: holder.pid, port: holder.port }))
        expect(otherState.message).toMatch(new RegExp(`carries the follows \\(pid ${holder.pid}, port ${holder.port}`))
        // …and keeps saying so: a few heartbeats later it still runs none.
        await wait(6000)
        expect((await follows(other)).follows).toEqual([])
        expect((await follows(holder)).follows).toHaveLength(1)
        expect(other.logs()).toMatch(/another di\.iiii server on this data folder carries the follows/)

        // Both servers write one project at once, two editors on each.
        await settle('the followed space exists here', async () => (await fetch(`${first.baseUrl}/api/spaces/${SPACE}`, { headers })).ok)
        await createProject(first, SPACE, 'test')
        const statuses = []
        await Promise.all([
            writer(first, 'test', 'a1', 12, statuses),
            writer(first, 'test', 'a2', 12, statuses),
            writer(second, 'test', 'b1', 12, statuses),
            writer(second, 'test', 'b2', 12, statuses)
        ])
        expect(statuses.filter(status => status >= 500)).toEqual([])
        expect(statuses.filter(status => status === 200)).toHaveLength(48)

        // The database agrees with itself: no op above the version, one op per write.
        const db = readDb(shared)
        try {
            const project = db.prepare('SELECT document_version AS v FROM projects WHERE id = ?').get('test')
            const ops = db.prepare('SELECT MAX(version) AS max, COUNT(*) AS n, COUNT(DISTINCT version) AS distinct_versions FROM project_ops WHERE project_id = ?').get('test')
            const ours = db.prepare("SELECT COUNT(*) AS n FROM project_ops WHERE project_id = ? AND substr(json_extract(data, '$.opId'), 1, 3) IN ('a1-', 'a2-', 'b1-', 'b2-')").get('test')
            expect(ops.max).toBe(project.v)
            expect(ops.n).toBe(ops.distinct_versions)
            expect(ours.n).toBe(48)
        } finally {
            db.close()
        }
        expect(await versionOf(first, 'test')).toBe(await versionOf(second, 'test'))

        // The holder dies the way node --watch kills it — no goodbye. The other
        // takes the follow over on its next heartbeat.
        await holder.stop('SIGKILL')
        const taken = await settle('the other server takes the follow over', async () => {
            const state = await follows(other)
            return state.carriedHere && state.follows.length === 1 ? state : null
        })
        expect(taken.follows[0].spaceId).toBe(SPACE)
        expect(other.logs()).toMatch(new RegExp(`took over the follows for this data folder from pid ${holder.pid}`))
    })
})

describe('a project already broken this way', () => {
    it('is healed at startup and takes its next write — v810, not a 500', async () => {
        const dataRoot = await tempDir('dii-one-folder-fixture-')
        const before = await startServer(dataRoot)
        await createProject(before, 'main', 'test')
        await before.stop()

        // The state found on aylmo: document_version 809, ops 805–819.
        const db = new DatabaseSync(path.join(dataRoot, 'di.db'))
        db.prepare('UPDATE projects SET document_version = 809 WHERE id = ?').run('test')
        const insert = db.prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)')
        for (let version = 805; version <= 819; version += 1) {
            insert.run('test', version, JSON.stringify({ opId: `stray-${version}`, version, type: 'createEntity', payload: { entity: { id: `stray-${version}`, type: 'box' } } }), Date.now())
        }
        db.close()

        const after = await startServer(dataRoot)
        const answer = await postOp(after, 'test', 809, 'after-heal')
        expect(answer.status).toBe(200)
        expect(answer.body.newVersion).toBe(810)
        expect(after.logs()).toMatch(/test: 10 op\(s\) v810–v819 were above the version it stands at \(v809\) — moved to project_ops_quarantine/)

        const check = readDb(dataRoot)
        try {
            expect(check.prepare('SELECT MAX(version) AS v FROM project_ops WHERE project_id = ?').get('test').v).toBe(810)
            expect(check.prepare('SELECT COUNT(*) AS n FROM project_ops_quarantine WHERE project_id = ?').get('test').n).toBe(10)
        } finally {
            check.close()
        }
    })
})
