import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useAssetRestore } from './useAssetRestore.js'

const saveAssetBlobMock = vi.fn()

vi.mock('../storage/assetStore.js', () => ({
    saveAssetBlob: (...args) => saveAssetBlobMock(...args),
    dataUrlToBlob: vi.fn(),
    blobToDataUrl: vi.fn(),
    hasAssetStoreQuotaExceeded: vi.fn(() => false),
    resetAssetStoreQuotaExceeded: vi.fn()
}))

vi.mock('../services/assetSources.js', () => ({
    registerAssetSources: vi.fn(),
    clearAssetSources: vi.fn(),
    setAssetSource: vi.fn()
}))

describe('useAssetRestore', () => {
    beforeEach(() => {
        saveAssetBlobMock.mockReset()
        saveAssetBlobMock.mockResolvedValue(undefined)
        vi.restoreAllMocks()
    })

    it('uses the provided blob loader for remote url assets', async () => {
        const blobLoader = vi.fn().mockResolvedValue(new Blob(['ok'], { type: 'image/webp' }))
        const fetchSpy = vi.spyOn(globalThis, 'fetch')

        const { result } = renderHook(() => useAssetRestore({
            setAssetRestoreProgress: vi.fn()
        }))

        await result.current.restoreAssetsFromPayload([
            {
                id: 'asset-1',
                name: 'legacy.webp',
                mimeType: 'image/webp',
                url: 'https://di-studio.xyz/serverXR/api/spaces/platform_recordAR/assets/asset-1'
            }
        ], blobLoader)

        expect(blobLoader).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-1' }))
        expect(saveAssetBlobMock).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ id: 'asset-1' }))
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})
