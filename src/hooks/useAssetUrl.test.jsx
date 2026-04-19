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

    it('loads restored archive blobs before same-origin /assets fallbacks', async () => {
        const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:archive-video')
        const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
        getAssetSourceUrlMock.mockReturnValue('/assets/video-archive')
        getAssetBlobMock.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' }))

        const { result } = renderHook(() => useAssetUrl(
            { id: 'video-archive', mimeType: 'video/mp4', name: 'clip.mp4' },
            { preferRemoteSource: true }
        ))

        await waitFor(() => {
            expect(result.current).toBe('blob:archive-video')
        })

        expect(getAssetBlobMock).toHaveBeenCalledWith('video-archive')
        expect(streamRemoteAssetMock).not.toHaveBeenCalled()

        createObjectUrlSpy.mockRestore()
        revokeObjectUrlSpy.mockRestore()
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

    it('accepts generic cached blobs when the asset name reveals a playable media type', async () => {
        const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:generic-video')
        const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
        getAssetBlobMock.mockResolvedValue(new Blob(['video'], { type: 'application/octet-stream' }))

        const { result } = renderHook(() => useAssetUrl(
            { id: 'video-generic', mimeType: 'application/octet-stream', name: 'clip.mp4' }
        ))

        await waitFor(() => {
            expect(result.current).toBe('blob:generic-video')
        })

        const normalizedBlob = createObjectUrlSpy.mock.calls[0][0]
        expect(normalizedBlob.type).toBe('video/mp4')
        expect(deleteAssetMock).not.toHaveBeenCalled()

        createObjectUrlSpy.mockRestore()
        revokeObjectUrlSpy.mockRestore()
    })

    it('uses direct asset urls when no registered source exists', async () => {
        getAssetSourceUrlMock.mockReturnValue(null)
        getAssetBlobMock.mockResolvedValue(null)
        streamRemoteAssetMock.mockRejectedValue(new Error('not registered'))

        const { result } = renderHook(() => useAssetUrl(
            {
                id: 'project-video',
                mimeType: 'application/octet-stream',
                name: 'clip.mp4',
                url: '/serverXR/api/projects/project-1/assets/project-video'
            },
            { preferRemoteSource: true }
        ))

        await waitFor(() => {
            expect(result.current).toBe('/serverXR/api/projects/project-1/assets/project-video')
        })

        expect(getAssetBlobMock).not.toHaveBeenCalled()
        expect(streamRemoteAssetMock).not.toHaveBeenCalled()
    })

    it('uses direct asset urls even when an asset id is not present', async () => {
        const { result } = renderHook(() => useAssetUrl(
            {
                mimeType: 'image/webp',
                name: 'poster.webp',
                url: 'https://cdn.example.test/poster.webp'
            },
            { preferRemoteSource: true }
        ))

        await waitFor(() => {
            expect(result.current).toBe('https://cdn.example.test/poster.webp')
        })

        expect(getAssetBlobMock).not.toHaveBeenCalled()
        expect(streamRemoteAssetMock).not.toHaveBeenCalled()
    })
})
