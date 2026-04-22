import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAppSceneSyncState } from './useAppSceneSyncState.js'

const useAppSyncSessionStateMock = vi.fn()

vi.mock('./useAppSyncSessionState.js', () => ({
    useAppSyncSessionState: (...args) => useAppSyncSessionStateMock(...args)
}))

function createProps(overrides = {}) {
    const noop = vi.fn()
    return {
        liveSyncFeatureEnabled: true,
        sceneStorageKey: 'scene:gallery',
        spaceId: 'gallery',
        canAccessServerSpaces: true,
        isOfflineMode: false,
        isLiveSyncEnabled: true,
        isPointerDragging: false,
        buildSpaceApiUrl: noop,
        serverAssetBaseUrl: '/serverXR/assets',
        supportsServerSpaces: true,
        getServerScene: noop,
        getServerSceneOps: noop,
        submitSceneOps: noop,
        sceneSettings: {
            setBackgroundColor: noop,
            setGridSize: noop,
            setGridAppearance: noop,
            setTransformSnaps: noop,
            setAmbientLight: noop,
            setDirectionalLight: noop,
            setCameraPosition: noop,
            setCameraTarget: noop
        },
        objects: [],
        renderSettings: {},
        setRenderSettings: noop,
        presentation: {},
        setPresentation: noop,
        sceneVersion: 7,
        setSceneVersion: noop,
        persistSceneDataWithStatus: noop,
        markServerSync: noop,
        setAssetRestoreProgress: noop,
        setRemoteAssetsManifest: noop,
        resetRemoteAssets: noop,
        resetAssetStoreQuotaState: noop,
        restoreAssetsFromPayload: noop,
        clearSelection: noop,
        getAssetUrlCandidates: noop,
        getAssetSourceUrl: noop,
        defaultGridAppearance: {},
        defaultRenderSettings: {},
        defaultSceneRemoteBase: '',
        legacySceneRemoteBase: '',
        setObjects: noop,
        setIsGridVisible: noop,
        setIsGizmoVisible: noop,
        setIsPerfVisible: noop,
        ...overrides
    }
}

describe('useAppSceneSyncState', () => {
    it('owns sync refs and remote version state while delegating session work', () => {
        useAppSyncSessionStateMock.mockReturnValue({
            updateSceneSignature: vi.fn(),
            applyRemoteScene: vi.fn(),
            isLoading: false,
            liveClientIdRef: { current: 'client-1' },
            displayName: 'Tester',
            setDisplayName: vi.fn(),
            effectiveDisplayName: 'Tester',
            isSocketConnected: true,
            collaborators: [],
            usersInSpace: [],
            participantRoster: [],
            remoteCursorMarkers: [],
            handleCanvasPointerMove: vi.fn(),
            handleCanvasPointerLeave: vi.fn(),
            socketEmit: vi.fn(),
            isSceneStreamConnected: true,
            sceneStreamState: 'connected',
            sceneStreamError: ''
        })

        const props = createProps()
        const { result } = renderHook(() => useAppSceneSyncState(props))

        const sessionArgs = useAppSyncSessionStateMock.mock.calls[0][0]
        expect(sessionArgs.sceneVersion).toBe(7)
        expect(sessionArgs.sceneVersionRef.current).toBe(7)
        expect(sessionArgs.skipServerLoadRef.current).toBe(false)
        expect(typeof sessionArgs.setRemoteSceneVersion).toBe('function')
        expect(result.current.fileInputRef.current).toBeUndefined()
        expect(result.current.skipServerLoadRef.current).toBe(false)
        expect(result.current.remoteSceneVersion).toBeNull()
        expect(result.current.liveClientIdRef.current).toBe('client-1')

        act(() => {
            result.current.setRemoteSceneVersion(12)
        })

        expect(result.current.remoteSceneVersion).toBe(12)
    })
})
