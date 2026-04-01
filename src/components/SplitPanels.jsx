import React from 'react'
import WorldPanel from '../WorldPanel.jsx'
import ViewPanel from '../ViewPanel.jsx'
import MediaPanel from '../MediaPanel.jsx'
import AssetPanel from '../AssetPanel.jsx'
import OutlinerPanel from '../OutlinerPanel.jsx'
import SpacesPanel from '../SpacesPanel.jsx'
import InspectorPanel from '../InspectorPanel.jsx'

export default function SplitPanels({
    isInspectorPanelVisible,
    setIsInspectorPanelVisible,
    isWorldPanelVisible,
    setIsWorldPanelVisible,
    isViewPanelVisible,
    setIsViewPanelVisible,
    isMediaPanelVisible,
    setIsMediaPanelVisible,
    isAssetPanelVisible,
    setIsAssetPanelVisible,
    isOutlinerPanelVisible,
    setIsOutlinerPanelVisible,
    isAdminMode,
    isSpacesPanelVisible,
    setIsSpacesPanelVisible,
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
    mediaOptimizationPreference,
    setMediaOptimizationPreference
}) {
    return (
        <div className="panel-container split-mode">
            <div className="split-tabs">
                {isInspectorPanelVisible && (
                    <button className="split-tab active" onClick={() => setIsInspectorPanelVisible(false)}>Inspector x</button>
                )}
                {isWorldPanelVisible && (
                    <button className="split-tab active" onClick={() => setIsWorldPanelVisible(false)}>World x</button>
                )}
                {isViewPanelVisible && (
                    <button className="split-tab active" onClick={() => setIsViewPanelVisible(false)}>View x</button>
                )}
                {isMediaPanelVisible && (
                    <button className="split-tab active" onClick={() => setIsMediaPanelVisible(false)}>Media x</button>
                )}
                {isAssetPanelVisible && (
                    <button className="split-tab active" onClick={() => setIsAssetPanelVisible(false)}>Assets x</button>
                )}
                {isOutlinerPanelVisible && (
                    <button className="split-tab active" onClick={() => setIsOutlinerPanelVisible(false)}>Outliner x</button>
                )}
                {isAdminMode && isSpacesPanelVisible && (
                    <button className="split-tab active" onClick={() => setIsSpacesPanelVisible(false)}>Spaces x</button>
                )}
            </div>
            <div className="split-panel-content">
                {isInspectorPanelVisible && <InspectorPanel />}
                {isWorldPanelVisible && <WorldPanel />}
                {isViewPanelVisible && <ViewPanel />}
                {isMediaPanelVisible && (
                    <MediaPanel
                        preference={mediaOptimizationPreference}
                        onChange={setMediaOptimizationPreference}
                        onClose={() => setIsMediaPanelVisible(false)}
                    />
                )}
                {isAssetPanelVisible && (
                    <AssetPanel
                        onClose={() => setIsAssetPanelVisible(false)}
                    />
                )}
                {isOutlinerPanelVisible && (
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
                        onClose={() => setIsOutlinerPanelVisible(false)}
                    />
                )}
                {isAdminMode && isSpacesPanelVisible && (
                    <SpacesPanel
                        spaces={spaces}
                        currentSpaceId={spaceId}
                        onClose={() => setIsSpacesPanelVisible(false)}
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
                )}
            </div>
        </div>
    )
}
