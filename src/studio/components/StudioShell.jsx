import { useCallback, useEffect, useRef, useState } from 'react'
import { Box3, Vector3 } from 'three'
import StudioInspector from './StudioInspector.jsx'
import StudioViewportLayout from './StudioViewportLayout.jsx'
import StudioFloatingPanel from './StudioFloatingPanel.jsx'
import StudioControlCluster from './StudioControlCluster.jsx'
import StudioQuickInsert from './StudioQuickInsert.jsx'
import { useStudioPanelState } from '../hooks/useStudioPanelState.js'
import { useViewportLayout } from '../hooks/useViewportLayout.js'
import {
    ActivityPanel,
    AssetsPanel,
    FilesPanel,
    LibraryPanel,
    PresentPanel,
    ProjectPanel,
    PublishPanel,
    StructurePanel,
} from './StudioShellPanels.jsx'

const DEFAULT_POSITIONS = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const midY = Math.round(vh * 0.48)
    const rightX = Math.max(290, vw - 640)   // left of the cluster (cluster at vw-340)
    return {
        library:   { x: 16,                     y: 90 },
        structure: { x: 16,                     y: midY },
        assets:    { x: 290,                    y: 90 },
        activity:  { x: 290,                    y: midY },
        files:     { x: Math.round(vw * 0.3),   y: 90 },
        present:   { x: Math.round(vw * 0.3),   y: midY },
        publish:   { x: Math.round(vw * 0.55),  y: midY },
        inspector: { x: rightX,                 y: 90 },
        world:     { x: rightX,                 y: midY + 30 },
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
    selectedEntityIds = [],
    entities,
    inspectorSections,
    inspectorValues,
    assetOptions,
    spaceAssets = [],
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
    onDuplicateSelected,
    onSelectEntity,
    onInspectorChange,
    onWorldPatch,
    onRenderSettingsPatch,
    onProjectMetaPatch,
    onPresentationPatch,
    onPublishPatch,
    liveProjectState,
    onSetLiveProject,
    onClearLiveProject,
    onSaveCurrentCamera,
    onCopyShareLink,
    onViewLive,
    onExportProject,
    exportStatus,
    onImportProjectFile,
    onEnterXr,
    onExitXr,
    onBackToHub,
    onCameraViewChange,
    onTransformCommit,
    onToggleSelectEntity,
    transformOp = null,
    onStartTransform,
    onTransformCommitMany,
    onTransformCancel,
}) {
    const { open, toggle, isOpen } = useStudioPanelState()
    const { layout: vpLayout, split: vpSplit, close: vpClose, setRatio: vpSetRatio } = useViewportLayout()
    const [uiHidden, setUiHidden] = useState(false)
    const [viewportEditMode, setViewportEditMode] = useState('navigate')
    const [viewportGizmoMode, setViewportGizmoMode] = useState('translate')
    const [viewportGizmoAxis, setViewportGizmoAxis] = useState(null)
    const [viewportGizmoVisible, setViewportGizmoVisible] = useState(true)
    const [quickInsert, setQuickInsert] = useState(null)
    const [positions, setPositions] = useState(DEFAULT_POSITIONS)
    const [layoutKey, setLayoutKey] = useState(0)
    const [snapEdges, setSnapEdges] = useState(false)
    const fitToSelectionRef = useRef(null)
    const [showHelp, setShowHelp] = useState(false)

    const selectGizmoMode = useCallback((mode) => {
        setViewportGizmoMode(mode)
        setViewportGizmoAxis(null)
        setViewportGizmoVisible(true)
    }, [])

    const openRef = useRef(open)
    useEffect(() => { openRef.current = open }, [open])

    const resetLayout = useCallback(() => {
        setPositions(DEFAULT_POSITIONS())
        setLayoutKey((k) => k + 1)
    }, [])

    const tileLayout = useCallback(() => {
        const vw = window.innerWidth
        const openIds = [...openRef.current]
        const panelW = 280
        const gap = 10
        const margin = 16
        const cols = Math.max(1, Math.min(4, Math.floor((vw - 360) / (panelW + gap))))
        const next = {}
        openIds.forEach((id, i) => {
            next[id] = {
                x: margin + (i % cols) * (panelW + gap),
                y: margin + Math.floor(i / cols) * 220,
            }
        })
        setPositions((prev) => ({ ...prev, ...next }))
        setLayoutKey((k) => k + 1)
    }, [])

    const stackLeft = useCallback(() => {
        const openIds = [...openRef.current]
        const next = {}
        openIds.forEach((id, i) => { next[id] = { x: 16, y: 16 + i * 38 } })
        setPositions((prev) => ({ ...prev, ...next }))
        setLayoutKey((k) => k + 1)
    }, [])

    const stackRight = useCallback(() => {
        const vw = window.innerWidth
        const openIds = [...openRef.current]
        const next = {}
        openIds.forEach((id, i) => { next[id] = { x: vw - 296, y: 16 + i * 38 } })
        setPositions((prev) => ({ ...prev, ...next }))
        setLayoutKey((k) => k + 1)
    }, [])

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
            if (e.key === 'e' || e.key === 'E' || e.key === 'Tab') {
                e.preventDefault()
                setViewportEditMode((m) => (m === 'navigate' ? 'edit' : 'navigate'))
            }
            if (e.key === 'Escape' && quickInsert) {
                setQuickInsert(null)
            }
            if (e.key === 'Escape') {
                setShowHelp(false)
            }
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                setShowHelp((v) => !v)
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                onDeleteSelected?.()
            }
            if (e.shiftKey && (e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                onDuplicateSelected?.()
            }
            if ((e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                const targets = selectedEntityIds.length ? selectedEntityIds : []
                const ents = entities?.filter((en) => targets.includes(en.id)) || []
                if (ents.length && fitToSelectionRef.current) {
                    const box = new Box3()
                    for (const en of ents) {
                        const t = en.components?.transform || {}
                        const pos = new Vector3(...(t.position || [0, 0, 0]))
                        const scale = new Vector3(...(t.scale || [1, 1, 1]))
                        const half = scale.clone().multiplyScalar(0.5)
                        box.expandByPoint(pos.clone().sub(half))
                        box.expandByPoint(pos.clone().add(half))
                    }
                    fitToSelectionRef.current(box)
                }
            }
            // G/R/S: show the drag-handle gizmo in the matching mode.
            // X/Y/Z with a selection: arm the V1 modal pre-seeded with the current
            // gizmo mode + chosen axis (mouse delta moves on that axis immediately).
            // ModalTransform's capture listener owns X/Y/Z once a session is running.
            // T toggles gizmo visibility.
            if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const modeForKey = (e.key === 'g' || e.key === 'G') ? 'translate'
                    : (e.key === 'r' || e.key === 'R') ? 'rotate'
                    : (e.key === 's' || e.key === 'S') ? 'scale'
                    : null
                if (modeForKey) {
                    e.preventDefault()
                    selectGizmoMode(modeForKey)
                } else if (['x', 'y', 'z', 'a'].includes(e.key.toLowerCase()) && !transformOp) {
                    e.preventDefault()
                    e.stopImmediatePropagation()
                    const key = e.key.toLowerCase()
                    const axis = key === 'a' ? 'all' : key
                    if (selectedEntityIds.length > 0 && onStartTransform) {
                        // Arm the V1 modal using the current gizmo mode + this axis
                        onStartTransform(viewportGizmoMode, axis)
                    } else if (axis !== 'all') {
                        // No selection: just constrain the drag-handle gizmo axis (not meaningful for 'all')
                        setViewportGizmoAxis((current) => current === axis ? null : axis)
                        setViewportGizmoVisible(true)
                    }
                } else if (e.key === 't' || e.key === 'T') {
                    e.preventDefault()
                    setViewportGizmoVisible((v) => !v)
                }
            }
            // Arrangement hotkeys (Shift+A = tile, Shift+R = reset)
            if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault()
                tileLayout()
            }
            if (e.shiftKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault()
                resetLayout()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [quickInsert, tileLayout, resetLayout, selectGizmoMode, viewportEditMode, selectedEntityIds, onStartTransform, transformOp, viewportGizmoMode, onDeleteSelected, onDuplicateSelected, entities])

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
        <button
            className="scc-btn spa-btn-wide insp-delete-btn"
            disabled={!selectedEntity}
            onClick={onDeleteSelected}
        >
            × Delete entity
        </button>
    )

    const viewportShared = {
        document,
        selectedEntityId,
        selectedEntityIds,
        onSelectEntity,
        onToggleSelectEntity,
        cursors: presence?.cursors,
        onCursorMove: presence?.emitCursor,
        onCursorLeave: presence?.clearCursor,
        xrStore: xrState?.xrStore,
        editMode: viewportEditMode,
        gizmoMode: viewportGizmoMode,
        gizmoAxis: viewportGizmoAxis,
        gizmoVisible: viewportGizmoVisible,
        transformOp,
        onTransformCommit,
        onTransformCommitMany,
        onTransformCancel,
        fitToSelectionRef,
        showHelp,
        onShowHelp: () => setShowHelp(true),
        onCloseHelp: () => setShowHelp(false),
    }

    return (
        <div className="sfp-root" onDoubleClick={handleViewportDoubleClick} role="application" aria-label="3D viewport">
            <StudioViewportLayout
                layout={vpLayout}
                onSplit={vpSplit}
                onClose={vpClose}
                onSetRatio={vpSetRatio}
                shared={viewportShared}
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
                        <StudioFloatingPanel key={`library-${layoutKey}`} title="Library" onClose={() => toggle('library')} initialPosition={positions.library} initialWidth={260} snapEdges={snapEdges}>
                            <LibraryPanel onCreateEntity={onCreateEntity} onAssetFilesSelected={onAssetFilesSelected} canDeleteSelection={Boolean(selectedEntity)} onDeleteSelected={onDeleteSelected} />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('assets') && (
                        <StudioFloatingPanel key={`assets-${layoutKey}`} title="Assets" onClose={() => toggle('assets')} initialPosition={positions.assets} initialWidth={260} snapEdges={snapEdges}>
                            <AssetsPanel assets={assetOptions} spaceAssets={spaceAssets} onAssetFilesSelected={onAssetFilesSelected} onCreateFromAsset={onCreateFromAsset} />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('files') && (
                        <StudioFloatingPanel key={`files-${layoutKey}`} title="Files" onClose={() => toggle('files')} initialPosition={positions.files} initialWidth={480} minWidth={320} maxWidth={800} snapEdges={snapEdges}>
                            <FilesPanel presentationState={document?.presentationState} onPresentationPatch={onPresentationPatch} spaceAssets={spaceAssets} />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('inspector') && (
                        <StudioFloatingPanel key={`inspector-${layoutKey}`} title="Inspector" onClose={() => toggle('inspector')} initialPosition={positions.inspector} initialWidth={280} snapEdges={snapEdges}>
                            <StudioInspector
                                title={selectedEntityIds.length > 1 ? `${selectedEntityIds.length} selected` : (selectedEntity ? selectedEntity.name : 'World')}
                                subtitle={selectedEntityIds.length > 1 ? `Primary: ${selectedEntity?.name || selectedEntityId}` : (selectedEntity ? selectedEntity.type : 'Project defaults')}
                                sections={inspectorSections}
                                values={inspectorValues}
                                assetOptions={assetOptions}
                                onSectionChange={onInspectorChange}
                                footer={inspectorFooter}
                            />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('structure') && (
                        <StudioFloatingPanel key={`structure-${layoutKey}`} title="Structure" onClose={() => toggle('structure')} initialPosition={positions.structure} initialWidth={240} snapEdges={snapEdges}>
                            <StructurePanel
                                entities={entities}
                                selectedEntityId={selectedEntityId}
                                selectedEntityIds={selectedEntityIds}
                                onSelectEntity={onSelectEntity}
                                onToggleSelectEntity={onToggleSelectEntity}
                            />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('present') && (
                        <StudioFloatingPanel key={`present-${layoutKey}`} title="Present" onClose={() => toggle('present')} initialPosition={positions.present} initialWidth={360} minWidth={300} maxWidth={700} snapEdges={snapEdges}>
                            <PresentPanel presentationState={document?.presentationState} onPresentationPatch={onPresentationPatch} onSaveCurrentCamera={onSaveCurrentCamera} />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('publish') && (
                        <StudioFloatingPanel key={`publish-${layoutKey}`} title="Publish" onClose={() => toggle('publish')} initialPosition={positions.publish} initialWidth={360} minWidth={300} snapEdges={snapEdges}>
                            <PublishPanel document={document} publishState={document?.publishState} liveProjectState={liveProjectState} onPublishPatch={onPublishPatch} onSetLiveProject={onSetLiveProject} onClearLiveProject={onClearLiveProject} onCopyShareLink={onCopyShareLink} onExportProject={onExportProject} exportStatus={exportStatus} onImportProjectFile={onImportProjectFile} xrState={xrState} onEnterXr={onEnterXr} onExitXr={onExitXr} />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('activity') && (
                        <StudioFloatingPanel key={`activity-${layoutKey}`} title="Activity" onClose={() => toggle('activity')} initialPosition={positions.activity} initialWidth={260} snapEdges={snapEdges}>
                            <ActivityPanel activity={syncState?.activity} />
                        </StudioFloatingPanel>
                    )}
                    {isOpen('world') && (
                        <StudioFloatingPanel key={`world-${layoutKey}`} title="World" onClose={() => toggle('world')} initialPosition={positions.world} initialWidth={280} snapEdges={snapEdges}>
                            <ProjectPanel document={document} displayName={displayName} onDisplayNameChange={onDisplayNameChange} onProjectMetaPatch={onProjectMetaPatch} onWorldPatch={onWorldPatch} onRenderSettingsPatch={onRenderSettingsPatch} onOpenHub={onBackToHub} />
                        </StudioFloatingPanel>
                    )}

                    <StudioControlCluster
                        spaceName={liveProjectState?.spaceLabel || 'Studio'}
                        projectName={document?.projectMeta?.title || document?.projectMeta?.id || ''}
                        onViewLive={onViewLive}
                        canViewLive={Boolean(liveProjectState?.isLiveProject)}
                        editMode={viewportEditMode}
                        onSetEditMode={setViewportEditMode}
                        gizmoMode={viewportGizmoMode}
                        onSetGizmoMode={selectGizmoMode}
                        openPanels={open}
                        onTogglePanel={toggle}
                        onFullscreen={handleFullscreen}
                        onHideUI={() => setUiHidden(true)}
                        onBackToHub={onBackToHub}
                        xrState={xrState}
                        syncState={syncState}
                        presence={presence}
                        snapEdges={snapEdges}
                        onToggleSnap={() => setSnapEdges((v) => !v)}
                        onTileLayout={tileLayout}
                        onStackLeft={stackLeft}
                        onStackRight={stackRight}
                        onResetLayout={resetLayout}
                        onShowHelp={() => setShowHelp(true)}
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
