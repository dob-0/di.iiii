// @vitest-environment node

// A scene write that a crash at any point leaves whole (sceneWrite.js).
//
// Each crash test kills a real child process (SIGKILL: no cleanup runs) at one
// step of a scene write, then "restarts" here: opens the same di.db and data
// folder fresh, runs the startup heal and recovery index.js runs, and checks
// that the scene reads, the scene, the ops and the version agree, and the
// next write lands. Real SQLite file, real files, real lock.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const { createSpaceStore } = require('./spaceStore.js')
const { createSceneWriter } = require('./sceneWrite.js')
const lockfile = require('proper-lockfile')

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'testSupport', 'sceneWriteCrashChild.cjs')
const SPACE = 'room'
const tempDirs = []
const quietLog = () => {
    const lines = { warn: [], error: [] }
    return { lines, info() {}, warn: (line) => lines.warn.push(line), error: (line) => lines.error.push(line) }
}

// The smallest stale time proper-lockfile allows (it clamps to 2000 ms), so a
// lock left by a killed child is taken over in two seconds, not ten.
const STALE = 2000

const open = (dataDir, { log = quietLog(), hooks = {} } = {}) => {
    initDb(path.join(dataDir, 'di.db'))
    const store = createSpaceStore({ spacesDir: path.join(dataDir, 'spaces'), blankScene: { objects: [] } })
    const writer = createSceneWriter({ getSpacePaths: store.getSpacePaths, commitSceneOps: store.commitSceneOps, readSceneVersion: store.readSceneVersion, log, stale: STALE, hooks })
    return { store, writer, log }
}

// What index.js does at startup, in the same order.
const restart = async (dataDir) => {
    closeDb()
    const opened = open(dataDir)
    const healed = opened.store.healOrphanSpaceOps({ log: opened.log })
    const recovered = await opened.writer.recoverAllStagedScenes([SPACE])
    return { ...opened, healed, recovered }
}

const addOp = (version, id) => ({ opId: id, type: 'addObject', payload: { object: { id, type: 'box' } }, version, timestamp: Date.now() })

// A scene write as the route makes one: read the scene, apply, commit.
const write = (writer, store, baseVersion, id) => writer.withSceneWriteLock(SPACE, async () => {
    const scene = JSON.parse(readFileSync(store.getSpacePaths(SPACE).scenePath, 'utf8'))
    return writer.commitSceneWrite({ spaceId: SPACE, baseVersion, ops: [addOp(baseVersion + 1, id)], scene: { objects: [...scene.objects, { id, type: 'box' }] } })
})

// Space `room` at version 1 with object `one`, written through the writer.
const seed = async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'dii-scene-write-'))
    tempDirs.push(dataDir)
    const { store, writer } = open(dataDir)
    await store.upsertSpaceMeta(SPACE, { label: SPACE, permanent: true })
    await store.ensureSpaceScene(SPACE)
    expect(await write(writer, store, 0, 'one')).toEqual({ ok: true, nextVersion: 1 })
    closeDb()
    return dataDir
}

const crashChild = (dataDir, step) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--no-warnings', CHILD, dataDir, step], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal, out }))
})

const sceneIds = (store) => JSON.parse(readFileSync(store.getSpacePaths(SPACE).scenePath, 'utf8')).objects.map(object => object.id)
const versionOf = () => getDb().prepare('SELECT scene_version AS v FROM spaces WHERE id = ?').get(SPACE).v
const opVersions = () => getDb().prepare('SELECT version FROM space_ops WHERE space_id = ? ORDER BY version').all(SPACE).map(row => row.version)
const leftovers = async (store) => (await readdir(store.getSpacePaths(SPACE).spaceDir)).filter(name => /\.pending$|\.tmp$/.test(name))

afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('a scene write killed at each step', () => {
    // What the version must be after the restart, and so what the scene holds.
    const cases = [
        ['afterStage', 1, ['one']],          // staged, never committed
        ['insideCommit', 1, ['one']],        // ops + version written, COMMIT never ran
        ['afterCommit', 2, ['one', 'two']],  // committed, scene not yet in place
        ['afterRename', 2, ['one', 'two']]   // in place, directory not yet flushed
    ]

    for (const [step, version, objects] of cases) {
        it(`${step}: after a restart the scene reads at v${version}, and the next write lands`, async () => {
            const dataDir = await seed()
            const crash = await crashChild(dataDir, step)
            expect(crash.signal, crash.out).toBe('SIGKILL')

            const { store, writer, log } = await restart(dataDir)
            expect(versionOf()).toBe(version)
            expect(opVersions()).toEqual(version === 2 ? [1, 2] : [1])
            expect(sceneIds(store)).toEqual(objects)
            expect(await leftovers(store)).toEqual([])
            if (step === 'afterCommit') expect(log.lines.warn.join('\n')).toMatch(/room: a stopped write left scene v2 — it was committed, so it is now in place/)
            if (step === 'afterStage') expect(log.lines.warn.join('\n')).toMatch(/room: a stopped write left scene v2 — it was never committed, so it was removed/)

            const next = await write(writer, store, version, 'next')
            expect(next).toEqual({ ok: true, nextVersion: version + 1 })
            expect(versionOf()).toBe(version + 1)
            expect(opVersions().at(-1)).toBe(version + 1)
            expect(sceneIds(store)).toEqual([...objects, 'next'])
        })
    }
})

describe('what the old three-step write left behind', () => {
    it('ops above the version: healed at startup into space_ops_quarantine, said in the log, and the next write lands', async () => {
        const dataDir = await seed()
        initDb(path.join(dataDir, 'di.db'))
        getDb().prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run(SPACE, 2, JSON.stringify(addOp(2, 'stray')), Date.now())

        const { store, writer, healed, log } = await restart(dataDir)
        expect(healed).toEqual([expect.objectContaining({ spaceId: SPACE, sceneVersion: 1, moved: 1, from: 2, to: 2 })])
        expect(log.lines.warn.join('\n')).toMatch(/room: 1 op\(s\) v2–v2 were above the version its scene stands at \(v1\) — moved to space_ops_quarantine/)
        const quarantined = store.listQuarantinedSceneOps(SPACE)
        expect(quarantined).toHaveLength(1)
        expect(JSON.parse(quarantined[0].data).opId).toBe('stray')
        expect(await write(writer, store, 1, 'next')).toEqual({ ok: true, nextVersion: 2 })
    })

    it('ops above the version, met by a write before any restart heal: the write sets them aside and lands', async () => {
        const dataDir = await seed()
        const { store, writer, log } = open(dataDir)
        getDb().prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
            .run(SPACE, 2, JSON.stringify(addOp(2, 'stray')), Date.now())
        expect(await write(writer, store, 1, 'next')).toEqual({ ok: true, nextVersion: 2 })
        expect(store.listQuarantinedSceneOps(SPACE).map(row => row.version)).toEqual([2])
        expect(log.lines.warn.join('\n')).toMatch(/moved to space_ops_quarantine before this write/)
    })
})

describe('the guards around one write', () => {
    it('a write based on an old version is a conflict, and writes neither the scene, the ops nor a pending file', async () => {
        const dataDir = await seed()
        const { store, writer } = open(dataDir)
        expect(await write(writer, store, 0, 'late')).toEqual({ conflict: true, latestVersion: 1 })
        expect(versionOf()).toBe(1)
        expect(opVersions()).toEqual([1])
        expect(sceneIds(store)).toEqual(['one'])
        expect(await leftovers(store)).toEqual([])
    })

    it('a committed pending scene that does not parse is never put in place: scene.json is kept and the file is kept beside it', async () => {
        const dataDir = await seed()
        const { store } = open(dataDir)
        getDb().prepare('UPDATE spaces SET scene_version = 2 WHERE id = ?').run(SPACE)
        const spaceDir = store.getSpacePaths(SPACE).spaceDir
        await writeFile(path.join(spaceDir, 'scene.json.v2.pending'), '')

        const { store: after, log } = await restart(dataDir)
        expect(sceneIds(after)).toEqual(['one'])
        expect(log.lines.error.join('\n')).toMatch(/room: a stopped write left scene v2 committed but unreadable — scene.json kept as it was/)
        const names = await readdir(spaceDir)
        expect(names.some(name => /^scene\.json\.v2\.pending\.unreadable-\d+$/.test(name))).toBe(true)
        expect(names).not.toContain('scene.json.v2.pending')
    })

    it('waits while another holder has the scene lock, and runs once it lets go', async () => {
        const dataDir = await seed()
        const { store, writer } = open(dataDir)
        const scenePath = store.getSpacePaths(SPACE).scenePath
        const release = await lockfile.lock(scenePath, { realpath: false, lockfilePath: `${scenePath}.lock`, stale: STALE })
        expect(existsSync(`${scenePath}.lock`)).toBe(true)
        let landed = false
        const pending = write(writer, store, 1, 'after-lock').then((result) => { landed = true; return result })
        await new Promise(resolve => setTimeout(resolve, 300))
        expect(landed).toBe(false)
        await release()
        expect(await pending).toEqual({ ok: true, nextVersion: 2 })
    })
})
