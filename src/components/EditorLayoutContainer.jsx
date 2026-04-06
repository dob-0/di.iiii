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

    const {
        shouldShowStatusPanel,
        statusPanelClassName,
        statusSummary,
        statusDotClass
    } = useStatusPanel({
        statusItems,
        isStatusPanelVisible,
        isUiVisible
    })

    const {
        sceneButtons = [],
        adminButtons = [],
        displayButtons = [],
        xrButtons = [],
        hiddenUiButtons = []
    } = controlButtons || {}

    const panelEntries = useMemo(() => ([
        {
            key: 'view',
            label: 'View',
            isVisible: isViewPanelVisible,
            onToggle: () => setIsViewPanelVisible((prev) => !prev),
            onClose: () => setIsViewPanelVisible(false),
            floatingPlacement: 'dock'
        },
        {
            key: 'world',
            label: 'World',
            isVisible: isWorldPanelVisible,
            onToggle: () => setIsWorldPanelVisible((prev) => !prev),
            onClose: () => setIsWorldPanelVisible(false),
            floatingPlacement: 'dock'
        },
        {
            key: 'media',
            label: 'Media',
            isVisible: isMediaPanelVisible,
            onToggle: () => setIsMediaPanelVisible((prev) => !prev),
            onClose: () => setIsMediaPanelVisible(false),
            floatingPlacement: 'dock'
        },
        {
            key: 'assets',
            label: 'Assets',
            isVisible: isAssetPanelVisible,
            onToggle: () => setIsAssetPanelVisible((prev) => !prev),
            onClose: () => setIsAssetPanelVisible(false),
            floatingPlacement: 'dock'
        },
        {
            key: 'outliner',
            label: 'Outliner',
            isVisible: isOutlinerPanelVisible,
            onToggle: () => setIsOutlinerPanelVisible((prev) => !prev),
            onClose: () => setIsOutlinerPanelVisible(false),
            floatingPlacement: 'dock'
        },
        {
            key: 'spaces',
            label: 'Spaces',
            isVisible: isSpacesPanelVisible,
            onToggle: () => setIsSpacesPanelVisible((prev) => !prev),
            onClose: () => setIsSpacesPanelVisible(false),
            floatingPlacement: 'dock',
            isAvailable: isAdminMode
        },
        {
            key: 'inspector',
            label: 'Inspector',
            isVisible: isInspectorPanelVisible,
            onToggle: () => setIsInspectorPanelVisible((prev) => !prev),
            onClose: () => setIsInspectorPanelVisible(false),
            floatingPlacement: 'overlay'
        }
    ].filter((entry) => entry.isAvailable !== false)), [
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
    ])

    const toolbarModel = useMemo(() => {
        const buttonMap = new Map()
        ;[sceneButtons, displayButtons, adminButtons, xrButtons].flat().forEach((button) => {
            if (button?.key) {
                buttonMap.set(button.key, button)
            }
        })

        const pick = (...keys) => keys.map((key) => buttonMap.get(key)).filter(Boolean)

        return {
            spaceButton: buttonMap.get('space-label') || null,
            fileButtons: pick('save', 'load'),
            historyButtons: pick('undo', 'redo'),
            interactionModeButton: buttonMap.get('interaction-mode') || null,
            presentationButtons: pick('presentation-scene', 'presentation-fixed-camera', 'presentation-code'),
            overflowSections: [
                {
                    key: 'scene',
                    label: 'Scene',
                    items: pick('new-space', 'group-selection', 'ungroup-selection', 'preferences', 'offline-mode', 'clear')
                },
                {
                    key: 'display',
                    label: 'Display',
                    items: pick('fullscreen', 'status-panel', 'selection-lock', 'ui-default-toggle', 'layout-mode', 'layout-side', 'hide-ui', 'xr-focus')
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

    return (
        <EditorLayout
            menu={menu}
            setMenu={setMenu}
            fileInputRef={fileInputRef}
            handleFileLoad={handleFileLoad}
            toolbarModel={toolbarModel}
            panelEntries={panelEntries}
            hiddenUiButtons={hiddenUiButtons}
            isUiVisible={isUiVisible}
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
            handleToggleSpacePermanent={handleToggleSpacePermanent}
            newSpaceName={newSpaceName}
            setNewSpaceName={setNewSpaceName}
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
