import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveAssetEntries } from './sceneArchive.js'

const obj = (id) => ({ type: 'model', assetRef: { id } })

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('resolveAssetEntries', () => {
    it('prefers a local blob and records the primary source url', async () => {
        const blob = { size: 10 }
        const entries = await resolveAssetEntries([obj('a1')], {
            getAssetBlob: async () => blob,
            getAssetSourceUrl: () => '/api/projects/p/assets/a1'
        })
        expect(entries).toEqual([
            { meta: { id: 'a1' }, blob, source: 'local', sourceUrl: '/api/projects/p/assets/a1' }
        ])
    })

    it('falls back to a later candidate url when the primary 404s', async () => {
        const remoteBlob = { size: 99 }
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url.includes('/api/projects/')) return { ok: false, status: 404 }
            return { ok: true, blob: async () => remoteBlob }
        }))
        const onMissingAsset = vi.fn()
        const entries = await resolveAssetEntries([obj('a1')], {
            getAssetBlob: async () => null,
            getAssetSourceUrl: () => '/api/projects/p/assets/a1',
            getAssetSourceUrls: () => ['/api/spaces/s/assets/a1'],
            onMissingAsset
        })
        expect(entries).toEqual([
            { meta: { id: 'a1' }, blob: remoteBlob, source: 'remote', sourceUrl: '/api/spaces/s/assets/a1' }
        ])
        expect(onMissingAsset).not.toHaveBeenCalled()
    })

    it('reports an asset as missing when no source resolves', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
        const onMissingAsset = vi.fn()
        const entries = await resolveAssetEntries([obj('a1')], {
            getAssetBlob: async () => null,
            getAssetSourceUrl: () => '/api/projects/p/assets/a1',
            getAssetSourceUrls: () => ['/api/spaces/s/assets/a1'],
            onMissingAsset
        })
        expect(entries).toEqual([])
        expect(onMissingAsset).toHaveBeenCalledWith({ id: 'a1' })
    })
})
