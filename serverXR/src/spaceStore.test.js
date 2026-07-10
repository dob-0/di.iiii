// @vitest-environment node

import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb } = require('./db.js')

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
