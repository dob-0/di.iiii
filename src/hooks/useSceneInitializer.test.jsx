import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSceneInitializer } from './useSceneInitializer.js'
import { DEFAULT_RENDER_SETTINGS } from './useRenderSettings.js'
import { defaultScene, SCENE_DATA_VERSION } from '../state/sceneStore.js'

const DEFAULT_GRID_APPEARANCE = {
    cellSize: 0.75,
    cellThickness: 0.75,
    sectionSize: 6,
    sectionThickness: 1.2,
    fadeDistance: 100,
    fadeStrength: 0.1,
    offset: 0.015
}

const createProps = () => ({
    sceneStorageKey: 'scene:test',
    spaceId: 'main',
    canPublishToServer: false,
    isOfflineMode: false,
    preferServerScene: false,
    forceServerAssetsBase: false,
    skipServerLoadRef: { current: false },
    serverAssetBaseUrl: '',
    applyRemoteScene: vi.fn(),
    markServerSync: vi.fn(),
    resetRemoteAssets: vi.fn(),
    setRemoteSceneVersion: vi.fn(),
    setRemoteAssetsManifest: vi.fn(),
    persistSceneDataWithStatus: vi.fn(),
    updateSceneSignature: vi.fn(),
    setObjects: vi.fn(),
    setBackgroundColor: vi.fn(),
    setGridSize: vi.fn(),
    setGridAppearance: vi.fn(),
    setRenderSettings: vi.fn(),
    setTransformSnaps: vi.fn(),
    setIsGridVisible: vi.fn(),
    setIsGizmoVisible: vi.fn(),
    setIsPerfVisible: vi.fn(),
    setAmbientLight: vi.fn(),
    setDirectionalLight: vi.fn(),
    setDefault3DView: vi.fn(),
    setCameraPosition: vi.fn(),
    setCameraTarget: vi.fn(),
    setSceneVersion: vi.fn(),
    getServerScene: vi.fn(),
    defaultGridAppearance: DEFAULT_GRID_APPEARANCE,
    defaultRenderSettings: DEFAULT_RENDER_SETTINGS,
    defaultSceneRemoteBase: ''
})

afterEach(() => {
    window.localStorage.clear()
})

describe('useSceneInitializer', () => {
    it('restores render settings from persisted local scene data', async () => {
        const savedRenderSettings = {
            ...DEFAULT_RENDER_SETTINGS,
            shadows: false,
            antialias: false,
            toneMapping: 'None',
            toneMappingExposure: 1.5,
            dpr: 1
        }
        window.localStorage.setItem('scene:test', JSON.stringify({
            version: SCENE_DATA_VERSION,
            sceneVersion: 7,
            objects: [],
            backgroundColor: defaultScene.backgroundColor,
            gridSize: defaultScene.gridSize,
            gridAppearance: DEFAULT_GRID_APPEARANCE,
            transformSnaps: defaultScene.transformSnaps,
            isGridVisible: defaultScene.isGridVisible,
            isGizmoVisible: defaultScene.isGizmoVisible,
            isPerfVisible: defaultScene.isPerfVisible,
            ambientLight: defaultScene.ambientLight,
            directionalLight: defaultScene.directionalLight,
            default3DView: defaultScene.default3DView,
            savedView: defaultScene.savedView,
            renderSettings: savedRenderSettings
        }))
        const props = createProps()

        const { result } = renderHook(() => useSceneInitializer(props))

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })
        expect(props.setRenderSettings).toHaveBeenCalledWith(savedRenderSettings)
    })

    it('forces the server asset base for persisted server-backed scenes', async () => {
        const assets = [{ id: 'asset-1', mimeType: 'image/png', name: 'photo.png' }]
        window.localStorage.setItem('scene:test', JSON.stringify({
            version: SCENE_DATA_VERSION,
            sceneVersion: 7,
            objects: [],
            assets,
            assetsBaseUrl: '/default-scene',
            backgroundColor: defaultScene.backgroundColor,
            gridSize: defaultScene.gridSize,
            gridAppearance: DEFAULT_GRID_APPEARANCE,
            transformSnaps: defaultScene.transformSnaps,
            isGridVisible: defaultScene.isGridVisible,
            isGizmoVisible: defaultScene.isGizmoVisible,
            isPerfVisible: defaultScene.isPerfVisible,
            ambientLight: defaultScene.ambientLight,
            directionalLight: defaultScene.directionalLight,
            default3DView: defaultScene.default3DView,
            savedView: defaultScene.savedView,
            renderSettings: DEFAULT_RENDER_SETTINGS
        }))
        const props = {
            ...createProps(),
            forceServerAssetsBase: true,
            serverAssetBaseUrl: '/serverXR/api/spaces/main/assets'
        }

        const { result } = renderHook(() => useSceneInitializer(props))

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(props.setRemoteAssetsManifest).toHaveBeenCalledWith(assets, '/serverXR/api/spaces/main/assets')
    })
})
