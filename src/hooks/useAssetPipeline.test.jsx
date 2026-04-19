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

    it('uploads paired OBJ material files through the shared asset pipeline', async () => {
        const handleAddObject = vi.fn()
        const upsertRemoteAssetEntry = vi.fn()

        uploadServerAssetMock
            .mockResolvedValueOnce({
                assetId: 'remote-material',
                mimeType: 'text/plain',
                size: 12,
                url: '/serverXR/api/spaces/main/assets/remote-material'
            })
            .mockResolvedValueOnce({
                assetId: 'remote-model',
                mimeType: 'model/obj',
                size: 18,
                url: '/serverXR/api/spaces/main/assets/remote-model'
            })

        saveAssetFromFileMock.mockImplementation(async (file, options = {}) => ({
            id: options.id || `local-${file.name}`,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size || 0
        }))

        const { result } = renderHook(() => useAssetPipeline({
            handleAddObject,
            setObjects: vi.fn(),
            canUploadServerAssets: true,
            spaceId: 'main',
            serverAssetBaseUrl: 'http://localhost:4000/serverXR/api/spaces/main/assets',
            upsertRemoteAssetEntry
        }))

        const objFile = new File(['o chair'], 'chair.obj', { type: 'model/obj' })
        const mtlFile = new File(['newmtl chair'], 'chair.mtl', { type: 'text/plain' })

        await act(async () => {
            await result.current.handleAssetFilesUpload([objFile, mtlFile], { silent: true })
        })

        expect(uploadServerAssetMock).toHaveBeenCalledTimes(2)
        expect(saveAssetFromFileMock).toHaveBeenNthCalledWith(1, mtlFile, { id: 'remote-material' })
        expect(saveAssetFromFileMock).toHaveBeenNthCalledWith(2, objFile, { id: 'remote-model' })
        expect(handleAddObject).toHaveBeenCalledWith('model', expect.objectContaining({
            assetRef: expect.objectContaining({ id: 'remote-model', name: 'chair.obj' }),
            materialsAssetRef: expect.objectContaining({ id: 'remote-material', name: 'chair.mtl' })
        }))
        expect(upsertRemoteAssetEntry).toHaveBeenCalledTimes(2)
    })
})
