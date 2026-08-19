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

    // Regression test for audit batch 2 (silent HTML-fallback class): a restore
    // payload carrying a stored server-relative `/api/…` url gets the 200 SPA
    // shell on prod. Those HTML bytes used to be written into local asset
    // storage under the asset id — the restore counted it as completed and the
    // asset rendered as a broken texture with no error anywhere.
    it('does not store a 200 text/html response as the asset blob', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            headers: { get: () => 'text/html; charset=utf-8' },
            blob: async () => new Blob(['<!doctype html>'], { type: 'text/html' })
        })

        const { result } = renderHook(() => useAssetRestore({
            setAssetRestoreProgress: vi.fn()
        }))

        const { fallbackAssets } = await result.current.restoreAssetsFromPayload([
            { id: 'asset-2', name: 'photo.png', mimeType: 'image/png', url: '/api/projects/p/assets/asset-2' }
        ])

        expect(saveAssetBlobMock).not.toHaveBeenCalled()
        expect(fallbackAssets).toEqual([])
    })

    it('still stores a real asset response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            headers: { get: () => 'image/png' },
            blob: async () => new Blob(['png'], { type: 'image/png' })
        })

        const { result } = renderHook(() => useAssetRestore({
            setAssetRestoreProgress: vi.fn()
        }))

        await result.current.restoreAssetsFromPayload([
            { id: 'asset-3', name: 'photo.png', mimeType: 'image/png', url: '/api/projects/p/assets/asset-3' }
        ])

        expect(saveAssetBlobMock).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ id: 'asset-3' }))
    })
})
