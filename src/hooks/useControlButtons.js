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
    presentationMode,
    setPresentationMode,
    handleEnterXrFocus,
    // xr
    isXrPresenting,
    handleEnterXrSession,
    supportedXrModes,
    activeXrMode,
    handleExitXrSession,
    showXrDiagnostics
}) {
    return useMemo(() => {
        const isSceneView = presentationMode === 'scene'
        const isFixedCameraView = presentationMode === 'fixed-camera'
        const isCodeView = presentationMode === 'code'
        const xrModeBlocked = !isSceneView

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
                { key: 'preferences', label: 'Admin', onClick: navigateToPreferences },
                { key: 'save', label: 'Export Project', onClick: handleSave, hint: 'Cmd/Ctrl+S' },
                { key: 'load', label: 'Import Project', onClick: handleLoadClick },
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
            displayButtons.push({
                key: 'presentation-scene',
                label: '3D View',
                onClick: () => setPresentationMode('scene'),
                isActive: isSceneView,
                title: 'Use the normal interactive 3D scene camera.'
            })
            displayButtons.push({
                key: 'presentation-fixed-camera',
                label: '2D Camera',
                onClick: () => setPresentationMode('fixed-camera'),
                isActive: isFixedCameraView,
                title: 'Lock the scene to a saved presentation camera.'
            })
            displayButtons.push({
                key: 'presentation-code',
                label: 'Code View',
                onClick: () => setPresentationMode('code'),
                isActive: isCodeView,
                title: 'Show this space as a flat 2D/code-driven presentation.'
            })
            displayButtons.push({
                key: 'xr-focus',
                label: 'XR Focus',
                onClick: handleEnterXrFocus,
                title: 'Hide the editor UI and switch to the 3D scene so only XR controls remain.'
            })
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
        const buildXrSessionButtons = () => {
            if (!isXrPresenting) {
                return [
                    {
                        key: 'enter-vr',
                        label: 'Enter VR',
                        onClick: () => handleEnterXrSession('vr'),
                        disabled: !supportedXrModes.vr || xrModeBlocked,
                        title: xrModeBlocked
                            ? 'Switch back to 3D View or use XR Focus before entering immersive mode.'
                            : (!supportedXrModes.vr ? 'VR is not supported on this device or browser.' : undefined)
                    },
                    {
                        key: 'enter-ar',
                        label: 'Enter AR',
                        onClick: () => handleEnterXrSession('ar'),
                        disabled: !supportedXrModes.ar || xrModeBlocked,
                        title: xrModeBlocked
                            ? 'Switch back to 3D View or use XR Focus before entering immersive mode.'
                            : (!supportedXrModes.ar ? 'AR is not supported on this device or browser.' : undefined)
                    }
                ]
            }

            return [{
                key: 'exit-xr',
                label: activeXrMode === 'immersive-ar' ? 'Exit AR' : 'Exit XR',
                onClick: handleExitXrSession
            }]
        }

        const xrButtons = isUiVisible ? [
            ...buildXrSessionButtons(),
            ...(showXrDiagnostics ? [{
                key: 'xr-debug',
                label: 'XR Debug',
                onClick: showXrDiagnostics,
                title: 'Copy XR diagnostics for support and session checks'
            }] : [])
        ] : []
        const hiddenUiButtons = !isUiVisible
            ? [
                { key: 'show-ui', label: 'Show UI', onClick: () => setIsUiVisible(true), variant: 'success' },
                ...(!isSceneView
                    ? [{
                        key: 'switch-3d-view',
                        label: '3D View',
                        onClick: () => setPresentationMode('scene'),
                        title: 'Return to the 3D scene while the UI stays hidden.'
                    }]
                    : []),
                ...(isXrPresenting ? buildXrSessionButtons() : [])
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
        presentationMode,
        setPresentationMode,
        handleEnterXrFocus,
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
