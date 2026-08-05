import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssetPipeline } from './useAssetPipeline.js'
import { useServerPublishing } from './useServerPublishing.js'

const uploadServerAsset = vi.fn()

vi.mock('../services/serverSpaces.js', () => ({
    uploadServerAsset: (...args) => uploadServerAsset(...args),
    importDriveAssets: vi.fn(),
    importDriveSelection: vi.fn()
}))

const pipelineProps = {
    canUploadServerAssets: true,
    spaceId: 'recordar-platform',
    serverAssetBaseUrl: '/serverXR/api/spaces/recordar-platform/assets',
    upsertRemoteAssetEntry: vi.fn(),
    objects: []
}

describe('useAssetPipeline uploadAssetToServer', () => {
    beforeEach(() => {
        uploadServerAsset.mockReset()
        vi.unstubAllGlobals()
    })

    it('rejects when the upload throws, instead of resolving null', async () => {
        uploadServerAsset.mockRejectedValue(new Error('Network request failed'))
        const { result } = renderHook(() => useAssetPipeline(pipelineProps))

        await expect(result.current.uploadAssetToServer({
            file: new Blob(['image'], { type: 'image/webp' }),
            assetId: 'asset-1',
            name: 'poster.webp'
        })).rejects.toThrow('Asset upload failed for "poster.webp": Network request failed')
    })

    it('rejects when the server answers without an asset id', async () => {
        uploadServerAsset.mockResolvedValue({})
        const { result } = renderHook(() => useAssetPipeline(pipelineProps))

        await expect(result.current.uploadAssetToServer({
            file: new Blob(['image'], { type: 'image/webp' }),
            assetId: 'asset-1',
            name: 'poster.webp'
        })).rejects.toThrow('the server returned no asset id')
    })

    // The silent-fallback symptom this pair guards: syncAssetsForPublish ignores
    // the return value, so a null-on-failure upload let handlePublishToServer
    // reach "Scene synced to server." with nothing on the server.
    it('makes a failed publish-time asset sync reject rather than report success', async () => {
        uploadServerAsset.mockRejectedValue(new Error('Network request failed'))
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            headers: { get: () => 'text/html' }
        }))

        const { result } = renderHook(() => {
            const pipeline = useAssetPipeline(pipelineProps)
            return useServerPublishing({
                canPublishToServer: true,
                canUploadServerAssets: true,
                spaceId: 'recordar-platform',
                serverAssetBaseUrl: '/serverXR/api/spaces/recordar-platform/assets',
                objects: [{
                    id: 'object-1',
                    type: 'image',
                    assetRef: { id: 'asset-1', name: 'poster.webp', mimeType: 'image/webp' }
                }],
                getAssetBlob: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/webp' })),
                getAssetSourceUrl: vi.fn().mockReturnValue('/serverXR/api/spaces/recordar-platform/assets/asset-1'),
                uploadAssetToServer: pipeline.uploadAssetToServer,
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
                liveClientIdRef: { current: 'client-a' }
            })
        })

        await expect(result.current.syncAssetsForPublish()).rejects.toThrow(/Asset upload failed/)
    })
})
