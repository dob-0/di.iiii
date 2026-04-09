import React from 'react'
import { Loader } from '@react-three/drei'
import SceneCanvas from './SceneCanvas.jsx'
import PresentationCanvas from './PresentationCanvas.jsx'
import EditorOverlays from './EditorOverlays.jsx'
import EditorChrome from './EditorChrome.jsx'
import DesktopWorkspaceShell from './DesktopWorkspaceShell.jsx'
import MobileEditorShell from './MobileEditorShell.jsx'
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
    mobileModel,
    panelEntries,
    hiddenUiButtons,
    isUiVisible,
    viewportMode = 'desktop',
    isPhoneCompact = false,
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
    openAfterCreateTarget,
    setOpenAfterCreateTarget,
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
    const isMobileViewport = viewportMode === 'mobile'
    const isCodeView = presentation?.mode === 'code'
    const renderPanelContent = (entry, options = {}) => {
        if (!entry) return null
        const surfaceMode = options.surfaceMode || 'floating'
        const panelClose = options.onClose || entry.onClose

        switch (entry.key) {
        case 'inspector':
            return <InspectorPanel onClose={panelClose} surfaceMode={surfaceMode} />
        case 'world':
            return <WorldPanel onClose={panelClose} surfaceMode={surfaceMode} />
        case 'view':
            return <ViewPanel onClose={panelClose} surfaceMode={surfaceMode} />
        case 'media':
            return (
                <MediaPanel
                    preference={mediaOptimizationPreference}
                    onChange={setMediaOptimizationPreference}
                    onClose={panelClose}
                    surfaceMode={surfaceMode}
                />
            )
        case 'assets':
            return <AssetPanel onClose={panelClose} surfaceMode={surfaceMode} />
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
                    onClose={panelClose}
                    surfaceMode={surfaceMode}
                />
            )
        case 'spaces':
            return isAdminMode ? (
                <SpacesPanel
                    spaces={spaces}
                    currentSpaceId={spaceId}
                    onCreateSpace={() => handleCreateNamedSpace(false)}
                    onCreatePermanentSpace={() => handleCreateNamedSpace(true)}
                    onOpenSpace={handleOpenSpace}
                    onCopyLink={handleCopySpaceLink}
                    onDeleteSpace={handleDeleteSpace}
                    onTogglePermanent={handleToggleSpacePermanent}
                    newSpaceName={newSpaceName}
                    onSpaceNameChange={setNewSpaceName}
                    openAfterCreateTarget={openAfterCreateTarget}
                    onOpenAfterCreateTargetChange={setOpenAfterCreateTarget}
                    spaceNameFeedback={spaceNameFeedback}
                    canCreateSpace={canCreateSpace}
                    ttlHours={tempSpaceTtlHours}
                    isCreatingSpace={isCreatingSpace}
                    selectionGroups={selectionGroups}
                    onCreateGroup={handleCreateSelectionGroup}
                    onSelectGroup={handleSelectSelectionGroup}
                    onDeleteGroup={handleDeleteSelectionGroup}
                    canCreateGroup={canCreateGroupSelection}
                    surfaceMode={surfaceMode}
                    onClose={panelClose}
                />
            ) : null
        default:
            return null
        }
    }

    return (
        <div className={`editor-workspace viewport-${viewportMode}`}>
            <EditorChrome
                menu={menu}
                setMenu={setMenu}
                fileInputRef={fileInputRef}
                handleFileLoad={handleFileLoad}
            />

            {isUiVisible && (
                isMobileViewport ? (
                    <MobileEditorShell
                        mobileModel={mobileModel}
                        renderPanelContent={renderPanelContent}
                        selectedCount={selectedObjectIds?.length || 0}
                        statusSummary={statusSummary}
                        statusItems={statusItems}
                        isPhoneCompact={isPhoneCompact}
                    />
                ) : (
                    <DesktopWorkspaceShell
                        toolbarModel={toolbarModel}
                        panelEntries={panelEntries}
                        renderPanelContent={renderPanelContent}
                        selectedCount={selectedObjectIds?.length || 0}
                        statusSummary={statusSummary}
                        statusItems={statusItems}
                    />
                )
            )}

            <EditorOverlays
                isUiVisible={isUiVisible}
                isLoading={isLoading}
                isFileDragActive={isFileDragActive}
                hiddenUiButtons={hiddenUiButtons}
                remoteCursorMarkers={remoteCursorMarkers}
                shouldShowStatusPanel={false}
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

