import { renderHook, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useLiveSync } from './useLiveSync.js'
import { buildCollaborativeSceneSnapshot } from '../services/collaborativeSceneOps.js'

const connectMock = vi.fn()
const disconnectMock = vi.fn()

vi.mock('../services/sceneSyncService.js', () => ({
    createSceneSyncService: () => ({
        connect: connectMock,
        disconnect: disconnectMock
    })
}))

const createScene = (overrides = {}) => buildCollaborativeSceneSnapshot({
    objects: [],
    backgroundColor: '#f7f6ef',
    gridSize: 20,
    gridAppearance: {
        cellSize: 0.75,
        cellThickness: 0.75,
        sectionSize: 6,
        sectionThickness: 1.2,
        fadeDistance: 100,
        fadeStrength: 0.1,
        offset: 0.015
    },
    renderSettings: {
        dpr: [1, 2],
        shadows: true,
        antialias: true,
        toneMapping: 'ACESFilmic',
        toneMappingExposure: 1
    },
    ambientLight: { color: '#ffffff', intensity: 0.8 },
    directionalLight: { color: '#ffffff', intensity: 1, position: [10, 10, 5] },
    transformSnaps: { translation: 0.1, rotation: 15, scale: 0.1 },
    default3DView: { position: [0, 1.6, 4], target: [0, 1, 0] },
    ...overrides
})

const createBaseProps = (overrides = {}) => {
    const sceneVersionRef = { current: 0 }
    return {
        enabled: true,
        isLoading: false,
        isOfflineMode: false,
        isLiveSyncEnabled: true,
        spaceId: 'main',
        supportsServerSpaces: true,
        buildSpaceApiUrl: vi.fn(() => '/serverXR/api/spaces/main/events'),
        serverAssetBaseUrl: '/serverXR/api/spaces/main/assets',
        getServerSceneOps: vi.fn().mockResolvedValue({ ops: [], latestVersion: 0 }),
        getServerScene: vi.fn(),
        submitSceneOps: vi.fn().mockImplementation(async (_spaceId, _baseVersion, ops) => ({
            newVersion: sceneVersionRef.current + ops.length,
            ops
        })),
        sceneSnapshot: createScene(),
        applyRemoteScene: vi.fn(),
        applySceneState: vi.fn(),
        applyScenePatch: vi.fn(),
        setSceneVersion: vi.fn(),
        liveClientIdRef: { current: 'client-a' },
        sceneVersionRef,
        ...overrides
    }
}

describe('useLiveSync', () => {
    beforeEach(() => {
        connectMock.mockReset()
        disconnectMock.mockReset()
    })

    it('submits granular ops for local scene changes', async () => {
        const baseProps = createBaseProps()

        const { result } = renderHook(() => {
            const [sceneSnapshot, setSceneSnapshot] = useState(baseProps.sceneSnapshot)
            useLiveSync({
                ...baseProps,
                sceneSnapshot
            })
            return { sceneSnapshot, setSceneSnapshot }
        })

        act(() => {
            result.current.setSceneSnapshot(createScene({
                objects: [{
                    id: 'box-1',
                    type: 'box',
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1]
                }]
            }))
        })

        await waitFor(() => {
            expect(baseProps.submitSceneOps).toHaveBeenCalledTimes(1)
        })

        const [spaceId, baseVersion, ops] = baseProps.submitSceneOps.mock.calls[0]
        expect(spaceId).toBe('main')
        expect(baseVersion).toBe(0)
        expect(ops).toHaveLength(1)
        expect(ops[0]).toMatchObject({
            clientId: 'client-a',
            type: 'addObject'
        })
        expect(baseProps.setSceneVersion).toHaveBeenCalledWith(1)

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0))
        })

        expect(baseProps.submitSceneOps).toHaveBeenCalledTimes(1)
    })

    it('keeps the event stream subscribed while local scene state changes', async () => {
        const baseProps = createBaseProps()

        const { result } = renderHook(() => {
            const [sceneSnapshot, setSceneSnapshot] = useState(baseProps.sceneSnapshot)
            useLiveSync({
                ...baseProps,
                sceneSnapshot
            })
            return { setSceneSnapshot }
        })

        await waitFor(() => {
            expect(connectMock).toHaveBeenCalledTimes(1)
        })

        act(() => {
            result.current.setSceneSnapshot(createScene({
                objects: [{
                    id: 'sphere-1',
                    type: 'sphere',
                    position: [2, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1]
                }]
            }))
        })

        await waitFor(() => {
            expect(baseProps.submitSceneOps).toHaveBeenCalledTimes(1)
        })

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0))
        })

        expect(baseProps.submitSceneOps).toHaveBeenCalledTimes(1)
        expect(connectMock).toHaveBeenCalledTimes(1)
        expect(disconnectMock).not.toHaveBeenCalled()
    })

    it('applies incoming remote ops without re-submitting them', async () => {
        const baseProps = createBaseProps()
        let eventHandlers = null
        connectMock.mockImplementation((handlers) => {
            eventHandlers = handlers
        })

        renderHook(() => useLiveSync(baseProps))

        act(() => {
            eventHandlers.onPatch({
                version: 3,
                ops: [{
                    opId: 'remote-op-1',
                    clientId: 'client-b',
                    type: 'addObject',
                    payload: {
                        object: {
                            id: 'shared-box',
                            type: 'box',
                            position: [1, 0, 0],
                            rotation: [0, 0, 0],
                            scale: [1, 1, 1]
                        }
                    }
                }]
            })
        })

        await waitFor(() => {
            expect(baseProps.applySceneState).toHaveBeenCalledTimes(1)
        })

        expect(baseProps.submitSceneOps).not.toHaveBeenCalled()
        expect(baseProps.applySceneState.mock.calls[0][0].objects).toEqual([
            expect.objectContaining({ id: 'shared-box' })
        ])
        expect(baseProps.applySceneState.mock.calls[0][1]).toEqual({ serverVersion: 3 })
    })

    it('uses the server asset base when applying a full remote scene replacement', async () => {
        const baseProps = createBaseProps()
        let eventHandlers = null
        connectMock.mockImplementation((handlers) => {
            eventHandlers = handlers
        })

        renderHook(() => useLiveSync(baseProps))

        const replacementScene = {
            ...createScene(),
            assets: [{ id: 'asset-1', mimeType: 'image/png', name: 'photo.png' }]
        }

        act(() => {
            eventHandlers.onPatch({
                version: 4,
                ops: [{
                    opId: 'replace-1',
                    clientId: 'client-b',
                    type: 'replaceScene',
                    payload: {
                        scene: replacementScene
                    }
                }]
            })
        })

        await waitFor(() => {
            expect(baseProps.applyRemoteScene).toHaveBeenCalledTimes(1)
        })

        expect(baseProps.applyRemoteScene).toHaveBeenCalledWith(replacementScene, {
            silent: true,
            assetsBaseUrl: '/serverXR/api/spaces/main/assets',
            serverVersion: 4
        })
    })

    it('prefers the local server asset base when a remote replacement scene carries production asset urls', async () => {
        const baseProps = createBaseProps()
        let eventHandlers = null
        connectMock.mockImplementation((handlers) => {
            eventHandlers = handlers
        })

        renderHook(() => useLiveSync(baseProps))

        const replacementScene = {
            ...createScene(),
            assetsBaseUrl: 'https://di-studio.xyz/serverXR/api/spaces/main/assets',
            assets: [{ id: 'asset-remote', mimeType: 'image/png', name: 'poster.png' }]
        }

        act(() => {
            eventHandlers.onPatch({
                version: 5,
                ops: [{
                    opId: 'replace-remote-assets',
                    clientId: 'client-b',
                    type: 'replaceScene',
                    payload: {
                        scene: replacementScene
                    }
                }]
            })
        })

        await waitFor(() => {
            expect(baseProps.applyRemoteScene).toHaveBeenCalledTimes(1)
        })

        expect(baseProps.applyRemoteScene).toHaveBeenCalledWith(replacementScene, {
            silent: true,
            assetsBaseUrl: '/serverXR/api/spaces/main/assets',
            serverVersion: 5
        })
    })

    it('uses the server asset base when live sync reloads the full scene', async () => {
        const replacementScene = {
            ...createScene(),
            assets: [{ id: 'asset-2', mimeType: 'video/mp4', name: 'clip.mp4' }]
        }
        const baseProps = createBaseProps({
            getServerSceneOps: vi.fn().mockResolvedValue({
                latestVersion: 2,
                ops: []
            }),
            getServerScene: vi.fn().mockResolvedValue({
                version: 2,
                scene: replacementScene
            })
        })
        let eventHandlers = null
        connectMock.mockImplementation((handlers) => {
            eventHandlers = handlers
        })

        renderHook(() => useLiveSync(baseProps))

        act(() => {
            eventHandlers.onReady({})
        })

        await waitFor(() => {
            expect(baseProps.applyRemoteScene).toHaveBeenCalledTimes(1)
        })

        expect(baseProps.applyRemoteScene).toHaveBeenCalledWith(replacementScene, {
            silent: true,
            assetsBaseUrl: '/serverXR/api/spaces/main/assets',
            serverVersion: 2
        })
    })

    it('catches up missed scene ops when the event stream becomes ready', async () => {
        const baseProps = createBaseProps({
            getServerSceneOps: vi.fn().mockResolvedValue({
                latestVersion: 1,
                ops: [{
                    opId: 'catch-up-1',
                    version: 1,
                    clientId: 'client-b',
                    type: 'setSceneSettings',
                    payload: {
                        backgroundColor: '#101010'
                    }
                }]
            })
        })
        let eventHandlers = null
        connectMock.mockImplementation((handlers) => {
            eventHandlers = handlers
        })

        renderHook(() => useLiveSync(baseProps))

        act(() => {
            eventHandlers.onReady({})
        })

        await waitFor(() => {
            expect(baseProps.applySceneState).toHaveBeenCalledTimes(1)
        })

        expect(baseProps.applySceneState.mock.calls[0][0].backgroundColor).toBe('#101010')
        expect(baseProps.setSceneVersion).toHaveBeenCalledWith(1)
    })

    it('reports live scene stream health separately from socket presence', async () => {
        const baseProps = createBaseProps()
        let eventHandlers = null
        connectMock.mockImplementation((handlers) => {
            eventHandlers = handlers
        })

        const { result } = renderHook(() => useLiveSync(baseProps))

        await waitFor(() => {
            expect(result.current.sceneStreamState).toBe('connecting')
        })

        act(() => {
            eventHandlers.onReady({})
        })

        await waitFor(() => {
            expect(result.current.isSceneStreamConnected).toBe(true)
        })

        act(() => {
            eventHandlers.onError(new Event('error'))
        })

        await waitFor(() => {
            expect(result.current.sceneStreamState).toBe('degraded')
        })

        expect(result.current.sceneStreamError).toBe('Scene event stream is reconnecting.')
        expect(result.current.isSceneStreamConnected).toBe(false)
    })
})
