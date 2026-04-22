import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppSyncSupportState } from './useAppSyncSupportState.js'

const useSyncPreferencesMock = vi.fn()
const useServerEndpointsMock = vi.fn()
const getSceneStorageKeyMock = vi.fn()
const persistSceneToLocalStorageMock = vi.fn()

vi.mock('../services/serverSpaces.js', () => ({
    supportsServerSpaces: true
}))

vi.mock('../storage/scenePersistence.js', () => ({
    getSceneStorageKey: (...args) => getSceneStorageKeyMock(...args),
    persistSceneToLocalStorage: (...args) => persistSceneToLocalStorageMock(...args)
}))

vi.mock('./useServerEndpoints.js', () => ({
    useServerEndpoints: (...args) => useServerEndpointsMock(...args)
}))

vi.mock('./useSyncPreferences.js', () => ({
    useSyncPreferences: (...args) => useSyncPreferencesMock(...args)
}))

describe('useAppSyncSupportState', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        useSyncPreferencesMock.mockReset()
        useServerEndpointsMock.mockReset()
        getSceneStorageKeyMock.mockReset()
        persistSceneToLocalStorageMock.mockReset()
    })

    it('wires sync support state and records local and server save metadata', () => {
        useSyncPreferencesMock.mockReturnValue({
            isOfflineMode: false,
            setOfflineMode: vi.fn(),
            isLiveSyncEnabled: true,
            setIsLiveSyncEnabled: vi.fn(),
            shouldSyncServerScene: true
        })
        useServerEndpointsMock.mockReturnValue({
            serverAssetBaseUrl: '/serverXR/assets',
            buildSpaceApiUrl: vi.fn()
        })
        getSceneStorageKeyMock.mockReturnValue('scene:gallery')
        persistSceneToLocalStorageMock.mockReturnValue(true)

        const nowSpy = vi.spyOn(Date, 'now')
        nowSpy.mockReturnValueOnce(1111).mockReturnValueOnce(2222)

        const { result } = renderHook(() => useAppSyncSupportState({
            spaceId: 'gallery',
            liveSyncFeatureEnabled: true
        }))

        expect(useSyncPreferencesMock).toHaveBeenCalledWith({
            spaceId: 'gallery',
            liveSyncFeatureEnabled: true,
            canSyncServerScene: true
        })
        expect(result.current.canAccessServerSpaces).toBe(true)
        expect(result.current.canSyncServerScene).toBe(true)
        expect(result.current.sceneStorageKey).toBe('scene:gallery')
        expect(result.current.serverAssetBaseUrl).toBe('/serverXR/assets')

        let persistResult = null
        act(() => {
            persistResult = result.current.persistSceneDataWithStatus({ nodes: [] }, 'Saved from test')
        })
        expect(persistResult).toBe(true)
        expect(persistSceneToLocalStorageMock).toHaveBeenCalledWith({ nodes: [] }, 'scene:gallery')
        expect(result.current.localSaveStatus).toEqual({
            ts: 1111,
            label: 'Saved from test'
        })

        act(() => {
            result.current.markServerSync('Synced from test')
        })
        expect(result.current.serverSyncInfo).toEqual({
            ts: 2222,
            label: 'Synced from test'
        })
    })
})
