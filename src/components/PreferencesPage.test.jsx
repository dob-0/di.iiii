import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
                    layoutMode: 'dock',
                    layoutSide: 'right',
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

describe('PreferencesPage', () => {
    it('renders runtime build metadata and updates the node inspector when a node is selected', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                mode: 'development',
                nodeVersion: 'v22.22.0',
                release: {
                    deployEnv: 'staging',
                    sourceRef: 'staging',
                    gitCommit: 'abcdef1234567890',
                    releaseId: 'cpanel-20260415-150000',
                    generatedAt: '2026-04-15T15:00:00.000Z'
                }
            })
        })

        renderPreferencesPage()

        expect(screen.getByText('System Architecture')).toBeInTheDocument()
        expect(screen.getByText('Node Inspector')).toBeInTheDocument()
        expect(screen.getByText('Scene Radar')).toBeInTheDocument()
        expect(await screen.findByText('Build / Release')).toBeInTheDocument()
        expect(screen.getByText('0.2.0')).toBeInTheDocument()
        expect(screen.getByText('cpanel-20260415-150000')).toBeInTheDocument()
        expect(screen.getByText('abcdef1234567890')).toBeInTheDocument()

        const runtimeNode = screen.getAllByRole('button').find((button) => (
            button.textContent?.includes('Runtime') && button.textContent?.includes('socket jitter detected')
        ))

        expect(runtimeNode).toBeTruthy()
        fireEvent.click(runtimeNode)

        const inspectorSection = screen.getByText('Node Inspector').closest('section')
        expect(inspectorSection).toBeTruthy()
        expect(within(inspectorSection).getByText('socket jitter detected')).toBeInTheDocument()
        expect(within(inspectorSection).getByText('Copy Log')).toBeInTheDocument()

        const spacesHeading = screen.getAllByText('Spaces').find((node) => node.tagName === 'H2')
        expect(spacesHeading).toBeTruthy()
        const spacesSection = spacesHeading.closest('section')
        expect(spacesSection).toBeTruthy()
        expect(within(spacesSection).getByRole('button', { name: 'Public' })).toBeInTheDocument()
        expect(within(spacesSection).getByRole('button', { name: 'Studio' })).toBeInTheDocument()
        expect(within(spacesSection).getByRole('button', { name: 'Beta' })).toBeInTheDocument()
        expect(within(spacesSection).getByRole('button', { name: 'Admin' })).toBeInTheDocument()

        const snapshotSection = screen.getByText('Project Snapshot').closest('section')
        expect(snapshotSection).toBeTruthy()
        expect(within(snapshotSection).getByText('/main/studio')).toBeInTheDocument()
        expect(within(snapshotSection).getByText('/main/beta')).toBeInTheDocument()
    })
})
