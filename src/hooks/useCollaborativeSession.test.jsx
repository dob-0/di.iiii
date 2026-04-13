import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useCollaborativeSession } from './useCollaborativeSession.js'

const useRealtimeCollaborationMock = vi.fn()
const useLiveSyncMock = vi.fn()

vi.mock('./useRealtimeCollaboration.js', () => ({
    useRealtimeCollaboration: (...args) => useRealtimeCollaborationMock(...args)
}))

vi.mock('./useLiveSync.js', () => ({
    useLiveSync: (...args) => useLiveSyncMock(...args)
}))

describe('useCollaborativeSession', () => {
    beforeEach(() => {
        useRealtimeCollaborationMock.mockReset()
        useLiveSyncMock.mockReset()
        useRealtimeCollaborationMock.mockReturnValue({
            broadcastCursor: vi.fn(),
            isSocketConnected: true,
            collaborators: [],
            usersInSpace: [],
            participantRoster: [],
            remoteCursorMarkers: [],
            socketEmit: null
        })
        useLiveSyncMock.mockReturnValue({
            isSceneStreamConnected: false,
            sceneStreamState: 'idle',
            sceneStreamError: null
        })
    })

    it('does not broadcast cursors while pointer dragging is active', () => {
        const broadcastCursor = vi.fn()
        useRealtimeCollaborationMock.mockReturnValue({
            broadcastCursor,
            isSocketConnected: true,
            collaborators: [],
            usersInSpace: [],
            participantRoster: [],
            remoteCursorMarkers: [],
            socketEmit: null
        })

        const { result } = renderHook(() => useCollaborativeSession({
            enabled: true,
            isLoading: false,
            canAccessServerSpaces: true,
            isOfflineMode: false,
            isLiveSyncEnabled: true,
            isPointerDragging: true,
            spaceId: 'main',
            supportsServerSpaces: true,
            buildSpaceApiUrl: vi.fn(),
            getServerSceneOps: vi.fn(),
            getServerScene: vi.fn(),
            submitSceneOps: vi.fn(),
            objects: [],
            backgroundColor: '#000000',
            gridSize: 20,
            gridAppearance: {},
            renderSettings: {},
            ambientLight: {},
            directionalLight: {},
            transformSnaps: {},
            default3DView: {},
            applyRemoteScene: vi.fn(),
            applyScenePatch: vi.fn(),
            setSceneVersion: vi.fn(),
            sceneVersionRef: { current: 0 },
            setObjects: vi.fn(),
            setBackgroundColor: vi.fn(),
            setGridSize: vi.fn(),
            setGridAppearance: vi.fn(),
            setRenderSettings: vi.fn(),
            setTransformSnaps: vi.fn(),
            setAmbientLight: vi.fn(),
            setDirectionalLight: vi.fn(),
            setDefault3DView: vi.fn(),
            defaultGridAppearance: {}
        }))

        act(() => {
            result.current.handleCanvasPointerMove({
                currentTarget: {
                    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 200 })
                },
                clientX: 60,
                clientY: 120,
                buttons: 0
            })
        })

        expect(broadcastCursor).not.toHaveBeenCalled()
    })

    it('normalizes pointer coordinates when the pointer is idle', () => {
        const broadcastCursor = vi.fn()
        useRealtimeCollaborationMock.mockReturnValue({
            broadcastCursor,
            isSocketConnected: true,
            collaborators: [],
            usersInSpace: [],
            participantRoster: [],
            remoteCursorMarkers: [],
            socketEmit: null
        })

        const { result } = renderHook(() => useCollaborativeSession({
            enabled: true,
            isLoading: false,
            canAccessServerSpaces: true,
            isOfflineMode: false,
            isLiveSyncEnabled: true,
            isPointerDragging: false,
            spaceId: 'main',
            supportsServerSpaces: true,
            buildSpaceApiUrl: vi.fn(),
            getServerSceneOps: vi.fn(),
            getServerScene: vi.fn(),
            submitSceneOps: vi.fn(),
            objects: [],
            backgroundColor: '#000000',
            gridSize: 20,
            gridAppearance: {},
            renderSettings: {},
            ambientLight: {},
            directionalLight: {},
            transformSnaps: {},
            default3DView: {},
            applyRemoteScene: vi.fn(),
            applyScenePatch: vi.fn(),
            setSceneVersion: vi.fn(),
            sceneVersionRef: { current: 0 },
            setObjects: vi.fn(),
            setBackgroundColor: vi.fn(),
            setGridSize: vi.fn(),
            setGridAppearance: vi.fn(),
            setRenderSettings: vi.fn(),
            setTransformSnaps: vi.fn(),
            setAmbientLight: vi.fn(),
            setDirectionalLight: vi.fn(),
            setDefault3DView: vi.fn(),
            defaultGridAppearance: {}
        }))

        act(() => {
            result.current.handleCanvasPointerMove({
                currentTarget: {
                    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 200 })
                },
                clientX: 60,
                clientY: 120,
                buttons: 0
            })
        })

        expect(broadcastCursor).toHaveBeenCalledWith({ x: 0.5, y: 0.5 })
    })
})
