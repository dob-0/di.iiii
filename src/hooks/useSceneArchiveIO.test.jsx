import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneArchiveIO } from './useSceneArchiveIO.js'
import { DEFAULT_RENDER_SETTINGS } from './useRenderSettings.js'
import { defaultGridAppearance, defaultScene, SCENE_DATA_VERSION } from '../state/sceneStore.js'

const { createSceneArchiveMock, loadSceneArchiveMock, clearAllAssetsMock } = vi.hoisted(() => ({
    createSceneArchiveMock: vi.fn(),
    loadSceneArchiveMock: vi.fn(),
    clearAllAssetsMock: vi.fn()
}))

vi.mock('../services/sceneArchive.js', () => ({
    createSceneArchive: createSceneArchiveMock,
    loadSceneArchive: loadSceneArchiveMock
}))

vi.mock('../storage/assetStore.js', () => ({
    clearAllAssets: clearAllAssetsMock
}))

const createProps = (overrides = {}) => ({
    fileInputRef: { current: { click: vi.fn() } },
    spaceId: 'main',
    setRemoteSceneVersion: vi.fn(),
    resetRemoteAssets: vi.fn(),
    getBaseSceneData: vi.fn(() => ({
        version: SCENE_DATA_VERSION,
        objects: [],
        assets: [],
        backgroundColor: defaultScene.backgroundColor,
        gridSize: defaultScene.gridSize,
        gridAppearance: defaultGridAppearance,
        transformSnaps: defaultScene.transformSnaps,
        ambientLight: defaultScene.ambientLight,
        directionalLight: defaultScene.directionalLight,
        default3DView: defaultScene.default3DView,
        renderSettings: DEFAULT_RENDER_SETTINGS
    })),
    getSavedViewData: vi.fn(() => defaultScene.savedView),
    persistSceneDataWithStatus: vi.fn(() => true),
    updateSceneSignature: vi.fn(),
    getAssetBlob: vi.fn().mockResolvedValue(null),
    getAssetSourceUrl: vi.fn(() => null),
    resetAssetStoreQuotaState: vi.fn(),
    restoreAssetsFromPayload: vi.fn().mockResolvedValue({ fallbackAssets: [] }),
    setRemoteAssetsManifest: vi.fn(),
    setObjects: vi.fn(),
    setBackgroundColor: vi.fn(),
    setGridSize: vi.fn(),
    setGridAppearance: vi.fn(),
    setRenderSettings: vi.fn(),
    setTransformSnaps: vi.fn(),
    setIsGridVisible: vi.fn(),
    setIsGizmoVisible: vi.fn(),
    setIsPerfVisible: vi.fn(),
    setPresentation: vi.fn(),
    setAmbientLight: vi.fn(),
    setDirectionalLight: vi.fn(),
    setDefault3DView: vi.fn(),
    setCameraPosition: vi.fn(),
    setCameraTarget: vi.fn(),
    clearSelection: vi.fn(),
    defaultGridAppearance,
    defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
    ...overrides
})

const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL
const originalFileReader = globalThis.FileReader

class MockFileReader {
    readAsArrayBuffer() {
        this.onload?.({ target: { result: new ArrayBuffer(8) } })
    }
}

describe('useSceneArchiveIO', () => {
    beforeEach(() => {
        createSceneArchiveMock.mockReset()
        loadSceneArchiveMock.mockReset()
        clearAllAssetsMock.mockReset()
        clearAllAssetsMock.mockResolvedValue()
        Object.defineProperty(URL, 'createObjectURL', {
            writable: true,
            value: vi.fn(() => 'blob:archive')
        })
        Object.defineProperty(URL, 'revokeObjectURL', {
            writable: true,
            value: vi.fn()
        })
    })

    afterEach(() => {
        Object.defineProperty(URL, 'createObjectURL', {
            writable: true,
            value: originalCreateObjectUrl
        })
        Object.defineProperty(URL, 'revokeObjectURL', {
            writable: true,
            value: originalRevokeObjectUrl
        })
        if (originalFileReader) {
            globalThis.FileReader = originalFileReader
        } else {
            delete globalThis.FileReader
        }
        vi.restoreAllMocks()
    })

    it('exports project archives without clearing remote asset sources first', async () => {
        let remoteSourcesAvailable = true
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        createSceneArchiveMock.mockImplementation(async (_sceneData, { getAssetSourceUrl }) => {
            expect(getAssetSourceUrl('asset-remote')).toBe('/serverXR/api/spaces/main/assets/asset-remote')
            return new Blob(['archive'], { type: 'application/zip' })
        })

        const props = createProps({
            resetRemoteAssets: vi.fn(() => {
                remoteSourcesAvailable = false
            }),
            getBaseSceneData: vi.fn(() => ({
                version: SCENE_DATA_VERSION,
                objects: [{
                    id: 'object-1',
                    type: 'image',
                    assetRef: {
                        id: 'asset-remote',
                        name: 'poster.png',
                        mimeType: 'image/png'
                    }
                }],
                assets: [{
                    id: 'asset-remote',
                    name: 'poster.png',
                    mimeType: 'image/png'
                }],
                assetsBaseUrl: '/serverXR/api/spaces/main/assets',
                backgroundColor: defaultScene.backgroundColor,
                gridSize: defaultScene.gridSize,
                gridAppearance: defaultGridAppearance,
                transformSnaps: defaultScene.transformSnaps,
                ambientLight: defaultScene.ambientLight,
                directionalLight: defaultScene.directionalLight,
                default3DView: defaultScene.default3DView,
                renderSettings: DEFAULT_RENDER_SETTINGS,
                defaultSceneVersion: 'server-scene-v1'
            })),
            getAssetSourceUrl: vi.fn((assetId) => (
                remoteSourcesAvailable
                    ? `/serverXR/api/spaces/main/assets/${assetId}`
                    : null
            ))
        })

        const { result } = renderHook(() => useSceneArchiveIO(props))

        await act(async () => {
            await result.current.handleSave()
        })

        expect(props.resetRemoteAssets).not.toHaveBeenCalled()
        expect(props.setRemoteSceneVersion).not.toHaveBeenCalled()
        expect(props.persistSceneDataWithStatus).toHaveBeenCalledWith(expect.objectContaining({
            assets: [expect.objectContaining({ id: 'asset-remote' })],
            assetsBaseUrl: '/serverXR/api/spaces/main/assets',
            defaultSceneVersion: null
        }), 'Saved locally (project export)')
    })

    it('persists transform snaps when importing a project archive', async () => {
        globalThis.FileReader = MockFileReader
        loadSceneArchiveMock.mockImplementation(async (_arrayBuffer, applyLoadedScene) => {
            await applyLoadedScene({
                version: SCENE_DATA_VERSION,
                objects: [],
                assets: [],
                backgroundColor: '#101010',
                gridSize: 42,
                gridAppearance: defaultGridAppearance,
                transformSnaps: {
                    translation: 0.5,
                    rotation: 30,
                    scale: 0.25
                },
                ambientLight: defaultScene.ambientLight,
                directionalLight: defaultScene.directionalLight,
                default3DView: defaultScene.default3DView,
                savedView: defaultScene.savedView,
                renderSettings: DEFAULT_RENDER_SETTINGS
            }, vi.fn().mockResolvedValue(null), { silent: true })
        })

        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const props = createProps()
        const { result } = renderHook(() => useSceneArchiveIO(props))
        const event = {
            target: {
                files: [new File(['zip'], 'scene.dii-project.zip', { type: 'application/zip' })],
                value: 'picked-file'
            }
        }

        await act(async () => {
            result.current.handleFileLoad(event)
        })

        await waitFor(() => {
            expect(props.persistSceneDataWithStatus).toHaveBeenCalledWith(expect.objectContaining({
                transformSnaps: {
                    translation: 0.5,
                    rotation: 30,
                    scale: 0.25
                }
            }), 'Loaded project locally')
        })

        expect(props.setTransformSnaps).toHaveBeenCalledWith({
            translation: 0.5,
            rotation: 30,
            scale: 0.25
        })
        expect(alertSpy).not.toHaveBeenCalledWith('Project package loaded successfully!')
    })
})
