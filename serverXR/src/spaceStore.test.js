// @vitest-environment node

import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb, getDb } = require('./db.js')

let store
let tmpDir

beforeEach(() => {
    initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacestore-'))
    store = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] } })
})

afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('spaceStore kind', () => {
    it('defaults a new space to kind "normal"', async () => {
        const meta = await store.upsertSpaceMeta('alpha', { label: 'Alpha' })
        expect(meta.kind).toBe('normal')
        expect((await store.loadSpaceMeta('alpha')).kind).toBe('normal')
    })

    it('round-trips an explicit kind and rejects unknown values', async () => {
        await store.upsertSpaceMeta('hub', { kind: 'global' })
        expect((await store.loadSpaceMeta('hub')).kind).toBe('global')

        await store.upsertSpaceMeta('box', { kind: 'sandbox' })
        expect((await store.loadSpaceMeta('box')).kind).toBe('sandbox')

        await store.upsertSpaceMeta('weird', { kind: 'bogus' })
        expect((await store.loadSpaceMeta('weird')).kind).toBe('normal')
    })

    it('updates kind without disturbing other fields', async () => {
        await store.upsertSpaceMeta('s', { label: 'S', isPublic: true })
        const updated = await store.upsertSpaceMeta('s', { kind: 'global' })
        expect(updated.kind).toBe('global')
        expect(updated.label).toBe('S')
        expect(updated.isPublic).toBe(true)
    })

    it('never reaps a non-permanent global space', async () => {
        const reapingStore = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] }, defaultTtlMs: 1 })
        await reapingStore.upsertSpaceMeta('keep', { kind: 'global', permanent: false, touch: false })
        await reapingStore.upsertSpaceMeta('drop', { kind: 'sandbox', permanent: false, touch: false })
        await new Promise((r) => setTimeout(r, 5))
        await reapingStore.pruneSpaces()
        expect(await reapingStore.loadSpaceMeta('keep')).not.toBeNull()
        expect(await reapingStore.loadSpaceMeta('drop')).toBeNull()
    })

    it('reaps idle sandboxes on the shorter sandbox TTL while normal spaces of the same age survive', async () => {
        const reapingStore = createSpaceStore({
            spacesDir: tmpDir,
            blankScene: { objects: [] },
            defaultTtlMs: 1000 * 60 * 60,
            sandboxTtlMs: 1
        })
        await reapingStore.upsertSpaceMeta('regular', { kind: 'normal', permanent: false, touch: false })
        await reapingStore.upsertSpaceMeta('sandbox-idle', { kind: 'sandbox', permanent: false, touch: false })
        await new Promise((r) => setTimeout(r, 5))
        await reapingStore.pruneSpaces()
        expect(await reapingStore.loadSpaceMeta('regular')).not.toBeNull()
        expect(await reapingStore.loadSpaceMeta('sandbox-idle')).toBeNull()
    })
})

describe('spaceStore moveSpace', () => {
    it('re-homes the row, its children, and the directory under the new id', async () => {
        await store.upsertSpaceMeta('sandbox-guest1', { kind: 'sandbox', label: 'Guest Sandbox', sceneVersion: 3 })
        await store.ensureSpaceScene('sandbox-guest1')
        await store.writeOpsHistory('sandbox-guest1', [{ opId: 'op1', version: 3, type: 'noop', payload: {} }])
        fs.writeFileSync(path.join(tmpDir, 'sandbox-guest1', 'assets', 'blob.bin'), 'bytes')

        const moved = await store.moveSpace('sandbox-guest1', 'sandbox-account', { label: 'Sandbox', permanent: true })

        expect(moved).toMatchObject({ id: 'sandbox-account', label: 'Sandbox', permanent: true, kind: 'sandbox', sceneVersion: 3 })
        expect(await store.loadSpaceMeta('sandbox-guest1')).toBeNull()
        expect(await store.readOpsHistory('sandbox-account')).toHaveLength(1)
        expect(fs.existsSync(path.join(tmpDir, 'sandbox-account', 'assets', 'blob.bin'))).toBe(true)
        expect(fs.existsSync(path.join(tmpDir, 'sandbox-guest1'))).toBe(false)
    })

    it('refuses to move onto an existing space and no-ops on missing sources', async () => {
        await store.upsertSpaceMeta('a', { label: 'A' })
        await store.upsertSpaceMeta('b', { label: 'B' })
        await expect(store.moveSpace('a', 'b')).rejects.toThrow(/already exists/)
        expect(await store.moveSpace('missing', 'anywhere')).toBeNull()
    })
})

describe('spaceStore archiveIdleAccountSandboxes', () => {
    const insertProject = (id, spaceId) => {
        const now = Date.now()
        getDb().prepare(
            'INSERT INTO projects (id, space_id, title, document_version, source, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)'
        ).run(id, spaceId, 'P', 'studio-v3', now, now, now)
    }

    it('folds an idle account sandbox into a scene snapshot; guests and project-holders are skipped', async () => {
        const archivingStore = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] }, accountSandboxTtlMs: 1 })
        await archivingStore.upsertSpaceMeta('sandbox-idle-user', { kind: 'sandbox', permanent: true, sceneVersion: 2 })
        await archivingStore.ensureSpaceScene('sandbox-idle-user')
        fs.writeFileSync(path.join(tmpDir, 'sandbox-idle-user', 'scene.json'), JSON.stringify({ objects: [{ id: 'kept-thing' }] }))
        await archivingStore.upsertSpaceMeta('sandbox-with-work', { kind: 'sandbox', permanent: true, sceneVersion: 1 })
        insertProject('proj-1', 'sandbox-with-work')
        await archivingStore.upsertSpaceMeta('sandbox-guestx', { kind: 'sandbox', permanent: false, sceneVersion: 1 })
        await new Promise((r) => setTimeout(r, 5))

        const archived = await archivingStore.archiveIdleAccountSandboxes()

        expect(archived).toEqual(['sandbox-idle-user'])
        expect(await archivingStore.loadSpaceMeta('sandbox-idle-user')).toBeNull()
        const snapshot = await archivingStore.readLatestSpaceSnapshot('sandbox-idle-user')
        expect(snapshot?.scene?.objects?.[0]?.id).toBe('kept-thing')
        expect(await archivingStore.loadSpaceMeta('sandbox-with-work')).not.toBeNull()
        expect(await archivingStore.loadSpaceMeta('sandbox-guestx')).not.toBeNull()
    })

    it('deletes never-touched empty sandboxes without writing a snapshot and leaves fresh ones alone', async () => {
        const archivingStore = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] }, accountSandboxTtlMs: 1 })
        await archivingStore.upsertSpaceMeta('sandbox-empty', { kind: 'sandbox', permanent: true, sceneVersion: 0 })
        await new Promise((r) => setTimeout(r, 5))
        expect(await archivingStore.archiveIdleAccountSandboxes()).toEqual(['sandbox-empty'])
        expect(await archivingStore.readLatestSpaceSnapshot('sandbox-empty')).toBeNull()

        const patientStore = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] }, accountSandboxTtlMs: 1000 * 60 * 60 })
        await patientStore.upsertSpaceMeta('sandbox-fresh', { kind: 'sandbox', permanent: true, sceneVersion: 1 })
        expect(await patientStore.archiveIdleAccountSandboxes()).toEqual([])
        expect(await patientStore.loadSpaceMeta('sandbox-fresh')).not.toBeNull()

        const disabledStore = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] } })
        expect(await disabledStore.archiveIdleAccountSandboxes()).toEqual([])
    })
})

// Regression tests for the 2026-07-17 perf audit: GET /ops?since= used to
// read+parse the ENTIRE retained op history and filter by version in JS.
// readOpsHistorySince pushes that filter into SQL via the existing
// (space_id, version) index instead.
describe('spaceStore readOpsHistorySince', () => {
    it('returns only ops with version > since, in the same order as readOpsHistory', async () => {
        await store.upsertSpaceMeta('alpha', {})
        await store.writeOpsHistory('alpha', [
            { opId: 'op1', version: 1, type: 'noop', payload: {} },
            { opId: 'op2', version: 2, type: 'noop', payload: {} },
            { opId: 'op3', version: 3, type: 'noop', payload: {} },
            { opId: 'op4', version: 4, type: 'noop', payload: {} }
        ])

        const since2 = await store.readOpsHistorySince('alpha', 2)
        expect(since2.map((op) => op.opId)).toEqual(['op3', 'op4'])

        const full = await store.readOpsHistory('alpha')
        const filteredInJs = full.filter((op) => (op.version || 0) > 2)
        expect(since2).toEqual(filteredInJs)
    })

    it('returns an empty array when since is at or past the latest version', async () => {
        await store.upsertSpaceMeta('beta', {})
        await store.writeOpsHistory('beta', [{ opId: 'op1', version: 1, type: 'noop', payload: {} }])
        expect(await store.readOpsHistorySince('beta', 1)).toEqual([])
        expect(await store.readOpsHistorySince('beta', 99)).toEqual([])
    })

    it('does not leak another space\'s ops', async () => {
        await store.upsertSpaceMeta('gamma-a', {})
        await store.upsertSpaceMeta('gamma-b', {})
        await store.writeOpsHistory('gamma-a', [{ opId: 'a1', version: 1, type: 'noop', payload: {} }])
        await store.writeOpsHistory('gamma-b', [{ opId: 'b1', version: 1, type: 'noop', payload: {} }])
        expect((await store.readOpsHistorySince('gamma-a', 0)).map((op) => op.opId)).toEqual(['a1'])
        expect((await store.readOpsHistorySince('gamma-b', 0)).map((op) => op.opId)).toEqual(['b1'])
    })
})
