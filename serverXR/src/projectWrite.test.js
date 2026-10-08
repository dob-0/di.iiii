// @vitest-environment node

// One writer per project across every server on a data folder — the store half.
//
// The state these tests build is the one found on aylmo on 2026-10-02: project
// `test` at document_version 809 with project_ops rows up to 819, written by two
// serverXR processes on one data folder. Every write after that was a 500
// (UNIQUE constraint failed: project_ops.project_id, project_ops.version).
// docs/ai/known-fixes.md, "two servers on one data folder".

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const store = require('./projectStore.js')
const { initDb, closeDb, getDb } = require('./db.js')
const { withProjectWriteLock, withProjectInProcessLock, commitProjectWrite } = require('./projectWrite.js')

const SPACE = 'room'
const PROJECT = 'test'
const tempDirs = []
const quietLog = { info() {}, warn() {}, error() {} }

const makeSpacesDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-one-writer-'))
    tempDirs.push(dir)
    return dir
}

// Project `test` at v809 with ops 805–819: the exact state on aylmo.
const seedOrphanState = async (spacesDir) => {
    await store.ensureProject(spacesDir, SPACE, PROJECT, { title: 'test' })
    getDb().prepare('UPDATE projects SET document_version = 809 WHERE id = ?').run(PROJECT)
    const insert = getDb().prepare('INSERT INTO project_ops (project_id, version, data, created_at) VALUES (?, ?, ?, ?)')
    for (let version = 805; version <= 819; version += 1) {
        insert.run(PROJECT, version, JSON.stringify({ opId: `op-${version}`, version, type: 'updateProjectMeta', payload: {} }), Date.now())
    }
}

const maxOpVersion = () => getDb().prepare('SELECT MAX(version) AS v FROM project_ops WHERE project_id = ?').get(PROJECT).v
const documentVersion = () => getDb().prepare('SELECT document_version AS v FROM projects WHERE id = ?').get(PROJECT).v
const op = (version, opId = `new-${version}`) => ({ opId, version, type: 'updateProjectMeta', payload: { title: `v${version}` }, timestamp: Date.now() })

beforeEach(() => {
    initDb(':memory:')
})

afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('a project with ops above its version is healed, not failed', () => {
    it('at startup: the ops above v809 move to the quarantine with the reason, and the version stands', async () => {
        const spacesDir = await makeSpacesDir()
        await seedOrphanState(spacesDir)
        expect(maxOpVersion()).toBe(819)

        const warnings = []
        const healed = store.healOrphanProjectOps({ log: { warn: (line) => warnings.push(line) } })

        expect(healed).toEqual([expect.objectContaining({ projectId: PROJECT, documentVersion: 809, moved: 10, from: 810, to: 819 })])
        expect(maxOpVersion()).toBe(809)
        expect(documentVersion()).toBe(809)
        const quarantined = store.listQuarantinedOps(PROJECT)
        expect(quarantined.map(row => row.version)).toEqual([810, 811, 812, 813, 814, 815, 816, 817, 818, 819])
        expect(quarantined.every(row => row.document_version === 809 && /two writers on one data folder/.test(row.reason))).toBe(true)
        // Nothing is lost: the op itself is kept whole.
        expect(JSON.parse(quarantined[0].data).opId).toBe('op-810')
        expect(warnings.join('\n')).toMatch(/test: 10 op\(s\) v810–v819 .* moved to project_ops_quarantine/)
    })

    it('on the next write: v810 commits (it was a UNIQUE-constraint 500 before), with the stray ops set aside in the same transaction', async () => {
        const spacesDir = await makeSpacesDir()
        await seedOrphanState(spacesDir)

        const result = store.commitProjectOps({ projectId: PROJECT, baseVersion: 809, ops: [op(810)], nextVersion: 810 })

        expect(result.ok).toBe(true)
        expect(result.healed).toEqual(expect.objectContaining({ moved: 10, from: 810, to: 819 }))
        expect(documentVersion()).toBe(810)
        expect(maxOpVersion()).toBe(810)
        expect(JSON.parse(getDb().prepare('SELECT data FROM project_ops WHERE project_id = ? AND version = 810').get(PROJECT).data).opId).toBe('new-810')
    })
})

describe('the version check, the ops and the version are one transaction', () => {
    it('a write based on an old version is a conflict and writes nothing', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT)
        expect(store.commitProjectOps({ projectId: PROJECT, baseVersion: 0, ops: [op(1)], nextVersion: 1 }).ok).toBe(true)

        // The loser of a race: it read v0 too.
        const lost = store.commitProjectOps({ projectId: PROJECT, baseVersion: 0, ops: [op(1, 'loser')], nextVersion: 1 })

        expect(lost).toEqual({ conflict: true, latestVersion: 1 })
        expect(documentVersion()).toBe(1)
        expect(getDb().prepare('SELECT COUNT(*) AS n FROM project_ops WHERE project_id = ?').get(PROJECT).n).toBe(1)
    })

    it('a failed insert rolls the version back with it — never ops without their version', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT)
        // Two ops claiming one version: the UNIQUE index refuses the second.
        expect(() => store.commitProjectOps({ projectId: PROJECT, baseVersion: 0, ops: [op(1, 'a'), op(1, 'b')], nextVersion: 2 })).toThrow(/UNIQUE/)
        expect(documentVersion()).toBe(0)
        expect(maxOpVersion()).toBe(null)
    })
})

describe('the document file and the database are written so a crash leaves something whole', () => {
    it('commitProjectWrite stages, commits, then puts the document in place — and leaves no pending file', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT)
        const document = await store.readProjectDocument(spacesDir, SPACE, PROJECT)
        document.projectMeta.title = 'after'

        const result = await commitProjectWrite({ spacesDir, spaceId: SPACE, projectId: PROJECT, baseVersion: 0, ops: [op(1)], document, title: 'after', log: quietLog })

        expect(result.ok).toBe(true)
        expect((await store.readProjectDocument(spacesDir, SPACE, PROJECT)).projectMeta.title).toBe('after')
        const { projectDir } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        expect((await readdir(projectDir)).filter(name => name.endsWith('.pending'))).toEqual([])
    })

    it('a conflict writes neither the document nor the ops', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT, { title: 'before' })
        getDb().prepare('UPDATE projects SET document_version = 3 WHERE id = ?').run(PROJECT)
        const document = await store.readProjectDocument(spacesDir, SPACE, PROJECT)
        document.projectMeta.title = 'should-not-land'

        const result = await commitProjectWrite({ spacesDir, spaceId: SPACE, projectId: PROJECT, baseVersion: 2, ops: [op(3)], document, log: quietLog })

        expect(result).toEqual({ conflict: true, latestVersion: 3 })
        expect((await store.readProjectDocument(spacesDir, SPACE, PROJECT)).projectMeta.title).toBe('before')
        const { projectDir } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        expect((await readdir(projectDir)).filter(name => name.endsWith('.pending'))).toEqual([])
    })

    it('a stopped write is finished under the lock: a committed pending document goes in place, an uncommitted one goes away', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT, { title: 'before' })
        getDb().prepare('UPDATE projects SET document_version = 5 WHERE id = ?').run(PROJECT)
        const { projectDir } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        const base = await store.readProjectDocument(spacesDir, SPACE, PROJECT)
        // v5 committed but never renamed in (killed between steps 2 and 3);
        // v6 staged but never committed (killed between steps 1 and 2).
        await writeFile(path.join(projectDir, 'document.json.v5.pending'), JSON.stringify({ ...base, projectMeta: { ...base.projectMeta, title: 'committed-v5' } }))
        await writeFile(path.join(projectDir, 'document.json.v6.pending'), JSON.stringify({ ...base, projectMeta: { ...base.projectMeta, title: 'never-committed-v6' } }))

        const warnings = []
        await withProjectWriteLock({ spacesDir, spaceId: SPACE, projectId: PROJECT, log: { warn: (line) => warnings.push(line) } }, async () => {})

        expect((await store.readProjectDocument(spacesDir, SPACE, PROJECT)).projectMeta.title).toBe('committed-v5')
        expect((await readdir(projectDir)).filter(name => name.endsWith('.pending'))).toEqual([])
        expect(warnings.join('\n')).toMatch(/document v5 — it was committed/)
        expect(warnings.join('\n')).toMatch(/document v6 — it was never committed/)
    })
})

describe('the project write lock holds across processes', () => {
    it('waits while ANOTHER PROCESS holds the lock, and runs once it lets go', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT)
        const { documentPath } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        const lockfilePath = `${documentPath}.lock`
        const holdMs = 1200
        // A second process takes the same lock the way projectWrite.js does
        // and holds it — the dev stack writing while the installed di wants to.
        const holder = spawn(process.execPath, ['-e', `
            const lockfile = require(${JSON.stringify(require.resolve('proper-lockfile'))})
            lockfile.lock(${JSON.stringify(documentPath)}, { realpath: false, lockfilePath: ${JSON.stringify(lockfilePath)}, stale: 10000 })
              .then((release) => { process.stdout.write('held\\n'); setTimeout(() => release().then(() => process.exit(0)), ${holdMs}) })
        `], { stdio: ['ignore', 'pipe', 'inherit'] })
        await new Promise((resolve) => holder.stdout.on('data', (chunk) => { if (String(chunk).includes('held')) resolve() }))
        expect(existsSync(lockfilePath)).toBe(true)

        const startedAt = Date.now()
        let ranAt = null
        await withProjectWriteLock({ spacesDir, spaceId: SPACE, projectId: PROJECT, log: quietLog }, async () => { ranAt = Date.now() })

        // Measured from when the holder said it held the lock: it ran only
        // after most of the hold had passed (the holder's own startup ate a
        // little of it), and not on top of the other process.
        expect(ranAt - startedAt).toBeGreaterThanOrEqual(holdMs - 300)
        await new Promise((resolve) => (holder.exitCode !== null ? resolve() : holder.once('exit', resolve)))
        expect(existsSync(lockfilePath)).toBe(false)
    }, 15_000)
})

// A project move renames the project's own directory, and the cross-process lock
// is a file inside it — so a move holds only the in-process half. What must stay
// true is that it still queues with THIS server's own writes to the same project
// (the one thing the old single in-process lock gave the move route), and that
// it leaves no lock file in the directory it is about to rename.
describe('a move holds the in-process lock only, and still queues with the writes', () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 40))

    it('waits for a write that holds the project, and a write waits for it', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT)
        const lockOpts = { spacesDir, spaceId: SPACE, projectId: PROJECT, log: quietLog }

        // A write is inside its lock: a move of the same project queues behind it.
        const order = []
        let letGo
        const held = new Promise((resolve) => { letGo = resolve })
        const write = withProjectWriteLock(lockOpts, async () => { order.push('write:start'); await held; order.push('write:end') })
        await tick()
        const move = withProjectInProcessLock(PROJECT, async () => { order.push('move') })
        await tick()
        expect(order).toEqual(['write:start'])
        letGo()
        await Promise.all([write, move])
        expect(order).toEqual(['write:start', 'write:end', 'move'])

        // And the other way round: a write queues behind a move in progress.
        const back = []
        let letGoMove
        const heldMove = new Promise((resolve) => { letGoMove = resolve })
        const moving = withProjectInProcessLock(PROJECT, async () => { back.push('move:start'); await heldMove; back.push('move:end') })
        await tick()
        const writing = withProjectWriteLock(lockOpts, async () => { back.push('write') })
        await tick()
        expect(back).toEqual(['move:start'])
        letGoMove()
        await Promise.all([moving, writing])
        expect(back).toEqual(['move:start', 'move:end', 'write'])
    })

    it('leaves no lock file inside the project directory the move renames, and does not hold up another project', async () => {
        const spacesDir = await makeSpacesDir()
        await store.ensureProject(spacesDir, SPACE, PROJECT)
        await store.ensureProject(spacesDir, SPACE, 'other')
        const { documentPath } = store.getProjectPaths(spacesDir, SPACE, PROJECT)
        let otherRan = false
        await withProjectInProcessLock(PROJECT, async () => {
            expect(existsSync(`${documentPath}.lock`)).toBe(false)
            await withProjectInProcessLock('other', async () => { otherRan = true })
        })
        expect(otherRan).toBe(true)
    })
})
