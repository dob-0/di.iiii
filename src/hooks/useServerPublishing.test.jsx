import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerPublishing } from './useServerPublishing.js'

const createProps = (overrides = {}) => ({
    canPublishToServer: true,
    canUploadServerAssets: true,
    spaceId: 'recordar-platform',
    serverAssetBaseUrl: '/serverXR/api/spaces/recordar-platform/assets',
    objects: [{
        id: 'object-1',
        type: 'image',
        assetRef: {
            id: 'asset-1',
            name: 'poster.webp',
            mimeType: 'image/webp'
        }
    }],
    getAssetBlob: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/webp' })),
    getAssetSourceUrl: vi.fn().mockReturnValue('/serverXR/api/spaces/recordar-platform/assets/asset-1'),
    // Shape matches what useAssetPipeline's uploadAssetToServer actually
    // resolves to — an asset entry keyed `id`, not `assetId`. The stub said
    // `assetId` and nothing noticed, because the result was thrown away.
    uploadAssetToServer: vi.fn().mockResolvedValue({
        id: 'asset-1',
        name: 'poster.webp',
        mimeType: 'image/webp',
        size: 5,
        url: '/serverXR/api/spaces/recordar-platform/assets/asset-1'
    }),
    setServerAssetSyncProgress: vi.fn(),
    markServerSync: vi.fn(),
    applyRemoteScene: vi.fn(),
    getServerScene: vi.fn(),
    submitSceneOps: vi.fn(),
    getBaseSceneData: vi.fn(),
    getSavedViewData: vi.fn(),
    setOfflineMode: vi.fn(),
    sceneVersionRef: { current: 0 },
    setSceneVersion: vi.fn(),
    liveClientIdRef: { current: 'client-a' },
    ...overrides
})

describe('useServerPublishing', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('uploads the asset when the current server copy is missing', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            headers: {
                get: () => 'text/html'
            }
        })
        vi.stubGlobal('fetch', fetchMock)
        const props = createProps()

        const { result } = renderHook(() => useServerPublishing(props))

        await result.current.syncAssetsForPublish()

        expect(fetchMock).toHaveBeenCalledWith('/serverXR/api/spaces/recordar-platform/assets/asset-1', {
            method: 'HEAD',
            cache: 'no-store'
        })
        expect(props.uploadAssetToServer).toHaveBeenCalledTimes(1)
        expect(props.uploadAssetToServer).toHaveBeenCalledWith(expect.objectContaining({
            assetId: 'asset-1',
            name: 'poster.webp',
            mimeType: 'image/webp',
            trackPending: false
        }))
    })

    it('refuses to publish when an upload resolves without an asset entry', async () => {
        // uploadAssetToServer returns null on its guard clause (no spaceId, no
        // file) WITHOUT throwing. syncAssetsForPublish used to ignore the
        // result entirely, so a wholly failed asset sync still ended in
        // "Scene synced to server." — publish must fail instead.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            headers: { get: () => 'text/html' }
        }))
        const props = createProps({
            uploadAssetToServer: vi.fn().mockResolvedValue(null)
        })
        const { result } = renderHook(() => useServerPublishing(props))

        await expect(result.current.syncAssetsForPublish()).rejects.toThrow(/did not upload/)
    })

    it('skips re-uploading when the current server copy is already available', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: {
                get: () => 'image/webp'
            }
        })
        vi.stubGlobal('fetch', fetchMock)
        const props = createProps()

        const { result } = renderHook(() => useServerPublishing(props))

        await result.current.syncAssetsForPublish()

        expect(props.uploadAssetToServer).not.toHaveBeenCalled()
    })

    it('fails when an asset cannot be resolved from storage or a source URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            headers: {
                get: () => 'text/html'
            }
        })
        vi.stubGlobal('fetch', fetchMock)
        const props = createProps({
            getAssetBlob: vi.fn().mockResolvedValue(null)
        })

        const { result } = renderHook(() => useServerPublishing(props))

        await expect(result.current.syncAssetsForPublish()).rejects.toThrow(
            'Some assets are missing and cannot be published: poster.webp.'
        )
        expect(props.uploadAssetToServer).not.toHaveBeenCalled()
    })
})
