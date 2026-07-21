import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import StudioInspector from './StudioInspector.jsx'
import StudioViewportLayout from './StudioViewportLayout.jsx'
import StudioFloatingPanel from './StudioFloatingPanel.jsx'
import StudioControlCluster from './StudioControlCluster.jsx'
import StudioProjectsPanel from './StudioProjectsPanel.jsx'
import StudioQuickInsert from './StudioQuickInsert.jsx'
import { useStudioPanelState } from '../hooks/useStudioPanelState.js'
import useAuthSession from '../../hooks/useAuthSession.js'
import StudioCoachMarks from './StudioCoachMarks.jsx'
import { loadStudioWorkspace, saveStudioWorkspace } from '../utils/studioWorkspaceStorage.js'
import '../styles/studio-mobile.css'
import { canPlaceInScene } from '../utils/assetFormats.js'
import { useViewportLayout } from '../hooks/useViewportLayout.js'
import { isJamProject, loadJamAllTools, saveJamAllTools } from '../utils/jamMode.js'
import { JAM_PRIMITIVES } from '../utils/entityPalette.js'
import {
    AssetsPanel,
    FilesPanel,
    HistoryPanel,
    JamEditPanel,
    LibraryPanel,
    ProjectPanel,
    PublishPanel,
    StructurePanel,
    TimelinePanel,
} from './StudioShellPanels.jsx'

// Raycast a viewport double-click into the scene's ground plane (y=0) so a
// quick-inserted entity lands where the cursor pointed, not at a fixed default.
// Returns null when the camera/canvas isn't resolvable or the ray misses the
// plane (e.g. looking up at the horizon) — callers fall back to view placement.
// The five Studio windows, as a phone bottom nav (order = frequency of use).
const MOBILE_PANELS = [
    ['create', 'Create'],
    ['scene', 'Scene'],
    ['world', 'World'],
    ['publish', 'Share'],
    ['files', 'Code']
]

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0)
const groundRaycaster = new Raycaster()
const computeGroundPoint = (event, controlsRef) => {
    const camera = controlsRef?.current?.camera
    const canvas = event.target?.closest?.('.studio-viewport-shell')?.querySelector('canvas')
    if (!camera || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    groundRaycaster.setFromCamera(ndc, camera)
    const hit = new Vector3()
    return groundRaycaster.ray.intersectPlane(GROUND_PLANE, hit) ? [hit.x, 0, hit.z] : null
}

const DEFAULT_POSITIONS = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const midY = Math.round(vh * 0.48)
    const rightX = Math.max(290, vw - 700)   // 20px left of cluster (cluster at vw-400, width≤280)
    return {
        create:  { x: 16,                    y: 90 },
        scene:   { x: rightX,                y: 90 },
        jamedit: { x: rightX,                y: 90 },
        world:   { x: rightX,                y: midY + 30 },
        publish: { x: Math.round(vw * 0.55), y: midY },
        files:   { x: Math.round(vw * 0.3),  y: 90 },
        projects:{ x: 16,                    y: midY },
    }
}

// Pre-consolidation ids from persisted workspaces map onto the five windows.
const PANEL_ID_MIGRATION = {
    library: 'create', assets: 'create',
    structure: 'scene', inspector: 'scene',
    activity: 'publish', present: 'publish',
}
const migratePanelIds = (ids) => (Array.isArray(ids) ? ids.map((id) => PANEL_ID_MIGRATION[id] || id) : ids)

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
    spaceOptions = [],
    libraryItems = [],
    onDeleteLibraryItem,
    presence,
    syncState,
    isDesktop,
    isMobile,
    cameraView,
    controlsRef,
    paneControlsRef,
    xrState,
    onCreateEntity,
    onCreateFromAsset,
    onAssetFilesSelected,
    onDriveImportUrl,
    onDriveImportSelection,
    onToggleAssetShared,
    onCommonsImport,
    onDeleteSelected,
    onGroupSelected,
    onUngroup,
    onRenameEntity,
    onToggleEntityVisible,
    onToggleEntityLocked,
    onReparentEntity,
    onViewportDropFiles,
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
    onMakeSpacePublic,
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
    editHistory = null,
    onHistoryJump,
}) {
    const persistedWorkspace = useMemo(() => loadStudioWorkspace(), [])
    const { open, toggle, isOpen } = useStudioPanelState(migratePanelIds(persistedWorkspace?.open))
    const { layout: vpLayout, split: vpSplit, close: vpClose, setRatio: vpSetRatio } = useViewportLayout()
    const [uiHidden, setUiHidden] = useState(false)
    const [viewportEditMode, setViewportEditMode] = useState('navigate')
    const [viewportGizmoMode, setViewportGizmoMode] = useState('translate')
    const [viewportGizmoAxis, setViewportGizmoAxis] = useState(null)
    const [viewportGizmoVisible, setViewportGizmoVisible] = useState(true)
    const [quickInsert, setQuickInsert] = useState(null)
    const [positions, setPositions] = useState(() => ({ ...DEFAULT_POSITIONS(), ...(persistedWorkspace?.positions || {}) }))
    const [panelSizes, setPanelSizes] = useState(() => ({ ...(persistedWorkspace?.sizes || {}) }))
    const [collapsedPanels, setCollapsedPanels] = useState(() => new Set(persistedWorkspace?.collapsed || []))
    const [layoutKey, setLayoutKey] = useState(0)
    const [snapEdges, setSnapEdges] = useState(persistedWorkspace?.snapEdges ?? false)

    // Remember the workspace across sessions — open panels, dragged positions,
    // resized dimensions, collapsed headers, snap preference. Arrange actions
    // (tile/stack/reset) flow through the same state, so they persist too.
    useEffect(() => {
        saveStudioWorkspace({ open, positions, sizes: panelSizes, collapsed: collapsedPanels, snapEdges })
    }, [open, positions, panelSizes, collapsedPanels, snapEdges])

    const recordPanelPosition = useCallback((id) => (pos) => {
        setPositions((prev) => ({ ...prev, [id]: pos }))
    }, [])

    const recordPanelSize = useCallback((id) => (size) => {
        setPanelSizes((prev) => ({ ...prev, [id]: size }))
    }, [])

    const recordPanelCollapsed = useCallback((id) => (isCollapsed) => {
        setCollapsedPanels((prev) => {
            const next = new Set(prev)
            if (isCollapsed) next.add(id)
            else next.delete(id)
            return next
        })
    }, [])

    // Everything a panel needs to restore and persist its own chrome. A saved
    // width wins over the call site's default; when none is saved the key is
    // omitted so the site-specific initialWidth stays in effect.
    const panelChrome = useCallback((id) => ({
        initialPosition: positions[id],
        ...(panelSizes[id]?.width ? { initialWidth: panelSizes[id].width } : {}),
        initialHeight: panelSizes[id]?.height ?? null,
        initialCollapsed: collapsedPanels.has(id),
        onPositionChange: recordPanelPosition(id),
        onSizeChange: recordPanelSize(id),
        onCollapsedChange: recordPanelCollapsed(id),
        snapEdges
    }), [positions, panelSizes, collapsedPanels, snapEdges, recordPanelPosition, recordPanelSize, recordPanelCollapsed])

    const openRefForPlacement = useRef(open)
    useEffect(() => { openRefForPlacement.current = open }, [open])

    // Opening a panel on top of an already-open one buries it; cascade the
    // newcomer to a free spot instead. Dragged spots and arrange actions are
    // untouched — this only affects the moment a panel opens.
    const handleTogglePanel = useCallback((id) => {
        if (!openRefForPlacement.current.has(id)) {
            setPositions((prev) => {
                const occupied = [...openRefForPlacement.current].map((key) => prev[key]).filter(Boolean)
                const collides = (p) => occupied.some((o) => Math.abs(o.x - p.x) < 24 && Math.abs(o.y - p.y) < 24)
                let pos = prev[id] || DEFAULT_POSITIONS()[id] || { x: 16, y: 90 }
                let guard = 0
                while (collides(pos) && guard < 30) {
                    pos = { x: pos.x + 28, y: pos.y + 28 }
                    guard += 1
                }
                if (pos === prev[id]) return prev
                return { ...prev, [id]: pos }
            })
        }
        toggle(id)
    }, [toggle])
    const [showHelp, setShowHelp] = useState(false)
    const [mobileSheet, setMobileSheet] = useState(null)
    const { type: authType } = useAuthSession()

    // Minimal jam mode (see utils/jamMode.js): at the communal open-jam
    // project, strip the editor down to the common tools — unless this device
    // opted back into the full editor via the "All tools" toggle.
    const isJam = isJamProject(document?.projectMeta?.id)
    const [jamAllTools, setJamAllTools] = useState(loadJamAllTools)
    const jamMinimal = isJam && !jamAllTools
    const handleToggleJamTools = useCallback(() => {
        setJamAllTools((prev) => {
            const next = !prev
            saveJamAllTools(next)
            return next
        })
    }, [])
    // Jam phones get Create plus a tiny Edit tab (text/color/remove) — the
    // full Scene sheet stays hidden.
    const mobilePanels = jamMinimal
        ? [...MOBILE_PANELS.filter(([id]) => id === 'create'), ['jamedit', 'Edit']]
        : MOBILE_PANELS

    // Guest first-run guidance is the action-completed coach pill
    // (StudioCoachMarks, rendered below) — the help dialog no longer
    // auto-opens over the scene; it stays behind ?.

    const selectGizmoMode = useCallback((mode) => {
        setViewportGizmoMode(mode)
        setViewportGizmoAxis(null)
        setViewportGizmoVisible(true)
    }, [])

    const openRef = useRef(open)
    useEffect(() => { openRef.current = open }, [open])

    const resetLayout = useCallback(() => {
        setPositions(DEFAULT_POSITIONS())
        setPanelSizes({})
        setCollapsedPanels(new Set())
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
            // Delete/Backspace, Shift+D, and F/"." (frame selected) are owned by
            // StudioEditor's keydown handler (which also guards selection and
            // modal transforms) — binding them here too fired twice per keypress.
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
    }, [quickInsert, tileLayout, resetLayout, selectGizmoMode, viewportEditMode, selectedEntityIds, onStartTransform, transformOp, viewportGizmoMode, entities])

    const handleViewportDoubleClick = useCallback((e) => {
        if (e.target.closest('.sfp-shell, .scc-wrap, button, input, textarea, [role="button"]')) return
        setQuickInsert({ x: e.clientX, y: e.clientY, worldPos: computeGroundPoint(e, controlsRef) })
    }, [controlsRef])

    // Drop targets: OS files and Files-list items land in the scene at the
    // ground point under the cursor (same raycast as double-click Quick Insert).
    const handleViewportDragOver = useCallback((e) => {
        if (!e.target.closest?.('.studio-viewport-shell')) return
        const types = e.dataTransfer?.types || []
        if (types.includes('Files') || types.includes('application/x-dii-asset')) e.preventDefault()
    }, [])

    const handleViewportDrop = useCallback((e) => {
        if (!e.target.closest?.('.studio-viewport-shell')) return
        const worldPos = computeGroundPoint(e, controlsRef)
        const files = Array.from(e.dataTransfer?.files || [])
        if (files.length) {
            e.preventDefault()
            onViewportDropFiles?.(files, worldPos)
            return
        }
        const assetId = e.dataTransfer?.getData('application/x-dii-asset')
        if (!assetId) return
        e.preventDefault()
        const item = libraryItems.find((a) => a.id === assetId)
        if (item && canPlaceInScene(item)) onCreateFromAsset?.(item, worldPos)
    }, [controlsRef, libraryItems, onCreateFromAsset, onViewportDropFiles])

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
        paneControlsRef,
        initialCameraView: cameraView,
        showHelp,
        onShowHelp: () => setShowHelp(true),
        onCloseHelp: () => setShowHelp(false),
    }

    // One source of truth for each window's content, shared by the desktop
    // floating panels and the mobile bottom sheet (slice 7: Studio on phones).
    const panelBodies = {
        // Jam mode: upload + a few simple shapes only — no lights, no Drive/
        // Commons imports, no share/delete controls (all prop-gated away).
        create: jamMinimal ? (
            <>
                            <LibraryPanel onCreateEntity={onCreateEntity} primitives={JAM_PRIMITIVES} lights={[]} />
                            <AssetsPanel libraryItems={libraryItems} onAssetFilesSelected={onAssetFilesSelected} onCreateFromAsset={onCreateFromAsset} />
            </>
        ) : (
            <>
                            <LibraryPanel onCreateEntity={onCreateEntity} />
                            <AssetsPanel libraryItems={libraryItems} onAssetFilesSelected={onAssetFilesSelected} onCreateFromAsset={onCreateFromAsset} onDriveImportUrl={onDriveImportUrl} onDriveImportSelection={onDriveImportSelection} onToggleAssetShared={onToggleAssetShared} onCommonsImport={onCommonsImport} onDeleteLibraryItem={onDeleteLibraryItem} />
            </>
        ),
        jamedit: (
            <JamEditPanel entity={selectedEntity} onInspectorChange={onInspectorChange} onDeleteSelected={selectedEntity ? onDeleteSelected : null} />
        ),
        scene: (
            <>
                            <StructurePanel
                                entities={entities}
                                selectedEntityId={selectedEntityId}
                                selectedEntityIds={selectedEntityIds}
                                onSelectEntity={onSelectEntity}
                                onToggleSelectEntity={onToggleSelectEntity}
                                onGroupSelected={onGroupSelected}
                                onUngroup={onUngroup}
                                onRenameEntity={onRenameEntity}
                                onToggleEntityVisible={onToggleEntityVisible}
                                onToggleEntityLocked={onToggleEntityLocked}
                                onReparentEntity={onReparentEntity}
                            />
                            {(selectedEntity || selectedEntityIds.length > 0) ? (
                                <StudioInspector
                                    title={selectedEntityIds.length > 1 ? `${selectedEntityIds.length} selected` : (selectedEntity ? selectedEntity.name : 'World')}
                                    subtitle={selectedEntityIds.length > 1 ? `Primary: ${selectedEntity?.name || selectedEntityId}` : (selectedEntity ? selectedEntity.type : 'Project defaults')}
                                    sections={inspectorSections}
                                    values={inspectorValues}
                                    assetOptions={assetOptions}
                                    spaceOptions={spaceOptions}
                                    onSectionChange={onInspectorChange}
                                    footer={inspectorFooter}
                                />
                            ) : (
                                <p className="sfp-empty">Select an entity above or in the viewport to edit it.</p>
                            )}
                            {selectedEntity && selectedEntityIds.length <= 1 && (
                                <TimelinePanel
                                    entity={selectedEntity}
                                    onTimelineChange={(next) => onInspectorChange?.('timeline', next)}
                                />
                            )}
                            {editHistory && (
                                <HistoryPanel steps={editHistory.steps} cursor={editHistory.cursor} onJumpTo={onHistoryJump} />
                            )}
            </>
        ),
        files: (
            <>
                            <FilesPanel presentationState={document?.presentationState} onPresentationPatch={onPresentationPatch} libraryItems={libraryItems} />
            </>
        ),
        publish: (
            <>
                            <PublishPanel document={document} publishState={document?.publishState} liveProjectState={liveProjectState} onPublishPatch={onPublishPatch} onSetLiveProject={onSetLiveProject} onClearLiveProject={onClearLiveProject} onMakeSpacePublic={onMakeSpacePublic} onCopyShareLink={onCopyShareLink} onExportProject={onExportProject} exportStatus={exportStatus} onImportProjectFile={onImportProjectFile} xrState={xrState} presentationState={document?.presentationState} onPresentationPatch={onPresentationPatch} onSaveCurrentCamera={onSaveCurrentCamera} activity={syncState?.activity} />
            </>
        ),
        world: (
            <>
                            <ProjectPanel document={document} displayName={displayName} onDisplayNameChange={onDisplayNameChange} onProjectMetaPatch={onProjectMetaPatch} onWorldPatch={onWorldPatch} onRenderSettingsPatch={onRenderSettingsPatch} onOpenHub={onBackToHub} />
            </>
        )
    }

    return (
        <div className="sfp-root" onDoubleClick={handleViewportDoubleClick} onDragOver={handleViewportDragOver} onDrop={handleViewportDrop} role="application" aria-label="3D viewport">
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

            {!uiHidden && !isMobile && (
                <>
                    {isOpen('create') && (
                        <StudioFloatingPanel key={`create-${layoutKey}`} title="Create" onClose={() => toggle('create')} initialWidth={280} {...panelChrome('create')}>
                            {panelBodies.create}
                        </StudioFloatingPanel>
                    )}
                    {jamMinimal && selectedEntity && (
                        <StudioFloatingPanel key={`jamedit-${layoutKey}`} title={selectedEntity.name || 'Edit'} onClose={() => onSelectEntity?.(null)} initialWidth={240} {...panelChrome('jamedit')}>
                            {panelBodies.jamedit}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && isOpen('scene') && (
                        <StudioFloatingPanel key={`scene-${layoutKey}`} title="Scene" onClose={() => toggle('scene')} initialWidth={300} {...panelChrome('scene')}>
                            {panelBodies.scene}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && isOpen('files') && (
                        <StudioFloatingPanel key={`files-${layoutKey}`} title="Code" onClose={() => toggle('files')} initialWidth={480} minWidth={320} maxWidth={800} {...panelChrome('files')}>
                            {panelBodies.files}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && isOpen('publish') && (
                        <StudioFloatingPanel key={`publish-${layoutKey}`} title="Share" onClose={() => toggle('publish')} initialWidth={360} minWidth={300} {...panelChrome('publish')}>
                            {panelBodies.publish}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && isOpen('world') && (
                        <StudioFloatingPanel key={`world-${layoutKey}`} title="World" onClose={() => toggle('world')} initialWidth={280} {...panelChrome('world')}>
                            {panelBodies.world}
                        </StudioFloatingPanel>
                    )}
                    {!jamMinimal && isOpen('projects') && (
                        <StudioFloatingPanel key={`projects-${layoutKey}`} title="Projects" onClose={() => toggle('projects')} initialWidth={260} {...panelChrome('projects')}>
                            <StudioProjectsPanel
                                spaceId={document?.projectMeta?.spaceId}
                                currentProjectId={document?.projectMeta?.id}
                            />
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
                        onTogglePanel={handleTogglePanel}
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
                        panelKeys={jamMinimal ? ['create'] : null}
                        minimal={jamMinimal}
                        allTools={jamAllTools}
                        onToggleAllTools={isJam ? handleToggleJamTools : null}
                    />
                </>
            )}

            {!uiHidden && isMobile && (
                <>
                    <div className="smb-topbar">
                        {!jamMinimal && (
                            <button type="button" className="smb-top-btn" onClick={onBackToHub} aria-label="Back to projects">←</button>
                        )}
                        <span className="smb-title">{document?.projectMeta?.title || liveProjectState?.spaceLabel || 'Project'}</span>
                        <button
                            type="button"
                            className={`smb-top-btn${viewportEditMode === 'edit' ? ' is-active' : ''}`}
                            onClick={() => setViewportEditMode((m) => (m === 'navigate' ? 'edit' : 'navigate'))}
                        >
                            {viewportEditMode === 'edit' ? 'Editing' : 'Edit'}
                        </button>
                    </div>
                    {mobileSheet && (
                        <div className="smb-sheet">
                            <div className="smb-sheet-head">
                                <span>{mobilePanels.find(([id]) => id === mobileSheet)?.[1]}</span>
                                <button type="button" onClick={() => setMobileSheet(null)} aria-label="Close panel">×</button>
                            </div>
                            <div className="smb-sheet-body">{panelBodies[mobileSheet]}</div>
                        </div>
                    )}
                    <nav className="smb-nav" aria-label="Studio windows">
                        {mobilePanels.map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                className={`smb-nav-btn${mobileSheet === id ? ' is-active' : ''}`}
                                onClick={() => setMobileSheet((current) => (current === id ? null : id))}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>
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
                    worldPos={quickInsert.worldPos}
                    onClose={() => setQuickInsert(null)}
                    onCreateEntity={onCreateEntity}
                    onCreateFromAsset={onCreateFromAsset}
                    assets={libraryItems.filter(canPlaceInScene)}
                    onOpenCreate={() => { if (!isOpen('create')) handleTogglePanel('create') }}
                    palette={jamMinimal ? JAM_PRIMITIVES : null}
                    moreLabel={jamMinimal ? 'More ▸' : undefined}
                />
            )}

            {!uiHidden && !loading && (
                <StudioCoachMarks
                    authType={authType}
                    entityCount={entities?.length || 0}
                    hasSelection={(selectedEntityIds?.length || 0) > 0 || Boolean(selectedEntityId)}
                    shareOpen={isOpen('publish') || mobileSheet === 'publish'}
                    isOpenJam={isJam}
                />
            )}
        </div>
    )
}
