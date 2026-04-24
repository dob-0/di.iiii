import { useCallback, useMemo } from 'react'
import { useControlButtons } from './useControlButtons.js'
import { useSpaceLabel } from './useSpaceLabel.js'
import { useStatusState } from './useStatusState.js'

export function useAppControlState({
    spaceId,
    handleCopySpaceLink,
    selectedObjectIds,
    localSaveStatus,
    markLocalSave,
    serverSyncInfo,
    markServerSync,
    setPresentationMode,
    setIsUiVisible,
    xrContextValue,
    isCreatingSpace,
    handleQuickSpaceCreate,
    guardEditAction,
    handleCreateSelectionGroup,
    selectionHasGroup,
    handleUngroupSelection,
    isUiVisible,
    handleSave,
    handleLoadClick,
    isOfflineMode,
    handleToggleOfflineMode,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    handleClear,
    navigateToPreferences,
    isViewPanelVisible,
    setIsViewPanelVisible,
    isWorldPanelVisible,
    setIsWorldPanelVisible,
    isMediaPanelVisible,
    setIsMediaPanelVisible,
    isAssetPanelVisible,
    setIsAssetPanelVisible,
    isOutlinerPanelVisible,
    setIsOutlinerPanelVisible,
    isAdminMode,
    isReadOnly,
    canAccessServerSpaces,
    handleToggleSpaceEditLock,
    isSpacesPanelVisible,
    setIsSpacesPanelVisible,
    liveSyncFeatureEnabled,
    isLiveSyncEnabled,
    setIsLiveSyncEnabled,
    canSyncServerScene,
    handleReloadFromServer,
    handlePublishToServer,
    canPublishToServer,
    isFullscreen,
    handleEnterFullscreen,
    interactionMode,
    toggleInteractionMode,
    isSelectionLocked,
    setIsSelectionLocked,
    uiDefaultVisible,
    toggleUiDefaultVisible,
    layoutMode,
    toggleLayoutMode,
    layoutSide,
    cycleLayoutSide,
    presentationMode
} = {}) {
    const spaceLabelButton = useSpaceLabel({
        spaceId,
        onCopyLink: handleCopySpaceLink
    })

    const canCreateGroupSelection = selectedObjectIds.length > 1

    const { isStatusPanelVisible, setIsStatusPanelVisible } = useStatusState({
        spaceId,
        localSaveStatus,
        markLocalSave,
        serverSyncInfo,
        markServerSync
    })

    const handleEnterXrFocus = useCallback(() => {
        setPresentationMode('scene')
        setIsStatusPanelVisible(false)
        setIsUiVisible(false)
    }, [setIsStatusPanelVisible, setIsUiVisible, setPresentationMode])

    const xrControlButtonsProps = useMemo(
        () => ({
            isXrPresenting: xrContextValue.isXrPresenting ?? false,
            handleEnterXrSession: xrContextValue.handleEnterXrSession,
            supportedXrModes: xrContextValue.supportedXrModes ?? { vr: false, ar: false },
            activeXrMode: xrContextValue.activeXrMode,
            handleExitXrSession: xrContextValue.handleExitXrSession,
            showXrDiagnostics: xrContextValue.showXrDiagnostics
        }),
        [
            xrContextValue.isXrPresenting,
            xrContextValue.handleEnterXrSession,
            xrContextValue.supportedXrModes,
            xrContextValue.activeXrMode,
            xrContextValue.handleExitXrSession,
            xrContextValue.showXrDiagnostics
        ]
    )

    const { sceneButtons, panelButtons, adminButtons, displayButtons, xrButtons, hiddenUiButtons } =
        useControlButtons({
            spaceLabelButton,
            isCreatingSpace,
            handleQuickSpaceCreate,
            canCreateGroupSelection,
            handleCreateSelectionGroup: guardEditAction(handleCreateSelectionGroup),
            selectionHasGroup,
            handleUngroupSelection: guardEditAction(handleUngroupSelection),
            isUiVisible,
            handleSave,
            handleLoadClick,
            isOfflineMode,
            handleToggleOfflineMode,
            handleUndo,
            handleRedo,
            canUndo,
            canRedo,
            handleClear: guardEditAction(handleClear),
            navigateToPreferences: () => navigateToPreferences(spaceId),
            isViewPanelVisible,
            setIsViewPanelVisible,
            isWorldPanelVisible,
            setIsWorldPanelVisible,
            isMediaPanelVisible,
            setIsMediaPanelVisible,
            isAssetPanelVisible,
            setIsAssetPanelVisible,
            isOutlinerPanelVisible,
            setIsOutlinerPanelVisible,
            isAdminMode,
            isReadOnly,
            canAccessServerSpaces,
            handleToggleSpaceEditLock: (nextValue) => handleToggleSpaceEditLock(spaceId, nextValue),
            isSpacesPanelVisible,
            setIsSpacesPanelVisible,
            liveSyncFeatureEnabled,
            isLiveSyncEnabled,
            setIsLiveSyncEnabled,
            canSyncServerScene,
            handleReloadFromServer,
            handlePublishToServer,
            canPublishToServer,
            isFullscreen,
            handleEnterFullscreen,
            setIsUiVisible,
            isStatusPanelVisible,
            setIsStatusPanelVisible,
            interactionMode,
            toggleInteractionMode,
            isSelectionLocked,
            setIsSelectionLocked,
            uiDefaultVisible,
            toggleUiDefaultVisible,
            layoutMode,
            toggleLayoutMode,
            layoutSide,
            cycleLayoutSide,
            presentationMode,
            setPresentationMode,
            handleEnterXrFocus,
            ...xrControlButtonsProps
        })

    return {
        canCreateGroupSelection,
        isStatusPanelVisible,
        setIsStatusPanelVisible,
        sceneButtons,
        panelButtons,
        adminButtons,
        displayButtons,
        xrButtons,
        hiddenUiButtons
    }
}

export default useAppControlState
