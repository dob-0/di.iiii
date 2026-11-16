/* global __APP_VERSION__ */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PreferencesPage from './PreferencesPage.jsx'
import {
    ActionsContext,
    SceneContext,
    SceneSettingsContext,
    SpacesContext,
    SyncContext,
    UiContext,
    XrContext
} from '../contexts/AppContexts.js'

vi.mock('../hooks/useRuntimeConsole.js', () => ({
    useRuntimeConsole: () => ({
        entries: [
            {
                id: 'log-1',
                timestamp: '2026-04-07T06:00:00.000Z',
                level: 'info',
                message: 'boot complete'
            },
            {
                id: 'log-2',
                timestamp: '2026-04-07T06:05:00.000Z',
                level: 'warn',
                message: 'socket jitter detected'
            }
        ],
        clearEntries: vi.fn()
    })
}))

vi.mock('../hooks/useStatusItems.js', () => ({
    useStatusItems: () => ([
        {
            key: 'socket',
            label: 'Socket',
            detail: 'connected',
            percent: 100
        }
    ])
}))

afterEach(() => {
    vi.restoreAllMocks()
})

function renderPreferencesPage() {
    const objects = [
        {
            id: 'obj-1',
            name: 'Hero Totem',
            type: 'mesh',
            position: [1, 2, 3],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            isVisible: true
        },
        {
            id: 'obj-2',
            name: 'Light Ring',
            type: 'light',
            position: [4, 1, -2],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            isVisible: false
        }
    ]

    return render(
        <SceneContext.Provider value={{
            objects,
            selectedObjectId: 'obj-1',
            selectedObjectIds: ['obj-1'],
            sceneVersion: 12
        }}
        >
            <SceneSettingsContext.Provider value={{
                backgroundColor: '#05070b',
                gridSize: 20,
                ambientLight: { color: '#ffffff', intensity: 0.8 },
                directionalLight: { color: '#ffffff', intensity: 1.1 },
                cameraSettings: { orthographic: false },
                renderSettings: { shadows: true, antialias: true },
                gridAppearance: { fadeDistance: 42 },
                transformSnaps: { translation: 0.1 }
            }}
            >
                <UiContext.Provider value={{
                    isUiVisible: true,
                    uiDefaultVisible: true,
                    interactionMode: 'edit',
                    isSelectionLocked: false,
                    isAdminMode: true,
                    isViewPanelVisible: true,
                    setIsViewPanelVisible: vi.fn(),
                    isWorldPanelVisible: false,
                    setIsWorldPanelVisible: vi.fn(),
                    isMediaPanelVisible: false,
                    setIsMediaPanelVisible: vi.fn(),
                    isAssetPanelVisible: false,
                    setIsAssetPanelVisible: vi.fn(),
                    isOutlinerPanelVisible: true,
                    setIsOutlinerPanelVisible: vi.fn(),
                    isSpacesPanelVisible: true,
                    setIsSpacesPanelVisible: vi.fn(),
                    setIsUiVisible: vi.fn(),
                    toggleUiDefaultVisible: vi.fn(),
                    toggleInteractionMode: vi.fn(),
                    setIsSelectionLocked: vi.fn(),
                    setIsAdminMode: vi.fn()
                }}
                >
                    <SyncContext.Provider value={{
                        spaceId: 'main',
                        displayName: 'Operator',
                        setDisplayName: vi.fn(),
                        effectiveDisplayName: 'Operator',
                        isSocketConnected: true,
                        isSceneStreamConnected: true,
                        sceneStreamState: 'streaming',
                        sceneStreamError: '',
                        participantRoster: [{ socketId: 'sock-1', displayName: 'Operator', isSelf: true, sessionTail: '1234' }],
                        collaborators: [{ socketId: 'sock-1' }],
                        liveSyncFeatureEnabled: true,
                        isLiveSyncEnabled: true,
                        canPublishToServer: true,
                        supportsServerSpaces: true,
                        isReadOnly: false,
                        serverSyncInfo: { label: 'Up to date', ts: '2026-04-07T06:05:00.000Z' },
                        isOfflineMode: false,
                        canSyncServerScene: true,
                        shouldSyncServerScene: true,
                        setOfflineMode: vi.fn(),
                        setIsLiveSyncEnabled: vi.fn(),
                        isStatusPanelVisible: false,
                        setIsStatusPanelVisible: vi.fn()
                    }}
                    >
                        <SpacesContext.Provider value={{
                            spaces: [{ id: 'main', label: 'Main Space', isPermanent: true, allowEdits: true }]
                        }}
                        >
                            <ActionsContext.Provider value={{
                                selectObject: vi.fn(),
                                handleCopySpaceLink: vi.fn(),
                                handleReloadFromServer: vi.fn(),
                                handlePublishToServer: vi.fn(),
                                handleToggleSpaceEditLock: vi.fn()
                            }}
                            >
                                <XrContext.Provider value={{
                                    getXrDiagnosticsSnapshot: () => ({
                                        support: { ar: true, vr: false },
                                        environment: { secureContext: true, visibilityState: 'visible' }
                                    }),
                                    showXrDiagnostics: vi.fn()
                                }}
                                >
                                    <PreferencesPage onNavigateToEditor={vi.fn()} />
                                </XrContext.Provider>
                            </ActionsContext.Provider>
                        </SpacesContext.Provider>
                    </SyncContext.Provider>
                </UiContext.Provider>
            </SceneSettingsContext.Provider>
        </SceneContext.Provider>
    )
}


const windowsOpen = () => document.querySelectorAll('.admin-window').length

describe('PreferencesPage', () => {
    beforeEach(() => { window.localStorage.clear() })

    it('the Monitor tile shows only after GET /api/monitor answered 200; a 404 hides it silently', async () => {
        window.location.hash = ''
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
        const hidden = renderPreferencesPage()
        await screen.findByRole('button', { name: 'Space' })
        await new Promise((r) => setTimeout(r, 50))
        expect(spy.mock.calls.filter(([url]) => String(url).includes('/api/monitor')).length).toBe(1)
        expect(screen.queryByRole('button', { name: /^Monitor:/ })).toBeNull()
        hidden.unmount?.()
        cleanup()
        spy.mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ panels: {} }), text: async () => '{}' })
        renderPreferencesPage()
        expect(await screen.findByRole('button', { name: /^Monitor:/ })).toBeTruthy()
    })

    it('#monitor-full shows no Monitor text while the server has not answered, or on a 404; only a 200 mounts it', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
        window.location.hash = '#monitor-full'
        const first = renderPreferencesPage()
        // pending or refused: nothing of the Monitor opens
        await new Promise((r) => setTimeout(r, 50))
        expect(screen.queryByLabelText('Filter every panel')).toBeNull()
        expect(screen.queryByText(/lists machines and session titles/)).toBeNull()
        expect(screen.queryByText(/Only on the machine you are sitting at/)).toBeNull()
        // a 404 falls back to the default admin window
        await waitFor(() => expect(windowsOpen()).toBe(1))
        first.unmount?.()
        cleanup()
        window.localStorage.clear()
        spy.mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ panels: {} }), text: async () => '{}' })
        window.location.hash = '#monitor-full' // the 404 fallback opened the manage window, which rewrote the hash: set it again
        renderPreferencesPage()
        expect(await screen.findByLabelText('Filter every panel', {}, { timeout: 5000 })).toBeTruthy()
        window.location.hash = '#nonsense'
        cleanup()
        window.localStorage.clear()
        renderPreferencesPage()
        // an unknown hash opens no window: the desk home
        expect(windowsOpen()).toBe(0)
        window.location.hash = ''
    }, 20000)

    it('renders runtime build metadata and updates the node inspector when a node is selected', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                mode: 'development',
                nodeVersion: 'v22.22.0',
                release: {
                    deployEnv: 'dev',
                    sourceRef: 'dev',
                    gitCommit: 'abcdef1234567890',
                    releaseId: 'cpanel-20260415-150000',
                    generatedAt: '2026-04-15T15:00:00.000Z'
                }
            })
        })

        window.location.hash = ''
        renderPreferencesPage()
        const openTile = (label) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}:`) }))

        // Build info window: frontend build + backend release metadata.
        openTile('Build info')
        expect(await screen.findByText('Release')).toBeInTheDocument()
        expect(screen.getByText(__APP_VERSION__)).toBeInTheDocument()
        expect(await screen.findByText('cpanel-20260415-150000')).toBeInTheDocument()
        expect(screen.getByText('abcdef1234567890')).toBeInTheDocument()

        const snapshotSection = screen.getByText('Session').closest('details')
        expect(snapshotSection).toBeTruthy()
        expect(within(snapshotSection).getByText('/main/studio')).toBeInTheDocument()
        expect(within(snapshotSection).getByText('/main/raw/projects')).toBeInTheDocument()

        // Scene objects window: clicking a node in the architecture map updates the node inspector.
        fireEvent.click(screen.getByRole('button', { name: 'Desk' }))
        openTile('Scene objects')
        const architectureSection = screen.getByText('Map').closest('section')
        expect(architectureSection).toBeTruthy()
        const runtimeNode = within(architectureSection).getAllByRole('button').find((button) => (
            button.textContent?.includes('Runtime')
        ))
        expect(runtimeNode).toBeTruthy()
        fireEvent.click(runtimeNode)

        // The inspector is a drawer that opens on selection (no empty box before).
        const inspector = document.querySelector('.preferences-node-inspector')
        expect(inspector).toBeTruthy()
        expect(within(inspector).getByText('socket jitter detected')).toBeInTheDocument()

        expect(screen.getByText('Radar')).toBeInTheDocument()

        const spacesFold = screen.getAllByText('Spaces').find((node) => node.tagName === 'SUMMARY')
        expect(spacesFold).toBeTruthy()
        const spacesSection = spacesFold.closest('details')
        expect(spacesSection).toBeTruthy()
        expect(within(spacesSection).getByRole('button', { name: 'View live' })).toBeInTheDocument()
        expect(within(spacesSection).getByRole('button', { name: 'Projects' })).toBeInTheDocument()
        expect(within(spacesSection).getByRole('button', { name: 'Nodes' })).toBeInTheDocument()
        expect(within(spacesSection).getByRole('button', { name: 'Admin' })).toBeInTheDocument()
    }, 20000)

})
