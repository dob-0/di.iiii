import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssetPipeline } from './useAssetPipeline.js'

const { saveAssetFromFileMock, uploadServerAssetMock } = vi.hoisted(() => ({
    saveAssetFromFileMock: vi.fn(),
    uploadServerAssetMock: vi.fn()
}))

vi.mock('../storage/assetStore.js', () => ({
    saveAssetFromFile: saveAssetFromFileMock
}))

vi.mock('../services/serverSpaces.js', () => ({
    uploadServerAsset: uploadServerAssetMock
}))

describe('useAssetPipeline', () => {
    beforeEach(() => {
        saveAssetFromFileMock.mockReset()
        uploadServerAssetMock.mockReset()
        vi.restoreAllMocks()
    })

    it('does not create a shared media object when the server upload fails', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const handleAddObject = vi.fn()

        uploadServerAssetMock.mockRejectedValue(new Error('Network down'))

        const { result } = renderHook(() => useAssetPipeline({
            handleAddObject,
            setObjects: vi.fn(),
            canUploadServerAssets: true,
            spaceId: 'main',
            serverAssetBaseUrl: 'http://localhost:4000/serverXR/api/spaces/main/assets',
            upsertRemoteAssetEntry: vi.fn()
        }))

        const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' })

        await act(async () => {
            await result.current.handleAssetFilesUpload([file])
        })

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalled()
        })

        expect(uploadServerAssetMock).toHaveBeenCalledTimes(1)
        expect(saveAssetFromFileMock).not.toHaveBeenCalled()
        expect(handleAddObject).not.toHaveBeenCalled()
        expect(alertSpy.mock.calls[0][0]).toContain('Shared asset upload failed.')
    })
})
