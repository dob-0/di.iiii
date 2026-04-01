import { useMemo } from 'react'

export function useControlButtons({
    // scene
    spaceLabelButton,
    isCreatingSpace,
    handleQuickSpaceCreate,
    canCreateGroupSelection,
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
    // panels
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
    // admin
    isAdminMode,
    isSpacesPanelVisible,
    setIsSpacesPanelVisible,
    liveSyncFeatureEnabled,
    isLiveSyncEnabled,
    setIsLiveSyncEnabled,
    canSyncServerScene,
    handleReloadFromServer,
    handlePublishToServer,
    canPublishToServer,
    isReadOnly,
    canAccessServerSpaces,
    handleToggleSpaceEditLock,
    // display
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
    // xr
    isXrPresenting,
    handleEnterXrSession,
    supportedXrModes,
    activeXrMode,
    handleExitXrSession,
    showXrDiagnostics
}) {
    return useMemo(() => {
        const interactionModeButton = {
            key: 'interaction-mode',
            label: interactionMode === 'edit' ? 'Mode: Edit' : 'Mode: Navigate',
            onClick: toggleInteractionMode,
            hint: 'E',
            variant: interactionMode === 'edit' ? 'success' : undefined,
            title: interactionMode === 'edit'
                ? 'Edit mode: selection and gizmo editing are active. Press E to switch.'
                : 'Navigate mode: camera-first navigation. Press E to switch.'
        }

        const sceneButtons = [
            spaceLabelButton,
            interactionModeButton,
            {
                key: 'new-space',
                label: isCreatingSpace ? 'Creating...' : 'New Space',
                onClick: handleQuickSpaceCreate,
                variant: 'success',
                disabled: isCreatingSpace
            }
        ]

        if (canCreateGroupSelection) {
            sceneButtons.push({
                key: 'group-selection',
                label: 'Group Selection',
                onClick: handleCreateSelectionGroup,
                disabled: !canCreateGroupSelection
            })
        }
        if (selectionHasGroup) {
            sceneButtons.push({
                key: 'ungroup-selection',
                label: 'Ungroup',
                onClick: handleUngroupSelection
            })
        }
        if (isUiVisible) {
            sceneButtons.push(
                { key: 'preferences', label: 'Preferences', onClick: navigateToPreferences },
                { key: 'save', label: 'Export Scene', onClick: handleSave, hint: 'Cmd/Ctrl+S' },
                { key: 'load', label: 'Load Scene', onClick: handleLoadClick },
                { key: 'offline-mode', label: isOfflineMode ? 'Exit Offline' : 'Work Offline', onClick: handleToggleOfflineMode },
                { key: 'undo', label: 'Undo', onClick: handleUndo, disabled: !canUndo, hint: 'Cmd/Ctrl+Z' },
                { key: 'redo', label: 'Redo', onClick: handleRedo, disabled: !canRedo, hint: 'Shift+Cmd/Ctrl+Z' },
                { key: 'clear', label: 'Clear Scene', onClick: () => handleClear({ silent: false }), variant: 'warning' }
            )
        }

        const panelButtons = isUiVisible
            ? [
                { key: 'view', label: 'View', onClick: () => setIsViewPanelVisible(prev => !prev), isActive: isViewPanelVisible },
                { key: 'world', label: 'World', onClick: () => setIsWorldPanelVisible(prev => !prev), isActive: isWorldPanelVisible },
                { key: 'media', label: 'Media', onClick: () => setIsMediaPanelVisible(prev => !prev), isActive: isMediaPanelVisible },
                { key: 'assets', label: 'Assets', onClick: () => setIsAssetPanelVisible(prev => !prev), isActive: isAssetPanelVisible },
                { key: 'outliner', label: 'Outliner', onClick: () => setIsOutlinerPanelVisible(prev => !prev), isActive: isOutlinerPanelVisible }
            ]
            : []

        const adminButtons = (isAdminMode && isUiVisible)
            ? [
                { key: 'spaces', label: 'Spaces', onClick: () => setIsSpacesPanelVisible(prev => !prev), isActive: isSpacesPanelVisible },
                ...(canAccessServerSpaces
                    ? [{
                        key: 'edit-lock',
                        label: isReadOnly ? 'Editing: Locked' : 'Editing: Open',
                        onClick: () => handleToggleSpaceEditLock?.(isReadOnly),
                        title: 'Toggle whether collaborators can edit'
                    }]
                    : []),
                ...(liveSyncFeatureEnabled
                    ? [{
                        key: 'live-toggle',
                        label: isLiveSyncEnabled ? 'Live Sync On' : 'Live Sync Off',
                        onClick: () => setIsLiveSyncEnabled(!isLiveSyncEnabled),
                        disabled: !canSyncServerScene,
                        variant: isLiveSyncEnabled ? 'success' : undefined
                    }]
                    : []),
                { key: 'reload-server', label: 'Reload Server Scene', onClick: handleReloadFromServer, disabled: !canPublishToServer },
                { key: 'publish', label: 'Publish to Server', onClick: handlePublishToServer, disabled: !canPublishToServer }
            ]
            : []

        const displayButtons = []
        if (!isFullscreen) {
            displayButtons.push({ key: 'fullscreen', label: 'Enter Fullscreen', onClick: handleEnterFullscreen })
        }
        if (isUiVisible) {
            displayButtons.push({ key: 'hide-ui', label: 'Hide UI', onClick: () => setIsUiVisible(false), variant: 'warning' })
            displayButtons.push({
                key: 'status-panel',
                label: isStatusPanelVisible ? 'Hide Activity' : 'Show Activity',
                onClick: () => setIsStatusPanelVisible(prev => !prev),
                title: 'Toggle the activity/status panel'
            })
        }
        displayButtons.push({
            key: 'selection-lock',
            label: isSelectionLocked ? 'Selection Locked' : 'Selection Movable',
            onClick: () => setIsSelectionLocked(prev => !prev),
            variant: isSelectionLocked ? 'warning' : undefined,
            title: isSelectionLocked ? 'Objects cannot be dragged or transformed' : 'Objects can be moved'
        })
        displayButtons.push({
            key: 'ui-default-toggle',
            label: uiDefaultVisible ? 'Default UI: Visible' : 'Default UI: Hidden',
            onClick: toggleUiDefaultVisible,
            title: 'Set whether the UI shows on load'
        })
        displayButtons.push({
            key: 'layout-mode',
            label: layoutMode === 'split' ? 'Split View' : 'Floating Panels',
            onClick: toggleLayoutMode,
            isActive: layoutMode === 'split',
            title: 'Toggle between floating panels and split-screen layout'
        })
        if (layoutMode === 'split') {
            displayButtons.push({
                key: 'layout-side',
                label: `Side: ${(layoutSide || 'right').charAt(0).toUpperCase() + (layoutSide || 'right').slice(1)}`,
                onClick: cycleLayoutSide,
                title: 'Cycle dock position (right → left → bottom → top)'
            })
        }

        const buildXrSessionButtons = () => {
            if (!isXrPresenting) {
                return [
                    {
                        key: 'enter-vr',
                        label: 'Enter VR',
                        onClick: () => handleEnterXrSession('vr'),
                        disabled: !supportedXrModes.vr,
                        title: !supportedXrModes.vr ? 'VR is not supported on this device or browser.' : undefined
                    },
                    {
                        key: 'enter-ar',
                        label: 'Enter AR',
                        onClick: () => handleEnterXrSession('ar'),
                        disabled: !supportedXrModes.ar,
                        title: !supportedXrModes.ar ? 'AR is not supported on this device or browser.' : undefined
                    }
                ]
            }

            return [{
                key: 'exit-xr',
                label: activeXrMode === 'immersive-ar' ? 'Exit AR' : 'Exit XR',
                onClick: handleExitXrSession
            }]
        }

        const xrButtons = isUiVisible ? buildXrSessionButtons() : []
        const hiddenUiButtons = !isUiVisible
            ? [
                { key: 'show-ui', label: 'Show UI', onClick: () => setIsUiVisible(true), variant: 'success' },
                ...buildXrSessionButtons(),
                ...(showXrDiagnostics ? [{
                    key: 'xr-debug',
                    label: 'XR Debug',
                    onClick: showXrDiagnostics,
                    title: 'Copy XR diagnostics for support and session checks'
                }] : [])
            ]
            : []

        return { sceneButtons, panelButtons, adminButtons, displayButtons, xrButtons, hiddenUiButtons }
    }, [
        spaceLabelButton,
        isCreatingSpace,
        handleQuickSpaceCreate,
        canCreateGroupSelection,
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
        isXrPresenting,
        handleEnterXrSession,
        supportedXrModes?.vr,
        supportedXrModes?.ar,
        activeXrMode,
        handleExitXrSession,
        showXrDiagnostics
    ])
}

export default useControlButtons
