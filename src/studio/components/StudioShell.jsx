import { useCallback, useEffect, useState } from 'react'
import { Button } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import StudioInspector from './StudioInspector.jsx'
import StudioPresentationSurface from './StudioPresentationSurface.jsx'
import StudioFloatingPanel from './StudioFloatingPanel.jsx'
import StudioControlCluster from './StudioControlCluster.jsx'
import StudioQuickInsert from './StudioQuickInsert.jsx'
import { useStudioPanelState } from '../hooks/useStudioPanelState.js'
import {
    ActivityPanel,
    AssetsPanel,
    LibraryPanel,
    PresentPanel,
    ProjectPanel,
    PublishPanel,
    StructurePanel,
} from './StudioShellPanels.jsx'

const DEFAULT_POSITIONS = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    return {
        library:   { x: 16, y: 16 },
        assets:    { x: 308, y: 16 },
        inspector: { x: vw - 296, y: 16 },
        structure: { x: 16, y: Math.round(vh * 0.45) },
        present:   { x: Math.round(vw * 0.35), y: 16 },
        publish:   { x: vw - 296, y: Math.round(vh * 0.45) },
        activity:  { x: Math.round(vw * 0.35), y: Math.round(vh * 0.45) },
        world:     { x: 308, y: Math.round(vh * 0.45) },
    }
}

export default function StudioShell({
    document,
    loading,
    loadError,
    displayName,
    onDisplayNameChange,
    selectedEntity,
    selectedEntityId,
    entities,
    inspectorSections,
    inspectorValues,
    assetOptions,
    presence,
    syncState,
    // layout / updateLayout accepted but not used — new shell manages its own panel state
    layout,
    updateLayout,
    isDesktop,
    isMobile,
    cameraView,
    controlsRef,
    xrState,
    onCreateEntity,
    onCreateFromAsset,
    onAssetFilesSelected,
    onDeleteSelected,
    onSelectEntity,
    onInspectorChange,
    onWorldPatch,
    onProjectMetaPatch,
    onPresentationPatch,
    onPublishPatch,
    liveProjectState,
    onSetLiveProject,
    onClearLiveProject,
    onSaveCurrentCamera,
    onCopyShareLink,
    onExportProject,
    onImportProjectFile,
    onEnterXr,
    onExitXr,
    onBackToHub,
    onCameraViewChange,
    onTransformCommit,
}) {
    const { open, toggle, isOpen } = useStudioPanelState()
    const [uiHidden, setUiHidden] = useState(false)
    const [viewportEditMode, setViewportEditMode] = useState('navigate')
    const [viewportGizmoMode, setViewportGizmoMode] = useState('translate')
    const [quickInsert, setQuickInsert] = useState(null)
    const [positions] = useState(DEFAULT_POSITIONS)

    useEffect(() => {
        const handler = (e) => {
            const inInput = e.target.tagName === 'INPUT'
                || e.target.tagName === 'TEXTAREA'
                || e.target.isContentEditable
            if (inInput) return

            if (e.key === 'h' || e.key === 'H') {
                e.preventDefault()
                setUiHidden((v) => !v)
            }
            if (e.key === 'e' || e.key === 'E') {
                e.preventDefault()
                setViewportEditMode((m) => (m === 'navigate' ? 'edit' : 'navigate'))
            }
            if (e.key === 'Escape' && quickInsert) {
                setQuickInsert(null)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [quickInsert])

    const handleViewportDoubleClick = useCallback((e) => {
        if (e.target.closest('.sfp-shell, .scc-wrap, button, input, textarea, [role="button"]')) return
        setQuickInsert({ x: e.clientX, y: e.clientY })
    }, [])

    const handleFullscreen = useCallback(() => {
        const doc = window.document
        if (!doc.fullscreenElement) {
            doc.documentElement.requestFullscreen?.()
        } else {
            doc.exitFullscreen?.()
        }
    }, [])

    const inspectorFooter = (
        <Button
            variant="outlined"
            color="error"
            size="small"
            disabled={!selectedEntity}
            onClick={onDeleteSelected}
            startIcon={<DeleteOutlineIcon />}
        >
            Delete
        </Button>
    )

    return (
        <div className="sfp-root" onDoubleClick={handleViewportDoubleClick}>
            <StudioPresentationSurface
                document={document}
                selectedEntityId={selectedEntityId}
                onSelectEntity={onSelectEntity}
                cursors={presence?.cursors}
                onCursorMove={presence?.emitCursor}
                onCursorLeave={presence?.clearCursor}
                cameraView={cameraView}
                controlsRef={controlsRef}
                xrStore={xrState?.xrStore}
                onCameraChange={onCameraViewChange}
                editMode={viewportEditMode}
                gizmoMode={viewportGizmoMode}
                onTransformCommit={onTransformCommit}
            />

            {loading && (
                <div className="sfp-overlay-card">Loading project…</div>
            )}
            {loadError && (
                <div className="sfp-overlay-card sfp-overlay-card--error">{loadError}</div>
            )}

            {!uiHidden && (
                <>
                    {isOpen('library') && (
                        <StudioFloatingPanel
                            title="Library"
                            onClose={() => toggle('library')}
                            initialPosition={positions.library}
                            initialWidth={260}
                        >
                            <LibraryPanel
                                onCreateEntity={onCreateEntity}
                                onAssetFilesSelected={onAssetFilesSelected}
                                canDeleteSelection={Boolean(selectedEntity)}
                                onDeleteSelected={onDeleteSelected}
                            />
                        </StudioFloatingPanel>
                    )}

                    {isOpen('assets') && (
                        <StudioFloatingPanel
                            title="Assets"
                            onClose={() => toggle('assets')}
                            initialPosition={positions.assets}
                            initialWidth={260}
                        >
                            <AssetsPanel
                                assets={assetOptions}
                                onAssetFilesSelected={onAssetFilesSelected}
                                onCreateFromAsset={onCreateFromAsset}
                            />
                        </StudioFloatingPanel>
                    )}

                    {isOpen('inspector') && (
                        <StudioFloatingPanel
                            title="Inspector"
                            onClose={() => toggle('inspector')}
                            initialPosition={positions.inspector}
                            initialWidth={280}
                        >
                            <StudioInspector
                                title={selectedEntity ? selectedEntity.name : 'World'}
                                subtitle={selectedEntity ? selectedEntity.type : 'Project defaults'}
                                sections={inspectorSections}
                                values={inspectorValues}
                                assetOptions={assetOptions}
                                onSectionChange={onInspectorChange}
                                footer={inspectorFooter}
                            />
                        </StudioFloatingPanel>
                    )}

                    {isOpen('structure') && (
                        <StudioFloatingPanel
                            title="Structure"
                            onClose={() => toggle('structure')}
                            initialPosition={positions.structure}
                            initialWidth={240}
                        >
                            <StructurePanel
                                entities={entities}
                                selectedEntityId={selectedEntityId}
                                onSelectEntity={onSelectEntity}
                            />
                        </StudioFloatingPanel>
                    )}

                    {isOpen('present') && (
                        <StudioFloatingPanel
                            title="Present"
                            onClose={() => toggle('present')}
                            initialPosition={positions.present}
                            initialWidth={360}
                            minWidth={300}
                            maxWidth={700}
                        >
                            <PresentPanel
                                presentationState={document?.presentationState}
                                onPresentationPatch={onPresentationPatch}
                                onSaveCurrentCamera={onSaveCurrentCamera}
                                assets={document?.assets || []}
                            />
                        </StudioFloatingPanel>
                    )}

                    {isOpen('publish') && (
                        <StudioFloatingPanel
                            title="Publish"
                            onClose={() => toggle('publish')}
                            initialPosition={positions.publish}
                            initialWidth={360}
                            minWidth={300}
                        >
                            <PublishPanel
                                document={document}
                                publishState={document?.publishState}
                                liveProjectState={liveProjectState}
                                onPublishPatch={onPublishPatch}
                                onSetLiveProject={onSetLiveProject}
                                onClearLiveProject={onClearLiveProject}
                                onCopyShareLink={onCopyShareLink}
                                onExportProject={onExportProject}
                                onImportProjectFile={onImportProjectFile}
                                xrState={xrState}
                                onEnterXr={onEnterXr}
                                onExitXr={onExitXr}
                            />
                        </StudioFloatingPanel>
                    )}

                    {isOpen('activity') && (
                        <StudioFloatingPanel
                            title="Activity"
                            onClose={() => toggle('activity')}
                            initialPosition={positions.activity}
                            initialWidth={260}
                        >
                            <ActivityPanel activity={syncState?.activity} />
                        </StudioFloatingPanel>
                    )}

                    {isOpen('world') && (
                        <StudioFloatingPanel
                            title="World"
                            onClose={() => toggle('world')}
                            initialPosition={positions.world}
                            initialWidth={280}
                        >
                            <ProjectPanel
                                document={document}
                                displayName={displayName}
                                onDisplayNameChange={onDisplayNameChange}
                                onProjectMetaPatch={onProjectMetaPatch}
                                onWorldPatch={onWorldPatch}
                                onOpenHub={onBackToHub}
                            />
                        </StudioFloatingPanel>
                    )}

                    <StudioControlCluster
                        spaceName={document?.projectMeta?.title || document?.projectMeta?.id || 'Studio'}
                        editMode={viewportEditMode}
                        onSetEditMode={setViewportEditMode}
                        gizmoMode={viewportGizmoMode}
                        onSetGizmoMode={setViewportGizmoMode}
                        openPanels={open}
                        onTogglePanel={toggle}
                        onFullscreen={handleFullscreen}
                        onHideUI={() => setUiHidden(true)}
                        onBackToHub={onBackToHub}
                        xrState={xrState}
                        syncState={syncState}
                        presence={presence}
                    />
                </>
            )}

            {uiHidden && (
                <button className="sfp-show-ui-btn" onClick={() => setUiHidden(false)} title="Show UI (H)">
                    ≡
                </button>
            )}

            {quickInsert && (
                <StudioQuickInsert
                    position={quickInsert}
                    onClose={() => setQuickInsert(null)}
                    onCreateEntity={onCreateEntity}
                    onCreateFromAsset={onCreateFromAsset}
                    assets={document?.assets || []}
                />
            )}
        </div>
    )
}
