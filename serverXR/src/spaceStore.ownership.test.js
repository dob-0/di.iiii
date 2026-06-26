// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb } = require('./db.js')

const tempDirs = []
const makeStore = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-space-owner-'))
    tempDirs.push(dir)
    return createSpaceStore({ spacesDir: dir, blankScene: { objects: [] } })
}

beforeEach(() => { initDb(':memory:') })
afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('spaceStore ownership + quota counting', () => {
    it('persists ownerUserId and counts only owned spaces', async () => {
        const store = await makeStore()
        await store.saveSpaceMeta('alpha', store.buildMeta('alpha', { ownerUserId: 'u1' }))
        await store.saveSpaceMeta('beta', store.buildMeta('beta', { ownerUserId: 'u1' }))
        await store.saveSpaceMeta('gamma', store.buildMeta('gamma', { ownerUserId: 'u2' }))
        await store.saveSpaceMeta('orphan', store.buildMeta('orphan')) // no owner

        expect((await store.loadSpaceMeta('alpha')).ownerUserId).toBe('u1')
        expect(store.countSpacesOwnedBy('u1')).toBe(2)
        expect(store.countSpacesOwnedBy('u2')).toBe(1)
        expect(store.countSpacesOwnedBy('nobody')).toBe(0)
        expect(store.countSpacesOwnedBy(null)).toBe(0)
    })

    it('preserves ownerUserId across metadata updates', async () => {
        const store = await makeStore()
        await store.saveSpaceMeta('alpha', store.buildMeta('alpha', { ownerUserId: 'u1' }))
        await store.upsertSpaceMeta('alpha', { label: 'Renamed', isPublic: true })
        const meta = await store.loadSpaceMeta('alpha')
        expect(meta.label).toBe('Renamed')
        expect(meta.isPublic).toBe(true)
        expect(meta.ownerUserId).toBe('u1')
        expect(store.countSpacesOwnedBy('u1')).toBe(1)
    })
})
