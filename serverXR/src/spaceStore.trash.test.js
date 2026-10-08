// @vitest-environment node

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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacetrash-'))
    store = createSpaceStore({ spacesDir: tmpDir, defaultSpaceId: 'main', blankScene: { objects: [] } })
})

afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

const seed = async (id, titles = []) => {
    await store.upsertSpaceMeta(id, { label: id })
    for (const title of titles) {
        await projectStore.ensureProject(tmpDir, id, title.toLowerCase(), { title })
    }
}

describe('space trash (store)', () => {
    it('trashSpace hides the space and its projects; restoreSpace brings back only what went with it', async () => {
        await seed('alpha', ['One', 'Two', 'Old'])
        await projectStore.deleteProject(tmpDir, 'alpha', 'old')
        const receipt = await store.trashSpace('alpha')
        expect(receipt.projects).toBe(2)
        expect(await store.spaceExists('alpha')).toBe(false)
        expect(await store.loadSpaceMeta('alpha')).toBeNull()
        expect((await store.listSpaces()).map((s) => s.id)).not.toContain('alpha')
        expect(await projectStore.listProjectsInSpace(tmpDir, 'alpha')).toEqual([])
        const trashed = await store.listTrashedSpaces()
        expect(trashed).toHaveLength(1)
        expect(trashed[0]).toMatchObject({ id: 'alpha', projectCount: 2 })

        const back = await store.restoreSpace('alpha')
        expect(back.projects).toBe(2)
        expect(await store.spaceExists('alpha')).toBe(true)
        expect((await projectStore.listProjectsInSpace(tmpDir, 'alpha')).map((p) => p.id).sort()).toEqual(['one', 'two'])
        expect((await projectStore.listTrashedProjects()).map((p) => p.id)).toEqual(['old'])
    })

    it('refuses permanent, global, sandbox and the front room', async () => {
        await store.upsertSpaceMeta('keep', { permanent: true })
        await store.upsertSpaceMeta('shared', { kind: 'global' })
        await store.upsertSpaceMeta('box', { kind: 'sandbox' })
        await store.upsertSpaceMeta('main', {})
        for (const id of ['keep', 'shared', 'box', 'main']) {
            await expect(store.trashSpace(id)).rejects.toMatchObject({ code: 'space_protected' })
            expect(await store.spaceExists(id)).toBe(true)
        }
    })

    it('a trashed id cannot be written over (it would cascade away the trashed projects)', async () => {
        await seed('alpha', ['One'])
        await store.trashSpace('alpha')
        await expect(store.upsertSpaceMeta('alpha', { label: 'again' })).rejects.toMatchObject({ code: 'space_in_trash' })
        await expect(store.saveSpaceMeta('alpha', { label: 'again' })).rejects.toMatchObject({ code: 'space_in_trash' })
    })

    it('the sweep removes only spaces past the 30-day hold, and the 30 days are the projects\' own', async () => {
        expect(store.SPACE_TRASH_TTL_MS).toBe(projectStore.TRASH_TTL_MS)
        await seed('old-one', ['A'])
        await seed('fresh', ['B'])
        await store.trashSpace('old-one')
        await store.trashSpace('fresh')
        getDb().prepare('UPDATE spaces SET deleted_at = ? WHERE id = ?').run(Date.now() - store.SPACE_TRASH_TTL_MS - 1000, 'old-one')
        expect(await store.purgeSpaceTrash()).toEqual(['old-one'])
        expect((await store.listTrashedSpaces()).map((s) => s.id)).toEqual(['fresh'])
        expect(getDb().prepare("SELECT COUNT(*) AS n FROM projects WHERE space_id = 'old-one'").get().n).toBe(0)
    })

    it('purgeTrashedSpace refuses a live space', async () => {
        await seed('alpha')
        expect(await store.purgeTrashedSpace('alpha')).toBe(false)
        expect(await store.spaceExists('alpha')).toBe(true)
    })

    it('a trashed space does not count against the owner quota or the idle sweep', async () => {
        await store.upsertSpaceMeta('mine', { ownerUserId: 'u1' })
        expect(store.countSpacesOwnedBy('u1')).toBe(1)
        await store.trashSpace('mine')
        expect(store.countSpacesOwnedBy('u1')).toBe(0)
    })

    it('spaceFootprint counts live projects and the bytes on disk', async () => {
        await seed('alpha', ['One'])
        const { spaceDir } = store.getSpacePaths('alpha')
        fs.mkdirSync(spaceDir, { recursive: true })
        fs.writeFileSync(path.join(spaceDir, 'blob.bin'), Buffer.alloc(1234))
        const f = await store.spaceFootprint('alpha')
        expect(f.projects).toBe(1)
        expect(f.bytes).toBeGreaterThanOrEqual(1234)
    })
})
