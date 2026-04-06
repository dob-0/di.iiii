import React from 'react'
import { Loader } from '@react-three/drei'
import SceneCanvas from './SceneCanvas.jsx'
import PresentationCanvas from './PresentationCanvas.jsx'
import EditorOverlays from './EditorOverlays.jsx'
import DockPanels from './DockPanels.jsx'
import SplitPanels from './SplitPanels.jsx'
import EditorChrome from './EditorChrome.jsx'
import EditorToolbar from './EditorToolbar.jsx'
import WorldPanel from '../WorldPanel.jsx'
import ViewPanel from '../ViewPanel.jsx'
import MediaPanel from '../MediaPanel.jsx'
import AssetPanel from '../AssetPanel.jsx'
import OutlinerPanel from '../OutlinerPanel.jsx'
import SpacesPanel from '../SpacesPanel.jsx'
import InspectorPanel from '../InspectorPanel.jsx'

export function EditorLayout({
    menu,
    setMenu,
    fileInputRef,
    handleFileLoad,
    toolbarModel,
    panelEntries,
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
    presentation,
    remoteCursorMarkers,
    handleCanvasPointerMove,
    handleCanvasPointerLeave,
    shouldShowStatusPanel,
    statusPanelClassName,
    statusDotClass,
    statusSummary,
    statusItems
}) {
    const isCodeView = presentation?.mode === 'code'
    const renderPanelContent = (entry) => {
        if (!entry) return null

        switch (entry.key) {
        case 'inspector':
            return <InspectorPanel onClose={entry.onClose} />
        case 'world':
            return <WorldPanel />
        case 'view':
            return <ViewPanel />
        case 'media':
            return (
                <MediaPanel
                    preference={mediaOptimizationPreference}
                    onChange={setMediaOptimizationPreference}
                    onClose={entry.onClose}
                />
            )
        case 'assets':
            return <AssetPanel onClose={entry.onClose} />
        case 'outliner':
            return (
                <OutlinerPanel
                    objects={objects}
                    selectionGroups={selectionGroups}
                    selectedObjectIds={selectedObjectIds}
                    onSelectObject={handleSelectObjectFromOutliner}
                    onToggleVisibility={handleToggleObjectVisibility}
                    onSelectGroup={handleSelectSelectionGroup}
                    onCreateGroup={() => handleCreateSelectionGroup()}
                    onDeleteGroup={handleDeleteSelectionGroup}
                    canCreateGroup={canCreateGroupSelection}
                    onClose={entry.onClose}
                />
            )
        case 'spaces':
            return isAdminMode ? (
                <SpacesPanel
                    spaces={spaces}
                    currentSpaceId={spaceId}
                    onClose={entry.onClose}
                    onCreateSpace={() => handleCreateNamedSpace(false)}
                    onCreatePermanentSpace={() => handleCreateNamedSpace(true)}
                    onOpenSpace={handleOpenSpace}
                    onCopyLink={handleCopySpaceLink}
                    onDeleteSpace={handleDeleteSpace}
                    onTogglePermanent={handleToggleSpacePermanent}
                    newSpaceName={newSpaceName}
                    onSpaceNameChange={setNewSpaceName}
                    spaceNameFeedback={spaceNameFeedback}
                    canCreateSpace={canCreateSpace}
                    ttlHours={tempSpaceTtlHours}
                    isCreatingSpace={isCreatingSpace}
                    selectionGroups={selectionGroups}
                    onCreateGroup={handleCreateSelectionGroup}
                    onSelectGroup={handleSelectSelectionGroup}
                    onDeleteGroup={handleDeleteSelectionGroup}
                    canCreateGroup={canCreateGroupSelection}
                />
            ) : null
        default:
            return null
        }
    }

    return (
        <div className={`${layoutMode === 'split' ? 'layout-split' : 'layout-floating'} ${layoutMode === 'split' ? `split-${layoutSide || 'right'}` : ''}`}>
            <EditorChrome
                menu={menu}
                setMenu={setMenu}
                fileInputRef={fileInputRef}
                handleFileLoad={handleFileLoad}
            />

            {isUiVisible && (
                <EditorToolbar
                    toolbarModel={toolbarModel}
                    panelEntries={panelEntries}
                />
            )}

            {isUiVisible && layoutMode === 'split' && (
                <SplitPanels
                    panelEntries={panelEntries}
                    renderPanelContent={renderPanelContent}
                />
            )}

            {isUiVisible && layoutMode !== 'split' && (
                <DockPanels
                    panelEntries={panelEntries}
                    renderPanelContent={renderPanelContent}
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
                isCodeView ? (
                    <PresentationCanvas
                        presentation={presentation}
                        onCanvasPointerMove={handleCanvasPointerMove}
                        onCanvasPointerLeave={handleCanvasPointerLeave}
                    />
                ) : (
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
                )
            )}

            {!isCodeView && <Loader />}
        </div>
    )
}

export default EditorLayout

