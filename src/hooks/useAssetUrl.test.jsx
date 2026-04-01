import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssetUrl } from './useAssetUrl.js'

const { getAssetBlobMock, getAssetSourceUrlMock, streamRemoteAssetMock } = vi.hoisted(() => ({
    getAssetBlobMock: vi.fn(),
    getAssetSourceUrlMock: vi.fn(),
    streamRemoteAssetMock: vi.fn()
}))

vi.mock('../storage/assetStore.js', () => ({
    getAssetBlob: getAssetBlobMock
}))

vi.mock('../services/assetSources.js', () => ({
    getAssetSourceUrl: getAssetSourceUrlMock,
    streamRemoteAsset: streamRemoteAssetMock
}))

describe('useAssetUrl', () => {
    beforeEach(() => {
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
})
