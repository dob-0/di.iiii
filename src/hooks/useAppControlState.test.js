import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAppControlState } from './useAppControlState.js'

const useControlButtonsMock = vi.fn()
const useSpaceLabelMock = vi.fn()
const useStatusStateMock = vi.fn()

vi.mock('./useControlButtons.js', () => ({
    useControlButtons: (...args) => useControlButtonsMock(...args)
}))

vi.mock('./useSpaceLabel.js', () => ({
    useSpaceLabel: (...args) => useSpaceLabelMock(...args)
}))

vi.mock('./useStatusState.js', () => ({
    useStatusState: (...args) => useStatusStateMock(...args)
}))

function createProps(overrides = {}) {
    return {
        spaceId: 'gallery',
        handleCopySpaceLink: vi.fn(),
        selectedObjectIds: ['one', 'two'],
        localSaveStatus: { ts: 1, label: 'Saved locally' },
        markLocalSave: vi.fn(),
        serverSyncInfo: { ts: 2, label: 'Synced with server' },
        markServerSync: vi.fn(),
        setPresentationMode: vi.fn(),
        setIsUiVisible: vi.fn(),
        xrContextValue: {
            isXrPresenting: false,
            handleEnterXrSession: vi.fn(),
            supportedXrModes: { vr: true, ar: false },
            activeXrMode: null,
            handleExitXrSession: vi.fn(),
            showXrDiagnostics: vi.fn()
        },
        isCreatingSpace: false,
        handleQuickSpaceCreate: vi.fn(),
        guardEditAction: (fn) => fn,
        handleCreateSelectionGroup: vi.fn(),
        selectionHasGroup: true,
        handleUngroupSelection: vi.fn(),
        isUiVisible: true,
        handleSave: vi.fn(),
        handleLoadClick: vi.fn(),
        isOfflineMode: false,
        handleToggleOfflineMode: vi.fn(),
        handleUndo: vi.fn(),
        handleRedo: vi.fn(),
        canUndo: true,
        canRedo: true,
        handleClear: vi.fn(),
        navigateToPreferences: vi.fn(),
        isViewPanelVisible: true,
        setIsViewPanelVisible: vi.fn(),
        isWorldPanelVisible: false,
        setIsWorldPanelVisible: vi.fn(),
        isMediaPanelVisible: false,
        setIsMediaPanelVisible: vi.fn(),
        isAssetPanelVisible: false,
        setIsAssetPanelVisible: vi.fn(),
        isOutlinerPanelVisible: false,
        setIsOutlinerPanelVisible: vi.fn(),
        isAdminMode: true,
        isReadOnly: false,
        canAccessServerSpaces: true,
        handleToggleSpaceEditLock: vi.fn(),
        isSpacesPanelVisible: false,
        setIsSpacesPanelVisible: vi.fn(),
        liveSyncFeatureEnabled: true,
        isLiveSyncEnabled: true,
        setIsLiveSyncEnabled: vi.fn(),
        canSyncServerScene: true,
        handleReloadFromServer: vi.fn(),
        handlePublishToServer: vi.fn(),
        canPublishToServer: true,
        isFullscreen: false,
        handleEnterFullscreen: vi.fn(),
        interactionMode: 'edit',
        toggleInteractionMode: vi.fn(),
        isSelectionLocked: false,
        setIsSelectionLocked: vi.fn(),
        uiDefaultVisible: true,
        toggleUiDefaultVisible: vi.fn(),
        layoutMode: 'dock',
        toggleLayoutMode: vi.fn(),
        layoutSide: 'right',
        cycleLayoutSide: vi.fn(),
        presentationMode: 'scene',
        ...overrides
    }
}

describe('useAppControlState', () => {
    it('composes control button inputs and routes XR focus through shared state setters', () => {
        useSpaceLabelMock.mockReturnValue({ key: 'space-label', label: 'Space: gallery' })
        useStatusStateMock.mockReturnValue({
            isStatusPanelVisible: true,
            setIsStatusPanelVisible: vi.fn()
        })

        let capturedParams = null
        useControlButtonsMock.mockImplementation((params) => {
            capturedParams = params
            return {
                sceneButtons: [{ key: 'scene' }],
                panelButtons: [{ key: 'panel' }],
                adminButtons: [{ key: 'admin' }],
                displayButtons: [{ key: 'display' }],
                xrButtons: [{ key: 'xr' }],
                hiddenUiButtons: [{ key: 'hidden' }]
            }
        })

        const props = createProps()
        const { result } = renderHook(() => useAppControlState(props))

        expect(useSpaceLabelMock).toHaveBeenCalledWith({
            spaceId: 'gallery',
            onCopyLink: props.handleCopySpaceLink
        })
        expect(useStatusStateMock).toHaveBeenCalledWith({
            spaceId: 'gallery',
            localSaveStatus: props.localSaveStatus,
            markLocalSave: props.markLocalSave,
            serverSyncInfo: props.serverSyncInfo,
            markServerSync: props.markServerSync
        })
        expect(result.current.canCreateGroupSelection).toBe(true)
        expect(result.current.sceneButtons).toEqual([{ key: 'scene' }])
        expect(capturedParams.spaceLabelButton).toEqual({ key: 'space-label', label: 'Space: gallery' })
        expect(capturedParams.canCreateGroupSelection).toBe(true)
        capturedParams.navigateToPreferences()
        expect(props.navigateToPreferences).toHaveBeenCalledWith('gallery')

        capturedParams.handleEnterXrFocus()
        expect(props.setPresentationMode).toHaveBeenCalledWith('scene')
        expect(useStatusStateMock.mock.results[0].value.setIsStatusPanelVisible).toHaveBeenCalledWith(false)
        expect(props.setIsUiVisible).toHaveBeenCalledWith(false)
    })
})
