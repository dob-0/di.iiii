// @vitest-environment node

// Saving a space's meta again must update the row in place. The spaces row is
// the parent of projects, op logs, shelves, links, invites and domains (all
// ON DELETE CASCADE, foreign_keys ON), so anything that deletes and re-inserts
// it takes all of them along. SQLite: "REPLACE" deletes the conflicting row
// first (sqlite.org/lang_conflict.html); the UPSERT clause updates it
// (sqlite.org/lang_upsert.html).

import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb, getDb } = require('./db.js')
const projectStore = require('./projectStore.js')

let store
let tmpDir

beforeEach(() => {
    initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemeta-'))
    store = createSpaceStore({ spacesDir: tmpDir, defaultSpaceId: 'main', blankScene: { objects: [] } })
})

afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

const count = (sql, ...args) => getDb().prepare(sql).get(...args).cnt

const seedSpaceWithChildren = async (id) => {
    await store.saveSpaceMeta(id, store.buildMeta(id, { label: 'First', ownerUserId: 'u1' }))
    await projectStore.ensureProject(tmpDir, id, 'one', { title: 'One' })
    await projectStore.appendProjectOps(tmpDir, id, 'one', [{ opId: 'op-1', type: 'noop', payload: {} }])
    const now = Date.now()
    getDb().prepare('INSERT INTO collections (id, space_id, label, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`${id}-shelf`, id, 'Week 1', 0, now, now)
    getDb().prepare('INSERT INTO space_ops (space_id, version, data, created_at) VALUES (?, ?, ?, ?)')
        .run(id, 1, '{}', now)
}

const childCounts = (id) => ({
    projects: count('SELECT COUNT(*) AS cnt FROM projects WHERE space_id = ?', id),
    projectOps: count("SELECT COUNT(*) AS cnt FROM project_ops WHERE project_id = 'one'"),
    shelves: count('SELECT COUNT(*) AS cnt FROM collections WHERE space_id = ?', id),
    spaceOps: count('SELECT COUNT(*) AS cnt FROM space_ops WHERE space_id = ?', id),
})

describe('saveSpaceMeta on an existing space', () => {
    it('keeps the space\'s projects, op logs and shelves', async () => {
        await seedSpaceWithChildren('alpha')
        const before = childCounts('alpha')
        expect(before).toEqual({ projects: 1, projectOps: 1, shelves: 1, spaceOps: 1 })

        await store.saveSpaceMeta('alpha', store.buildMeta('alpha', { label: 'Second', ownerUserId: 'u1' }))

        expect(childCounts('alpha')).toEqual(before)
        expect(await store.loadSpaceMeta('alpha')).toMatchObject({ label: 'Second', ownerUserId: 'u1' })
    })

    it('keeps the columns it does not write (created, archived, position)', async () => {
        await store.saveSpaceMeta('alpha', store.buildMeta('alpha', { label: 'First' }))
        getDb().prepare('UPDATE spaces SET created_at = 1000, archived_at = 2000, position = 7 WHERE id = ?').run('alpha')

        await store.saveSpaceMeta('alpha', store.buildMeta('alpha', { label: 'Second' }))

        const row = getDb().prepare('SELECT created_at, archived_at, position, label FROM spaces WHERE id = ?').get('alpha')
        expect(row).toEqual({ created_at: 1000, archived_at: 2000, position: 7, label: 'Second' })
    })

    it('refuses a slug another space holds, and leaves that space whole', async () => {
        await seedSpaceWithChildren('alpha')
        getDb().prepare("UPDATE spaces SET slug = 'gallery' WHERE id = 'alpha'").run()
        const before = childCounts('alpha')

        await expect(store.saveSpaceMeta('beta', store.buildMeta('beta', { slug: 'gallery' }))).rejects.toThrow(/UNIQUE/)

        expect(await store.spaceExists('alpha')).toBe(true)
        expect(childCounts('alpha')).toEqual(before)
        expect(await store.spaceExists('beta')).toBe(false)
    })

    it('still creates a new space', async () => {
        await store.saveSpaceMeta('fresh', store.buildMeta('fresh', { label: 'Fresh', ownerUserId: 'u2' }))
        expect(await store.loadSpaceMeta('fresh')).toMatchObject({ id: 'fresh', label: 'Fresh', ownerUserId: 'u2' })
    })
})
