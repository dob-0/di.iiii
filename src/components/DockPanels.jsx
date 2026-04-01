import React from 'react'
import WorldPanel from '../WorldPanel.jsx'
import ViewPanel from '../ViewPanel.jsx'
import MediaPanel from '../MediaPanel.jsx'
import AssetPanel from '../AssetPanel.jsx'
import OutlinerPanel from '../OutlinerPanel.jsx'
import SpacesPanel from '../SpacesPanel.jsx'
import InspectorPanel from '../InspectorPanel.jsx'

export default function DockPanels({
    isInspectorPanelVisible,
    setIsInspectorPanelVisible,
    isWorldPanelVisible,
    isViewPanelVisible,
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
        <>
            <div className="panel-container panel-dock-right">
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

            {isInspectorPanelVisible && (
                <InspectorPanel onClose={() => setIsInspectorPanelVisible(false)} />
            )}
        </>
    )
}
