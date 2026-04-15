import { useContext, useMemo } from 'react'
import {
    SceneContext,
    UiContext,
    SceneSettingsContext,
    SyncContext,
    SpacesContext,
    ActionsContext,
    RefsContext
} from '../contexts/AppContexts.js'
import { useStatusItems } from '../hooks/useStatusItems.js'
import { useStatusPanel } from '../hooks/useStatusPanel.js'
import { useViewportMode } from '../hooks/useViewportMode.js'
import { useControlSections } from '../hooks/useControlSections.js'
import EditorLayout from './EditorLayout.jsx'

export default function EditorLayoutContainer({
    handleFileLoad,
    controlButtons,
    isLoading,
    isFileDragActive,
    mediaOptimizationPreference,
    setMediaOptimizationPreference,
    canCreateGroupSelection,
    xrStore,
    currentCameraSettings,
    cameraPosition,
    rendererRef,
    remoteCursorMarkers,
    handleCanvasPointerMove,
    handleCanvasPointerLeave
}) {
    const { viewportMode, isPhoneCompact } = useViewportMode()
    const { objects, selectedObjectIds, clearSelection, sceneVersion } = useContext(SceneContext)
    const {
        menu,
        setMenu,
        isAdminMode,
        isUiVisible,
        layoutMode,
        toggleLayoutMode,
        layoutSide,
        isWorldPanelVisible,
        isViewPanelVisible,
        isMediaPanelVisible,
        isAssetPanelVisible,
        isOutlinerPanelVisible,
        isSpacesPanelVisible,
        isInspectorPanelVisible,
        setIsWorldPanelVisible,
        setIsViewPanelVisible,
        setIsMediaPanelVisible,
        setIsAssetPanelVisible,
        setIsOutlinerPanelVisible,
        setIsSpacesPanelVisible,
        setIsInspectorPanelVisible,
        isGizmoVisible,
        isPointerDragging
    } = useContext(UiContext)
    const { renderSettings, selectionGroups, presentation } = useContext(SceneSettingsContext)
    const {
        uploadProgress,
        assetRestoreProgress,
        serverAssetSyncProgress,
        serverAssetSyncPending,
        localSaveStatus,
        mediaOptimizationStatus,
        supportsServerSpaces,
        isOfflineMode,
        liveSyncFeatureEnabled,
        isLiveSyncEnabled,
        isReadOnly,
        spaceId,
        canPublishToServer,
        serverSyncInfo,
        isStatusPanelVisible,
        isSocketConnected,
        collaborators,
        participantRoster,
        isSceneStreamConnected,
        sceneStreamState,
        sceneStreamError
    } = useContext(SyncContext)
    const {
        spaces,
        newSpaceName,
        setNewSpaceName,
        openAfterCreateTarget,
        setOpenAfterCreateTarget,
        spaceNameFeedback,
        canCreateSpace,
        tempSpaceTtlHours,
        isCreatingSpace
    } = useContext(SpacesContext)
    const {
        handleSelectObjectFromOutliner,
        handleToggleObjectVisibility,
        handleSelectSelectionGroup,
        handleCreateSelectionGroup,
        handleDeleteSelectionGroup,
        handleCreateNamedSpace,
        handleOpenSpace,
        handleCopySpaceLink,
        handleDeleteSpace,
        handleRenameSpace,
        handleToggleSpacePermanent
    } = useContext(ActionsContext)
    const { fileInputRef } = useContext(RefsContext)

    const statusItems = useStatusItems({
        uploadProgress,
        assetRestoreProgress,
        serverAssetSyncProgress,
        serverAssetSyncPending,
        localSaveStatus,
        mediaOptimizationStatus,
        supportsServerSpaces,
        isOfflineMode,
        liveSyncFeatureEnabled,
        isLiveSyncEnabled,
        isReadOnly,
        sceneVersion,
        spaceId,
        canPublishToServer,
        serverSyncInfo,
        isSocketConnected,
        collaborators,
        participantRoster,
        isSceneStreamConnected,
        sceneStreamState,
        sceneStreamError
    })

    const { shouldShowStatusPanel, statusPanelClassName, statusSummary, statusDotClass } =
        useStatusPanel({
            statusItems,
            isStatusPanelVisible,
            isUiVisible
        })

    const {
        sceneButtons = [],
        panelButtons = [],
        adminButtons = [],
        displayButtons = [],
        xrButtons = [],
        hiddenUiButtons = []
    } = controlButtons || {}

    const panelEntries = useMemo(
        () =>
            [
                {
                    key: 'view',
                    label: 'View',
                    isVisible: isViewPanelVisible,
                    onToggle: () => setIsViewPanelVisible((prev) => !prev),
                    onClose: () => setIsViewPanelVisible(false),
                    floatingPlacement: 'dock',
                    workspaceGroup: 'scene',
                    workspaceOrder: 10,
                    mobileGroup: 'scene',
                    mobileOrder: 10
                },
                {
                    key: 'world',
                    label: 'World',
                    isVisible: isWorldPanelVisible,
                    onToggle: () => setIsWorldPanelVisible((prev) => !prev),
                    onClose: () => setIsWorldPanelVisible(false),
                    floatingPlacement: 'dock',
                    workspaceGroup: 'scene',
                    workspaceOrder: 20,
                    mobileGroup: 'scene',
                    mobileOrder: 20
                },
                {
                    key: 'media',
                    label: 'Media',
                    isVisible: isMediaPanelVisible,
                    onToggle: () => setIsMediaPanelVisible((prev) => !prev),
                    onClose: () => setIsMediaPanelVisible(false),
                    floatingPlacement: 'dock',
                    workspaceGroup: 'files',
                    workspaceOrder: 10,
                    mobileGroup: 'files',
                    mobileOrder: 10
                },
                {
                    key: 'assets',
                    label: 'Assets',
                    isVisible: isAssetPanelVisible,
                    onToggle: () => setIsAssetPanelVisible((prev) => !prev),
                    onClose: () => setIsAssetPanelVisible(false),
                    floatingPlacement: 'dock',
                    workspaceGroup: 'files',
                    workspaceOrder: 20,
                    mobileGroup: 'files',
                    mobileOrder: 20
                },
                {
                    key: 'outliner',
                    label: 'Outliner',
                    isVisible: isOutlinerPanelVisible,
                    onToggle: () => setIsOutlinerPanelVisible((prev) => !prev),
                    onClose: () => setIsOutlinerPanelVisible(false),
                    floatingPlacement: 'dock',
                    workspaceGroup: 'scene',
                    workspaceOrder: 30,
                    mobileGroup: 'scene',
                    mobileOrder: 30
                },
                {
                    key: 'spaces',
                    label: 'Spaces',
                    isVisible: isSpacesPanelVisible,
                    onToggle: () => setIsSpacesPanelVisible((prev) => !prev),
                    onClose: () => setIsSpacesPanelVisible(false),
                    floatingPlacement: 'dock',
                    isAvailable: isAdminMode,
                    workspaceGroup: 'scene',
                    workspaceOrder: 40,
                    mobileGroup: 'scene',
                    mobileOrder: 40
                },
                {
                    key: 'inspector',
                    label: 'Inspector',
                    isVisible: isInspectorPanelVisible,
                    onToggle: () => setIsInspectorPanelVisible((prev) => !prev),
                    onClose: () => setIsInspectorPanelVisible(false),
                    floatingPlacement: 'dock',
                    workspaceGroup: 'selected',
                    workspaceOrder: 10,
                    mobileGroup: 'selected',
                    mobileOrder: 10
                }
            ].filter((entry) => entry.isAvailable !== false),
        [
            isAdminMode,
            isAssetPanelVisible,
            isInspectorPanelVisible,
            isMediaPanelVisible,
            isOutlinerPanelVisible,
            isSpacesPanelVisible,
            isViewPanelVisible,
            isWorldPanelVisible,
            setIsAssetPanelVisible,
            setIsInspectorPanelVisible,
            setIsMediaPanelVisible,
            setIsOutlinerPanelVisible,
            setIsSpacesPanelVisible,
            setIsViewPanelVisible,
            setIsWorldPanelVisible
        ]
    )

    const toolbarModel = useMemo(() => {
        const buttonMap = new Map()
        ;[sceneButtons, displayButtons, adminButtons, xrButtons].flat().forEach((button) => {
            if (button?.key) {
                buttonMap.set(button.key, button)
            }
        })

        const pick = (...keys) => keys.map((key) => buttonMap.get(key)).filter(Boolean)

        return {
            identity: {
                spaceButton: buttonMap.get('space-label') || null
            },
            modeButtons: {
                interaction: buttonMap.get('interaction-mode') || null,
                presentation: pick(
                    'presentation-scene',
                    'presentation-fixed-camera',
                    'presentation-code'
                )
            },
            primaryActions: pick('save', 'load'),
            historyActions: pick('undo', 'redo'),
            drawerSections: [
                {
                    key: 'scene',
                    label: 'Scene',
                    items: pick(
                        'new-space',
                        'group-selection',
                        'ungroup-selection',
                        'preferences',
                        'offline-mode',
                        'clear'
                    )
                },
                {
                    key: 'display',
                    label: 'Display',
                    items: pick(
                        'fullscreen',
                        'status-panel',
                        'selection-lock',
                        'ui-default-toggle',
                        'hide-ui',
                        'xr-focus'
                    )
                },
                {
                    key: 'admin',
                    label: 'Admin',
                    items: adminButtons
                },
                {
                    key: 'xr',
                    label: 'XR',
                    items: xrButtons
                }
            ].filter((section) => Array.isArray(section.items) && section.items.length > 0)
        }
    }, [adminButtons, displayButtons, sceneButtons, xrButtons])
    const controlSections = useControlSections({
        isUiVisible,
        sceneButtons: sceneButtons
            .filter(
                (button) =>
                    ![
                        'interaction-mode',
                        'group-selection',
                        'ungroup-selection',
                        'preferences'
                    ].includes(button.key)
            )
            .map((button) => {
                if (button.key === 'save') return { ...button, label: 'Export Scene' }
                if (button.key === 'load') return { ...button, label: 'Load Scene' }
                return button
            }),
        panelButtons,
        adminButtons: [],
        displayButtons: displayButtons.filter(
            (button) =>
                ![
                    'presentation-scene',
                    'presentation-fixed-camera',
                    'presentation-code',
                    'xr-focus'
                ].includes(button.key)
        ),
        xrButtons
    })

    const mobileModel = useMemo(
        () => ({
            spaceButton: toolbarModel.identity?.spaceButton,
            interactionModeButton: toolbarModel.modeButtons?.interaction
                ? {
                      ...toolbarModel.modeButtons.interaction,
                      label: toolbarModel.modeButtons.interaction.label.replace('Mode: ', '')
                  }
                : null,
            presentationButtons: (toolbarModel.modeButtons?.presentation || []).map((button) => ({
                ...button,
                label: button.label === '2D Camera' ? '2D' : button.label.replace(' View', '')
            })),
            xrButtons: xrButtons.filter((button) =>
                ['enter-ar', 'enter-vr', 'exit-xr'].includes(button.key)
            ),
            panelEntries,
            moreSections: [
                {
                    key: 'project',
                    label: 'Project',
                    items: toolbarModel.primaryActions || []
                },
                {
                    key: 'history',
                    label: 'History',
                    items: toolbarModel.historyActions || []
                },
                ...(toolbarModel.drawerSections || [])
            ].filter((section) => Array.isArray(section.items) && section.items.length > 0)
        }),
        [panelEntries, toolbarModel, xrButtons]
    )

    return (
        <EditorLayout
            menu={menu}
            setMenu={setMenu}
            fileInputRef={fileInputRef}
            handleFileLoad={handleFileLoad}
            toolbarModel={toolbarModel}
            mobileModel={mobileModel}
            controlSections={controlSections}
            panelEntries={panelEntries}
            hiddenUiButtons={hiddenUiButtons}
            isUiVisible={isUiVisible}
            viewportMode={viewportMode}
            isPhoneCompact={isPhoneCompact}
            layoutMode={layoutMode}
            toggleLayoutMode={toggleLayoutMode}
            layoutSide={layoutSide}
            isWorldPanelVisible={isWorldPanelVisible}
            isViewPanelVisible={isViewPanelVisible}
            isMediaPanelVisible={isMediaPanelVisible}
            isAssetPanelVisible={isAssetPanelVisible}
            isOutlinerPanelVisible={isOutlinerPanelVisible}
            isAdminMode={isAdminMode}
            isSpacesPanelVisible={isSpacesPanelVisible}
            objects={objects}
            selectionGroups={selectionGroups}
            selectedObjectIds={selectedObjectIds}
            handleSelectObjectFromOutliner={handleSelectObjectFromOutliner}
            handleToggleObjectVisibility={handleToggleObjectVisibility}
            handleSelectSelectionGroup={handleSelectSelectionGroup}
            handleCreateSelectionGroup={handleCreateSelectionGroup}
            handleDeleteSelectionGroup={handleDeleteSelectionGroup}
            canCreateGroupSelection={canCreateGroupSelection}
            spaces={spaces}
            spaceId={spaceId}
            handleCreateNamedSpace={handleCreateNamedSpace}
            handleOpenSpace={handleOpenSpace}
            handleCopySpaceLink={handleCopySpaceLink}
            handleDeleteSpace={handleDeleteSpace}
            handleRenameSpace={handleRenameSpace}
            handleToggleSpacePermanent={handleToggleSpacePermanent}
            newSpaceName={newSpaceName}
            setNewSpaceName={setNewSpaceName}
            openAfterCreateTarget={openAfterCreateTarget}
            setOpenAfterCreateTarget={setOpenAfterCreateTarget}
            spaceNameFeedback={spaceNameFeedback}
            canCreateSpace={canCreateSpace}
            tempSpaceTtlHours={tempSpaceTtlHours}
            isCreatingSpace={isCreatingSpace}
            isLoading={isLoading}
            isFileDragActive={isFileDragActive}
            mediaOptimizationPreference={mediaOptimizationPreference}
            setMediaOptimizationPreference={setMediaOptimizationPreference}
            setIsWorldPanelVisible={setIsWorldPanelVisible}
            setIsViewPanelVisible={setIsViewPanelVisible}
            setIsMediaPanelVisible={setIsMediaPanelVisible}
            setIsAssetPanelVisible={setIsAssetPanelVisible}
            setIsOutlinerPanelVisible={setIsOutlinerPanelVisible}
            isInspectorPanelVisible={isInspectorPanelVisible}
            setIsInspectorPanelVisible={setIsInspectorPanelVisible}
            setIsSpacesPanelVisible={setIsSpacesPanelVisible}
            isGizmoVisible={isGizmoVisible}
            isPointerDragging={isPointerDragging}
            clearSelection={clearSelection}
            xrStore={xrStore}
            currentCameraSettings={currentCameraSettings}
            cameraPosition={cameraPosition}
            renderSettings={renderSettings}
            rendererRef={rendererRef}
            presentation={presentation}
            remoteCursorMarkers={remoteCursorMarkers}
            handleCanvasPointerMove={handleCanvasPointerMove}
            handleCanvasPointerLeave={handleCanvasPointerLeave}
            shouldShowStatusPanel={shouldShowStatusPanel}
            statusPanelClassName={statusPanelClassName}
            statusDotClass={statusDotClass}
            statusSummary={statusSummary}
            statusItems={statusItems}
        />
    )
}
