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
})
