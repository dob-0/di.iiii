// @vitest-environment node

import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    appendProjectOps,
    deleteProject,
    ensureProject,
    findProjectById,
    getProjectPaths,
    listTrashedProjects,
    loadProjectMeta,
    purgeTrash,
    restoreProject,
    readJson,
    readProjectDocument,
    readProjectIndex,
    readProjectOps,
    writeJson
} = require('./projectStore.js')
const { initDb, closeDb } = require('./db.js')

const tempDirs = []

const createSpacesDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-project-store-'))
    tempDirs.push(dir)
    return dir
}

beforeEach(() => {
    initDb(':memory:')
})

afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('projectStore', () => {
    it('creates a project and finds it by id', async () => {
        const spacesDir = await createSpacesDir()

        await ensureProject(spacesDir, 'main', 'alpha-project', { title: 'Alpha Project' })

        const resolved = await findProjectById(spacesDir, 'alpha-project')
        expect(resolved).toMatchObject({
            spaceId: 'main',
            projectId: 'alpha-project'
        })
        expect(resolved.meta.title).toBe('Alpha Project')
    })

    it('readProjectIndex returns a projectId→spaceId map from the DB', async () => {
        const spacesDir = await createSpacesDir()

        await ensureProject(spacesDir, 'main', 'alpha-project', { title: 'Alpha Project' })
        expect(await readProjectIndex(spacesDir)).toEqual({ 'alpha-project': 'main' })

        await deleteProject(spacesDir, 'main', 'alpha-project')
        expect(await readProjectIndex(spacesDir)).toEqual({})
    })

    it('findProjectById returns null for unknown projects', async () => {
        const spacesDir = await createSpacesDir()
        expect(await findProjectById(spacesDir, 'nonexistent')).toBeNull()
    })

    it('deleteProject puts the project in the trash — the row and the bytes both stay until purge', async () => {
        const spacesDir = await createSpacesDir()
        await ensureProject(spacesDir, 'gallery', 'delete-me', { title: 'Delete Me' })
        expect(await findProjectById(spacesDir, 'delete-me')).not.toBeNull()

        const receipt = await deleteProject(spacesDir, 'gallery', 'delete-me')
        // Gone from every ordinary lookup…
        expect(await findProjectById(spacesDir, 'delete-me')).toBeNull()
        expect(await loadProjectMeta(spacesDir, 'gallery', 'delete-me')).toBeNull()
        // …but the bytes are still on disk, and it says until when.
        const { documentPath } = getProjectPaths(spacesDir, 'gallery', 'delete-me')
        expect(existsSync(documentPath)).toBe(true)
        expect(receipt.restorableUntil).toBeGreaterThan(Date.now())

        // Brought back whole.
        const restored = await restoreProject('delete-me')
        expect(restored.title).toBe('Delete Me')
        expect(await findProjectById(spacesDir, 'delete-me')).not.toBeNull()
    })

    it('purgeTrash removes only what has waited out the hold, and then really removes it', async () => {
        const spacesDir = await createSpacesDir()
        await ensureProject(spacesDir, 'gallery', 'old-regret', { title: 'Old' })
        await ensureProject(spacesDir, 'gallery', 'fresh-regret', { title: 'Fresh' })
        await deleteProject(spacesDir, 'gallery', 'old-regret')
        await deleteProject(spacesDir, 'gallery', 'fresh-regret')

        // A day later: nothing is due yet, and nothing is touched.
        expect(await purgeTrash(spacesDir, { now: Date.now() + 24 * 60 * 60 * 1000 })).toEqual([])
        expect((await listTrashedProjects('gallery')).map(p => p.id).sort()).toEqual(['fresh-regret', 'old-regret'])

        // Thirty-one days later, only the one that waited that long goes.
        const purged = await purgeTrash(spacesDir, { now: Date.now() + 31 * 24 * 60 * 60 * 1000, ttlMs: 30 * 24 * 60 * 60 * 1000 })
        expect(purged.sort()).toEqual(['fresh-regret', 'old-regret'])
        const { projectDir } = getProjectPaths(spacesDir, 'gallery', 'old-regret')
        expect(existsSync(projectDir)).toBe(false)
        expect(await listTrashedProjects('gallery')).toEqual([])
    })

    it('readProjectDocument does not rewrite an already-normalized document', async () => {
        const spacesDir = await createSpacesDir()
        await ensureProject(spacesDir, 'main', 'stable-doc', { title: 'Stable' })
        const { documentPath } = getProjectPaths(spacesDir, 'main', 'stable-doc')

        await readProjectDocument(spacesDir, 'main', 'stable-doc')
        const before = (await stat(documentPath)).mtimeMs

        await new Promise((resolve) => setTimeout(resolve, 10))
        await readProjectDocument(spacesDir, 'main', 'stable-doc')
        const after = (await stat(documentPath)).mtimeMs

        expect(after).toBe(before)
    })

    it('readProjectDocument persists a self-heal correction back to disk', async () => {
        const spacesDir = await createSpacesDir()
        await ensureProject(spacesDir, 'main', 'stale-doc', { title: 'Stale' })
        const { documentPath } = getProjectPaths(spacesDir, 'main', 'stale-doc')

        // Simulate a document with an unrecognized entity type — the kind of
        // stale/malformed content normalizeEntity self-heals to 'box'. This
        // is a content-level correction, not a version bump, so it exercises
        // the general "existing differs from normalized" path, not just a
        // version-number fast path.
        const stale = await readJson(documentPath, null)
        stale.entities = [{ id: 'e1', type: 'not-a-real-type', components: {} }]
        await writeJson(documentPath, stale)

        const result = await readProjectDocument(spacesDir, 'main', 'stale-doc')
        expect(result.entities[0].type).toBe('box')

        const onDisk = await readJson(documentPath, null)
        expect(onDisk.entities[0].type).toBe('box')
    })

    // Retention used to be by count alone, so a dormant project kept its last
    // ops -- and every asset those ops mention -- forever, while a busy one
    // dropped the same history in days. On production that pinned 145 MB of
    // blobs the collector could otherwise have taken.
    it('trims ops past the age bound while keeping the count-based window intact', async () => {
        const spacesDir = await createSpacesDir()
        await ensureProject(spacesDir, 'main', 'aged-project', { title: 'Aged' })

        const DAY = 24 * 60 * 60 * 1000
        const now = Date.now()
        // timestamp is what lands in created_at, so the ages are explicit here.
        await appendProjectOps(spacesDir, 'main', 'aged-project', [
            { version: 1, opId: 'old-1', timestamp: now - 60 * DAY },
            { version: 2, opId: 'old-2', timestamp: now - 31 * DAY },
            { version: 3, opId: 'fresh-1', timestamp: now - 2 * DAY }
        ], 500, 30 * DAY)

        const kept = await readProjectOps(spacesDir, 'main', 'aged-project')
        expect(kept.map((op) => op.opId)).toEqual(['fresh-1'])
    })

    it('leaves every op in place when no age bound is given', async () => {
        const spacesDir = await createSpacesDir()
        await ensureProject(spacesDir, 'main', 'unbounded-project', { title: 'Unbounded' })

        const DAY = 24 * 60 * 60 * 1000
        const now = Date.now()
        await appendProjectOps(spacesDir, 'main', 'unbounded-project', [
            { version: 1, opId: 'ancient', timestamp: now - 400 * DAY },
            { version: 2, opId: 'recent', timestamp: now }
        ], 500)

        const kept = await readProjectOps(spacesDir, 'main', 'unbounded-project')
        expect(kept.map((op) => op.opId)).toEqual(['ancient', 'recent'])
    })
})
