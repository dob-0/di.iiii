import React from 'react'
import { Loader } from '@react-three/drei'
import Menu from '../Menu.jsx'
import WorldPanel from '../WorldPanel.jsx'
import ViewPanel from '../ViewPanel.jsx'
import MediaPanel from '../MediaPanel.jsx'
import AssetPanel from '../AssetPanel.jsx'
import OutlinerPanel from '../OutlinerPanel.jsx'
import SpacesPanel from '../SpacesPanel.jsx'
import InspectorPanel from '../InspectorPanel.jsx'
import SceneCanvas from './SceneCanvas.jsx'

export function EditorLayout({
    menu,
    setMenu,
    fileInputRef,
    handleFileLoad,
    controlSections,
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
    setIsSpacesPanelVisible,
    isGizmoVisible,
    isPointerDragging,
    clearSelection,
    xrStore,
    currentCameraSettings,
    cameraPosition,
    renderSettings,
    rendererRef,
    shouldShowStatusPanel,
    statusPanelClassName,
    statusDotClass,
    statusSummary,
    statusItems
}) {
    const renderControlButton = (button) => {
        const classNames = ['toggle-button']
        if (button.variant === 'success') classNames.push('success-button')
        if (button.variant === 'warning') classNames.push('warning-button')
        if (button.variant === 'danger') classNames.push('clear-button')
        if (button.isActive) classNames.push('active')
        return (
            <button
                key={button.key}
                type="button"
                className={classNames.filter(Boolean).join(' ')}
                onClick={button.onClick}
                disabled={button.disabled}
                title={button.title}
            >
                <span>{button.label}</span>
                {button.hint && <span className="button-hint">{button.hint}</span>}
            </button>
        )
    }

    return (
        <div className={`${layoutMode === 'split' ? 'layout-split' : 'layout-floating'} ${layoutMode === 'split' ? `split-${layoutSide || 'right'}` : ''}`}>
            {menu.visible && (
                <Menu
                    x={menu.x}
                    y={menu.y}
                    onClose={() => setMenu(prev => ({ ...prev, visible: false }))}
                />
            )}

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".zip,application/zip"
                onChange={handleFileLoad}
            />

            <div className="top-right-controls">
                {controlSections.map((section) => (
                    <div key={section.key} className="control-cluster">
                        <div className="cluster-label">{section.label}</div>
                        <div className="control-buttons">
                            {section.buttons.map(renderControlButton)}
                        </div>
                    </div>
                ))}
            </div>

            {isUiVisible && layoutMode === 'split' && (
                <div className="panel-container split-mode">
                    <div className="split-tabs">
                        {isWorldPanelVisible && (
                            <button className="split-tab active" onClick={() => setIsWorldPanelVisible(false)}>World ×</button>
                        )}
                        {isViewPanelVisible && (
                            <button className="split-tab active" onClick={() => setIsViewPanelVisible(false)}>View ×</button>
                        )}
                        {isMediaPanelVisible && (
                            <button className="split-tab active" onClick={() => setIsMediaPanelVisible(false)}>Media ×</button>
                        )}
                        {isAssetPanelVisible && (
                            <button className="split-tab active" onClick={() => setIsAssetPanelVisible(false)}>Assets ×</button>
                        )}
                        {isOutlinerPanelVisible && (
                            <button className="split-tab active" onClick={() => setIsOutlinerPanelVisible(false)}>Outliner ×</button>
                        )}
                        {isAdminMode && isSpacesPanelVisible && (
                            <button className="split-tab active" onClick={() => setIsSpacesPanelVisible(false)}>Spaces ×</button>
                        )}
                    </div>
                    <div className="split-panel-content">
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
                        <InspectorPanel />
                    </div>
                </div>
            )}

            {isUiVisible && layoutMode !== 'split' && (
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
            )}

            {isUiVisible && layoutMode !== 'split' && <InspectorPanel />}

            {isLoading && (
                <div className="loading-overlay">
                    <div className="loading-panel">
                        <div className="loading-spinner" aria-hidden="true" />
                        <p>Loading scene...</p>
                    </div>
                </div>
            )}

            {isFileDragActive && (
                <div className="drop-overlay">
                    <div className="drop-panel">
                        <p>Drop files to add to your scene</p>
                    </div>
                </div>
            )}

            {isUiVisible && layoutMode !== 'split' && <InspectorPanel />}

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
                />
            )}

            {shouldShowStatusPanel && (
                <div className={statusPanelClassName}>
                    <div className="status-header">
                        <div className="status-title">
                            <span className={statusDotClass} aria-hidden="true" />
                            <span>Activity</span>
                        </div>
                        <div className="status-summary">{statusSummary}</div>
                    </div>
                    {statusItems.map(item => (
                        <div key={item.key} className="status-row">
                            <div className="status-row-top">
                                <div className="status-label">{item.label}</div>
                                {item.detail && <div className="status-detail">{item.detail}</div>}
                            </div>
                            {item.showBar !== false && (item.indeterminate || 'percent' in item) && (
                                <div className={['status-bar', item.indeterminate ? 'indeterminate' : ''].filter(Boolean).join(' ')}>
                                    {!item.indeterminate && 'percent' in item && (
                                        <div className="status-progress" style={{ width: `${Math.max(0, Math.min(100, item.percent || 0))}%` }} />
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Loader />
        </div>
    )
}

export default EditorLayout
