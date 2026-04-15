import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStatusItems } from './useStatusItems.js'

describe('useStatusItems', () => {
    it('makes the live collaboration contract explicit when sync is enabled', () => {
        const { result } = renderHook(() => useStatusItems({
            uploadProgress: null,
            assetRestoreProgress: null,
            serverAssetSyncProgress: null,
            serverAssetSyncPending: 0,
            localSaveStatus: { ts: null, label: 'Not saved locally' },
            mediaOptimizationStatus: null,
            supportsServerSpaces: true,
            isOfflineMode: false,
            liveSyncFeatureEnabled: true,
            isLiveSyncEnabled: true,
            sceneVersion: 1,
            spaceId: 'main',
            canPublishToServer: true,
            isReadOnly: false,
            serverSyncInfo: { ts: null, label: 'Server: not synced yet' },
            isSocketConnected: true,
            collaborators: [{ userId: 'b', userName: 'Other User' }],
            participantRoster: [
                { userId: 'self', userName: 'Self', isSelf: true },
                { userId: 'b', userName: 'Other User', isSelf: false }
            ],
            isSceneStreamConnected: true,
            sceneStreamState: 'connected',
            sceneStreamError: null
        }))

        const presenceStatus = result.current.find((item) => item.key === 'presence-status')
        const sceneStreamStatus = result.current.find((item) => item.key === 'scene-stream')
        const serverStatus = result.current.find((item) => item.key === 'server-status')

        expect(presenceStatus?.label).toBe('Presence connected: 1 collaborator online')
        expect(presenceStatus?.detail).toContain('Other User')
        expect(sceneStreamStatus?.label).toBe('Scene stream connected')
        expect(serverStatus?.label).toBe('Live collaboration active')
        expect(serverStatus?.detail).toContain('Scene edits sync live')
    })

    it('falls back to presence plus manual publish when live sync is off', () => {
        const { result } = renderHook(() => useStatusItems({
            uploadProgress: null,
            assetRestoreProgress: null,
            serverAssetSyncProgress: null,
            serverAssetSyncPending: 0,
            localSaveStatus: { ts: null, label: 'Not saved locally' },
            mediaOptimizationStatus: null,
            supportsServerSpaces: true,
            isOfflineMode: false,
            liveSyncFeatureEnabled: true,
            isLiveSyncEnabled: false,
            sceneVersion: 1,
            spaceId: 'main',
            canPublishToServer: true,
            isReadOnly: false,
            serverSyncInfo: { ts: null, label: 'Server: not synced yet' },
            isSocketConnected: true,
            collaborators: [{ userId: 'b', userName: 'Other User' }],
            participantRoster: [
                { userId: 'self', userName: 'Self', isSelf: true },
                { userId: 'b', userName: 'Other User', isSelf: false }
            ],
            isSceneStreamConnected: false,
            sceneStreamState: 'idle',
            sceneStreamError: null
        }))

        const presenceStatus = result.current.find((item) => item.key === 'presence-status')
        const serverStatus = result.current.find((item) => item.key === 'server-status')

        expect(presenceStatus?.label).toBe('Presence connected: 1 collaborator online')
        expect(presenceStatus?.detail).toContain('Publish to sync scene changes')
        expect(serverStatus?.detail).toBe('Live sync is off. Use Publish to sync changes between browsers.')
    })

    it('shows degraded live collaboration when presence is connected but the scene stream is down', () => {
        const { result } = renderHook(() => useStatusItems({
            uploadProgress: null,
            assetRestoreProgress: null,
            serverAssetSyncProgress: null,
            serverAssetSyncPending: 0,
            localSaveStatus: { ts: null, label: 'Not saved locally' },
            mediaOptimizationStatus: null,
            supportsServerSpaces: true,
            isOfflineMode: false,
            liveSyncFeatureEnabled: true,
            isLiveSyncEnabled: true,
            sceneVersion: 1,
            spaceId: 'main',
            canPublishToServer: true,
            isReadOnly: false,
            serverSyncInfo: { ts: null, label: 'Server: not synced yet' },
            isSocketConnected: true,
            collaborators: [{ userId: 'b', userName: 'Other User' }],
            participantRoster: [
                { userId: 'self', userName: 'Self', isSelf: true },
                { userId: 'b', userName: 'Other User', isSelf: false }
            ],
            isSceneStreamConnected: false,
            sceneStreamState: 'degraded',
            sceneStreamError: 'Scene event stream is reconnecting.'
        }))

        const serverStatus = result.current.find((item) => item.key === 'server-status')
        const sceneStreamStatus = result.current.find((item) => item.key === 'scene-stream')

        expect(serverStatus?.label).toBe('Live collaboration degraded')
        expect(serverStatus?.detail).toBe('Scene event stream is reconnecting.')
        expect(sceneStreamStatus?.label).toBe('Scene stream degraded')
        expect(sceneStreamStatus?.detail).toBe('Scene event stream is reconnecting.')
    })
})
