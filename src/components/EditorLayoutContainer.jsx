import { useContext } from 'react'
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
    controlSections,
    hiddenUiButtons,
    isLoading,
    isFileDragActive,
    mediaOptimizationPreference,
    setMediaOptimizationPreference,
    canCreateGroupSelection,
    xrStore,
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
    const { renderSettings, cameraSettings, selectionGroups } = useContext(SceneSettingsContext)
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

    return (
        <EditorLayout
            menu={menu}
            setMenu={setMenu}
            fileInputRef={fileInputRef}
            handleFileLoad={handleFileLoad}
            controlSections={controlSections}
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
            currentCameraSettings={cameraSettings}
            cameraPosition={cameraPosition}
            renderSettings={renderSettings}
            rendererRef={rendererRef}
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
