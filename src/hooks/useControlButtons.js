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
    // display
    isFullscreen,
    handleEnterFullscreen,
    setIsUiVisible,
    isStatusPanelVisible,
    setIsStatusPanelVisible,
    isSelectionLocked,
    setIsSelectionLocked,
    uiDefaultVisible,
    toggleUiDefaultVisible,
    layoutMode,
    toggleLayoutMode,
    layoutSide,
    cycleLayoutSide,
    // xr
    isArModeActive,
    arAnchorTransform,
    resetArAnchor,
    isXrPresenting,
    handleEnterXrSession,
    supportedXrModes,
    activeXrMode,
    handleExitXrSession
}) {
    return useMemo(() => {
        const sceneButtons = [
            spaceLabelButton,
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
                onClick: () => {
                    console.log('cycleLayoutSide clicked, current side:', layoutSide)
                    cycleLayoutSide()
                },
                title: 'Cycle dock position (right → left → bottom → top)'
            })
        }

        const xrButtons = []
        if (isArModeActive) {
            xrButtons.push({
                key: 'ar-anchor',
                label: arAnchorTransform.anchored ? 'Recenter AR' : 'Place Scene',
                onClick: resetArAnchor,
                variant: arAnchorTransform.anchored ? undefined : 'warning'
            })
        }
        if (!isXrPresenting) {
            xrButtons.push(
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
            )
        } else {
            xrButtons.push({
                key: 'exit-xr',
                label: activeXrMode === 'immersive-ar' ? 'Exit AR' : 'Exit XR',
                onClick: handleExitXrSession
            })
        }

        return { sceneButtons, panelButtons, adminButtons, displayButtons, xrButtons }
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
        isSelectionLocked,
        setIsSelectionLocked,
        uiDefaultVisible,
        toggleUiDefaultVisible,
        layoutMode,
        toggleLayoutMode,
        layoutSide,
        cycleLayoutSide,
        isArModeActive,
        arAnchorTransform?.anchored,
        resetArAnchor,
        isXrPresenting,
        handleEnterXrSession,
        supportedXrModes?.vr,
        supportedXrModes?.ar,
        activeXrMode,
        handleExitXrSession
    ])
}

export default useControlButtons
