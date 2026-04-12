import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssetUrl } from './useAssetUrl.js'

const { deleteAssetMock, getAssetBlobMock, getAssetSourceUrlMock, streamRemoteAssetMock } = vi.hoisted(() => ({
    deleteAssetMock: vi.fn(),
    getAssetBlobMock: vi.fn(),
    getAssetSourceUrlMock: vi.fn(),
    streamRemoteAssetMock: vi.fn()
}))

vi.mock('../storage/assetStore.js', () => ({
    deleteAsset: deleteAssetMock,
    getAssetBlob: getAssetBlobMock
}))

vi.mock('../services/assetSources.js', () => ({
    getAssetSourceUrl: getAssetSourceUrlMock,
    streamRemoteAsset: streamRemoteAssetMock
}))

describe('useAssetUrl', () => {
    beforeEach(() => {
        deleteAssetMock.mockReset()
        deleteAssetMock.mockResolvedValue(undefined)
        getAssetBlobMock.mockReset()
        getAssetSourceUrlMock.mockReset()
        streamRemoteAssetMock.mockReset()
    })

    it('prefers a remote URL for streaming video assets when available', async () => {
        getAssetSourceUrlMock.mockReturnValue('http://localhost:4000/serverXR/api/spaces/main/assets/video-1')

        const { result } = renderHook(() => useAssetUrl(
            { id: 'video-1', mimeType: 'video/mp4', name: 'clip.mp4' },
            { preferRemoteSource: true }
        ))

        await waitFor(() => {
            expect(result.current).toBe('http://localhost:4000/serverXR/api/spaces/main/assets/video-1')
        })

        expect(getAssetBlobMock).not.toHaveBeenCalled()
        expect(streamRemoteAssetMock).not.toHaveBeenCalled()
    })

    it('drops invalid cached html blobs and falls back to the remote asset stream', async () => {
        const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:asset-1')
        const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
        getAssetBlobMock.mockResolvedValue(new Blob(['<!doctype html>'], { type: 'text/html' }))
        streamRemoteAssetMock.mockResolvedValue(new Blob(['img'], { type: 'image/webp' }))

        const { result } = renderHook(() => useAssetUrl(
            { id: 'image-1', mimeType: 'image/webp', name: 'image.webp' }
        ))

        await waitFor(() => {
            expect(result.current).toBe('blob:asset-1')
        })

        expect(deleteAssetMock).toHaveBeenCalledWith('image-1')
        expect(streamRemoteAssetMock).toHaveBeenCalledWith('image-1')

        createObjectUrlSpy.mockRestore()
        revokeObjectUrlSpy.mockRestore()
    })
})
