import React from 'react'
import { Loader } from '@react-three/drei'
import SceneCanvas from './SceneCanvas.jsx'
import ControlClusters from './ControlClusters.jsx'
import EditorOverlays from './EditorOverlays.jsx'
import DockPanels from './DockPanels.jsx'
import SplitPanels from './SplitPanels.jsx'
import EditorChrome from './EditorChrome.jsx'

export function EditorLayout({
    menu,
    setMenu,
    fileInputRef,
    handleFileLoad,
    controlSections,
    hiddenUiButtons,
    isUiVisible,
    layoutMode,
    toggleLayoutMode,
    layoutSide,
    isWorldPanelVisible,
    isViewPanelVisible,
    isMediaPanelVisible,
    isAssetPanelVisible,
    isOutlinerPanelVisible,
    isAdminMode,
    isSpacesPanelVisible,
    objects,
    selectionGroups,
    selectedObjectIds,
    handleSelectObjectFromOutliner,
    handleToggleObjectVisibility,
    handleSelectSelectionGroup,
    handleCreateSelectionGroup,
    handleDeleteSelectionGroup,
    canCreateGroupSelection,
    spaces,
    spaceId,
    handleCreateNamedSpace,
    handleOpenSpace,
    handleCopySpaceLink,
    handleDeleteSpace,
    handleToggleSpacePermanent,
    newSpaceName,
    setNewSpaceName,
    spaceNameFeedback,
    canCreateSpace,
    tempSpaceTtlHours,
    isCreatingSpace,
    isLoading,
    isFileDragActive,
    mediaOptimizationPreference,
    setMediaOptimizationPreference,
    setIsWorldPanelVisible,
    setIsViewPanelVisible,
    setIsMediaPanelVisible,
    setIsAssetPanelVisible,
    setIsOutlinerPanelVisible,
    isInspectorPanelVisible,
    setIsInspectorPanelVisible,
    setIsSpacesPanelVisible,
    isGizmoVisible,
    isPointerDragging,
    clearSelection,
    xrStore,
    currentCameraSettings,
    cameraPosition,
    renderSettings,
    rendererRef,
    remoteCursorMarkers,
    handleCanvasPointerMove,
    handleCanvasPointerLeave,
    shouldShowStatusPanel,
    statusPanelClassName,
    statusDotClass,
    statusSummary,
    statusItems
}) {
    return (
        <div className={`${layoutMode === 'split' ? 'layout-split' : 'layout-floating'} ${layoutMode === 'split' ? `split-${layoutSide || 'right'}` : ''}`}>
            <EditorChrome
                menu={menu}
                setMenu={setMenu}
                fileInputRef={fileInputRef}
                handleFileLoad={handleFileLoad}
            />

            <ControlClusters controlSections={controlSections} />

            {isUiVisible && layoutMode === 'split' && (
                <SplitPanels
                    isInspectorPanelVisible={isInspectorPanelVisible}
                    setIsInspectorPanelVisible={setIsInspectorPanelVisible}
                    isWorldPanelVisible={isWorldPanelVisible}
                    setIsWorldPanelVisible={setIsWorldPanelVisible}
                    isViewPanelVisible={isViewPanelVisible}
                    setIsViewPanelVisible={setIsViewPanelVisible}
                    isMediaPanelVisible={isMediaPanelVisible}
                    setIsMediaPanelVisible={setIsMediaPanelVisible}
                    isAssetPanelVisible={isAssetPanelVisible}
                    setIsAssetPanelVisible={setIsAssetPanelVisible}
                    isOutlinerPanelVisible={isOutlinerPanelVisible}
                    setIsOutlinerPanelVisible={setIsOutlinerPanelVisible}
                    isAdminMode={isAdminMode}
                    isSpacesPanelVisible={isSpacesPanelVisible}
                    setIsSpacesPanelVisible={setIsSpacesPanelVisible}
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
                    mediaOptimizationPreference={mediaOptimizationPreference}
                    setMediaOptimizationPreference={setMediaOptimizationPreference}
                />
            )}

            {isUiVisible && layoutMode !== 'split' && (
                <DockPanels
                    isInspectorPanelVisible={isInspectorPanelVisible}
                    setIsInspectorPanelVisible={setIsInspectorPanelVisible}
                    isWorldPanelVisible={isWorldPanelVisible}
                    isViewPanelVisible={isViewPanelVisible}
                    isMediaPanelVisible={isMediaPanelVisible}
                    setIsMediaPanelVisible={setIsMediaPanelVisible}
                    isAssetPanelVisible={isAssetPanelVisible}
                    setIsAssetPanelVisible={setIsAssetPanelVisible}
                    isOutlinerPanelVisible={isOutlinerPanelVisible}
                    setIsOutlinerPanelVisible={setIsOutlinerPanelVisible}
                    isAdminMode={isAdminMode}
                    isSpacesPanelVisible={isSpacesPanelVisible}
                    setIsSpacesPanelVisible={setIsSpacesPanelVisible}
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
                    mediaOptimizationPreference={mediaOptimizationPreference}
                    setMediaOptimizationPreference={setMediaOptimizationPreference}
                />
            )}

            <EditorOverlays
                isUiVisible={isUiVisible}
                isLoading={isLoading}
                isFileDragActive={isFileDragActive}
                hiddenUiButtons={hiddenUiButtons}
                remoteCursorMarkers={remoteCursorMarkers}
                shouldShowStatusPanel={shouldShowStatusPanel}
                statusPanelClassName={statusPanelClassName}
                statusDotClass={statusDotClass}
                statusSummary={statusSummary}
                statusItems={statusItems}
            />

            {!isLoading && (
                <SceneCanvas
                    cameraSettings={currentCameraSettings}
                    cameraPosition={cameraPosition}
                    renderSettings={renderSettings}
                    rendererRef={rendererRef}
                    isGizmoVisible={isGizmoVisible}
                    selectedObjectIds={selectedObjectIds}
                    isPointerDragging={isPointerDragging}
                    clearSelection={clearSelection}
                    xrStore={xrStore}
                    onCanvasPointerMove={handleCanvasPointerMove}
                    onCanvasPointerLeave={handleCanvasPointerLeave}
                />
            )}

            <Loader />
        </div>
    )
}

export default EditorLayout

