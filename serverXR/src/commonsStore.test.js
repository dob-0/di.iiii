// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const store = require('./commonsStore.js')
const { initDb, closeDb } = require('./db.js')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

const share = (overrides = {}) => store.shareAsset({
    assetId: 'a'.repeat(64),
    spaceId: 'main',
    name: 'statue.glb',
    mimeType: 'model/gltf-binary',
    size: 1234,
    sharedBy: 'user-1',
    sharedByLabel: 'dob',
    ...overrides
})

describe('commonsStore', () => {
    it('shares and reads back an asset', () => {
        const entry = share({ license: 'CC0' })
        expect(entry.assetId).toBe('a'.repeat(64))
        expect(entry.spaceId).toBe('main')
        expect(entry.name).toBe('statue.glb')
        expect(entry.license).toBe('CC0')
        expect(entry.sharedByLabel).toBe('dob')
        expect(store.getAsset('a'.repeat(64))).toEqual(entry)
    })

    it('same content hash shared again stays one entry (upsert)', () => {
        share()
        share({ spaceId: 'other', name: 'renamed.glb' })
        const all = store.listAssets()
        expect(all).toHaveLength(1)
        expect(all[0].spaceId).toBe('other')
        expect(all[0].name).toBe('renamed.glb')
    })

    it('unshare removes the entry', () => {
        share()
        expect(store.unshareAsset('a'.repeat(64))).toBe(true)
        expect(store.getAsset('a'.repeat(64))).toBeFalsy()
        expect(store.unshareAsset('a'.repeat(64))).toBe(false)
    })

    it('search filters by name', () => {
        share()
        share({ assetId: 'b'.repeat(64), name: 'texture.png' })
        expect(store.listAssets({ q: 'statue' })).toHaveLength(1)
        expect(store.listAssets({ q: 'nothing' })).toHaveLength(0)
        expect(store.listAssets()).toHaveLength(2)
    })

    it('getSharedIdSet marks only shared ids', () => {
        share()
        const set = store.getSharedIdSet(['a'.repeat(64), 'b'.repeat(64)])
        expect(set.has('a'.repeat(64))).toBe(true)
        expect(set.has('b'.repeat(64))).toBe(false)
        expect(store.getSharedIdSet([]).size).toBe(0)
    })
})
