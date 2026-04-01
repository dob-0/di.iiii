import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PropertyInspector from './PropertyInspector.jsx'
import DesktopWindow from './DesktopWindow.jsx'
import BetaViewport from './BetaViewport.jsx'
import { useProjectStore } from '../state/projectStore.js'
import { useProjectDocumentSync } from '../hooks/useProjectDocumentSync.js'
import { useProjectPresence } from '../hooks/useProjectPresence.js'
import { createEntityOfType, getInspectorSections } from '../entityRegistry.js'
import { buildBetaHubPath } from '../utils/betaRouting.js'
import { uploadBetaProjectAsset } from '../services/projectsApi.js'
import { getWorkspaceAdjustmentOps, getWorkspaceTopInset } from '../utils/windowLayout.js'

const DISPLAY_NAME_KEY = 'dii.beta.displayName'

const setWindowFocusPatch = (windowState, topZ) => ({
    zIndex: topZ,
    visible: true,
    minimized: false
})

const detectEntityTypeFromFile = (file) => {
    const mime = file?.type || file?.mimeType || ''
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    return 'model'
}

const getStarterPlacement = (count = 0) => [((count % 4) - 1.5) * 1.4, 0, Math.floor(count / 4) * -1.8]

function buildWindowPatch(document, windowId, patch = {}, focus = false) {
    const existing = document.windowLayout?.windows?.[windowId] || {}
    return {
        type: 'setWindowState',
        payload: {
            windowId,
            focus,
            patch: {
                ...existing,
                ...patch
            }
        }
    }
}

function BetaAssetsWindow({ assets, onUploadAssets, onCreateEntity }) {
    return (
        <div className="beta-window-stack">
            <label className="beta-file-button">
                <input type="file" multiple onChange={(event) => {
                    const files = Array.from(event.target.files || [])
                    onUploadAssets?.(files)
                    event.target.value = ''
                }} />
                Import Image / Video / Audio / Model
            </label>
            <div className="beta-primitive-row">
                {['box', 'sphere', 'cone', 'cylinder', 'text'].map((type) => (
                    <button key={type} type="button" onClick={() => onCreateEntity(type)}>{type}</button>
                ))}
            </div>
            <div className="beta-assets-list">
                {assets.length ? assets.map((asset) => (
                    <button key={asset.id} type="button" className="beta-asset-row" onClick={() => onCreateEntity(detectEntityTypeFromFile(asset), asset)}>
                        <strong>{asset.name}</strong>
                        <span>{asset.mimeType}</span>
                    </button>
                )) : <p className="beta-empty-state">No imported assets yet.</p>}
            </div>
        </div>
    )
}

function BetaOutlinerWindow({ entities, selectedEntityId, onSelect }) {
    return (
        <ul className="beta-outliner">
            {entities.map((entity) => (
                <li key={entity.id}>
                    <button type="button" className={entity.id === selectedEntityId ? 'is-active' : ''} onClick={() => onSelect(entity.id)}>
                        <strong>{entity.name}</strong>
                        <span>{entity.type}</span>
                    </button>
                </li>
            ))}
        </ul>
    )
}

function BetaActivityWindow({ activity }) {
    return (
        <div className="beta-activity-list">
            {activity.length ? activity.map((entry) => (
                <article key={entry.id} className={`beta-activity-row is-${entry.level}`}>
                    <strong>{entry.level}</strong>
                    <p>{entry.message}</p>
                </article>
            )) : <p className="beta-empty-state">No project activity yet.</p>}
        </div>
    )
}

function BetaProjectWindow({ document, displayName, onDisplayNameChange, onProjectMetaPatch, onWorldStatePatch }) {
    return (
        <div className="beta-window-stack">
            <label className="beta-property-field">
                <span>Display Name</span>
                <input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />
            </label>
            <label className="beta-property-field">
                <span>Project Title</span>
                <input
                    value={document.projectMeta?.title || ''}
                    onChange={(event) => onProjectMetaPatch({ title: event.target.value })}
                />
            </label>
            <label className="beta-property-field">
                <span>Background</span>
                <input
                    type="color"
                    value={document.worldState?.backgroundColor || '#ebe7df'}
                    onChange={(event) => onWorldStatePatch({ backgroundColor: event.target.value })}
                />
            </label>
            <label className="beta-property-field beta-checkbox-field">
                <span>Grid Visible</span>
                <input
                    type="checkbox"
                    checked={document.worldState?.gridVisible !== false}
                    onChange={(event) => onWorldStatePatch({ gridVisible: event.target.checked })}
                />
            </label>
        </div>
    )
}

export default function BetaEditor({ projectId }) {
    const [displayName, setDisplayName] = useState(() => {
        try {
            return window.localStorage.getItem(DISPLAY_NAME_KEY) || ''
        } catch {
            return ''
        }
    })
    const store = useProjectStore()
    const { state, dispatch } = store
    const projectSync = useProjectDocumentSync({ projectId, store })
    const { applyLocalOps } = projectSync
    const presence = useProjectPresence({ projectId, displayName })
    const topbarRef = useRef(null)
    const [workspaceTop, setWorkspaceTop] = useState(168)

    const document = state.document
    const entities = document.entities || []
    const selectedEntity = entities.find((entity) => entity.id === state.selectedEntityId) || null
    const visibleWindows = useMemo(() => Object.values(document.windowLayout?.windows || {}).filter((entry) => entry.visible), [document.windowLayout])
    const topZIndex = useMemo(() => Math.max(6, ...Object.values(document.windowLayout?.windows || {}).map((entry) => entry.zIndex || 1)), [document.windowLayout])

    useLayoutEffect(() => {
        const updateWorkspaceTop = () => {
            setWorkspaceTop(getWorkspaceTopInset({
                topbarRect: topbarRef.current?.getBoundingClientRect?.()
            }))
        }

        updateWorkspaceTop()
        window.addEventListener('resize', updateWorkspaceTop)

        let resizeObserver = null
        if (typeof ResizeObserver !== 'undefined' && topbarRef.current) {
            resizeObserver = new ResizeObserver(updateWorkspaceTop)
            resizeObserver.observe(topbarRef.current)
        }

        return () => {
            window.removeEventListener('resize', updateWorkspaceTop)
            resizeObserver?.disconnect?.()
        }
    }, [presence.users.length])

    useEffect(() => {
        const overlappingWindows = getWorkspaceAdjustmentOps(visibleWindows, workspaceTop)
        if (!overlappingWindows.length) return
        applyLocalOps(overlappingWindows.map(({ windowId, patch }) => (
            buildWindowPatch(document, windowId, patch)
        )))
    }, [applyLocalOps, document, visibleWindows, workspaceTop])

    const pushWindowOp = (windowId, patch = {}, focus = false) => {
        applyLocalOps(buildWindowPatch(document, windowId, patch, focus))
    }

    const handleCreateEntity = (type, asset = null) => {
        const entity = createEntityOfType(type, {
            name: asset?.name ? asset.name.replace(/\.[^.]+$/, '') : undefined,
            components: {
                transform: {
                    position: getStarterPlacement(entities.length)
                },
                ...(asset ? {
                    media: {
                        assetId: asset.id,
                        autoplay: type !== 'image',
                        loop: true,
                        muted: type === 'video'
                    }
                } : {})
            }
        })
        applyLocalOps({
            type: 'createEntity',
            payload: { entity }
        }, { activityMessage: `Created ${entity.type} entity.` })
        dispatch({ type: 'select-entity', entityId: entity.id })
    }

    const handleUploadAssets = async (files = []) => {
        for (const file of files) {
            const asset = await uploadBetaProjectAsset(projectId, file)
            applyLocalOps({
                type: 'upsertAsset',
                payload: { asset }
            }, { activityMessage: `Imported ${file.name}.` })
            handleCreateEntity(detectEntityTypeFromFile(file), asset)
        }
    }

    const handleInspectorChange = (component, nextComponentValue) => {
        if (!selectedEntity) return
        applyLocalOps({
            type: 'updateComponent',
            payload: {
                entityId: selectedEntity.id,
                component,
                patch: nextComponentValue
            }
        })
    }

    const handleWorldPatch = (patch) => {
        applyLocalOps({
            type: 'setWorldState',
            payload: { patch }
        })
    }

    const handleProjectMetaPatch = (patch) => {
        applyLocalOps({
            type: 'setProjectMeta',
            payload: { patch }
        })
    }

    const handleDeleteSelected = () => {
        if (!selectedEntity) return
        applyLocalOps({
            type: 'deleteEntity',
            payload: { entityId: selectedEntity.id }
        }, { activityMessage: `Deleted ${selectedEntity.name}.`, activityLevel: 'warning' })
        dispatch({ type: 'select-entity', entityId: null })
    }

    const inspectorSections = selectedEntity
        ? getInspectorSections(selectedEntity)
        : [
            {
                id: 'worldState',
                label: 'World',
                fields: [
                    { label: 'Background', component: 'worldState', path: ['backgroundColor'], type: 'color' },
                    { label: 'Grid Visible', component: 'worldState', path: ['gridVisible'], type: 'checkbox' },
                    { label: 'Grid Size', component: 'worldState', path: ['gridSize'], type: 'number', min: 1, step: 1 }
                ]
            }
        ]

    const inspectorValues = selectedEntity ? selectedEntity.components : { worldState: document.worldState }

    return (
        <main className="beta-editor-shell">
            <header className="beta-topbar" ref={topbarRef}>
                <div>
                    <span className="beta-chip">Beta V2</span>
                    <h1>{document.projectMeta?.title || 'Beta Project'}</h1>
                    <p>{projectId}</p>
                </div>
                <div className="beta-topbar-status">
                    <span className={`beta-status-pill is-${presence.presenceState}`}>Presence: {presence.presenceState}</span>
                    <span className={`beta-status-pill is-${state.sceneStreamState}`}>Stream: {state.sceneStreamState}</span>
                    <span className="beta-status-pill">Users: {presence.users.length}</span>
                </div>
                <div className="beta-topbar-actions">
                    <button type="button" onClick={() => window.history.pushState({}, '', buildBetaHubPath()) || window.dispatchEvent(new PopStateEvent('popstate'))}>
                        Hub
                    </button>
                    <button type="button" onClick={handleDeleteSelected} disabled={!selectedEntity}>Delete Selected</button>
                    {Object.values(document.windowLayout?.windows || {}).map((windowState) => (
                        <button key={windowState.id} type="button" onClick={() => pushWindowOp(windowState.id, setWindowFocusPatch(windowState, topZIndex + 1), true)}>
                            {windowState.title}
                        </button>
                    ))}
                </div>
                <div className="beta-topbar-roster">
                    {presence.users.map((user) => (
                        <span key={user.socketId || user.userId} className="beta-user-pill">
                            {user.userName}
                        </span>
                    ))}
                </div>
            </header>

            {state.loading ? <div className="beta-overlay-message">Loading project…</div> : null}
            {state.loadError ? <div className="beta-overlay-message is-error">{state.loadError}</div> : null}

            {visibleWindows.map((windowState) => {
                let content = null
                if (windowState.id === 'viewport') {
                    content = (
                        <BetaViewport
                            document={document}
                            selectedEntityId={state.selectedEntityId}
                            onSelectEntity={(entityId) => dispatch({ type: 'select-entity', entityId })}
                            cursors={presence.cursors}
                            onCursorMove={presence.emitCursor}
                            onCursorLeave={presence.clearCursor}
                        />
                    )
                } else if (windowState.id === 'assets') {
                    content = (
                        <BetaAssetsWindow
                            assets={document.assets || []}
                            onUploadAssets={handleUploadAssets}
                            onCreateEntity={handleCreateEntity}
                        />
                    )
                } else if (windowState.id === 'inspector') {
                    content = (
                        <PropertyInspector
                            title={selectedEntity ? selectedEntity.name : 'World'}
                            subtitle={selectedEntity ? selectedEntity.type : 'Scene defaults'}
                            sections={inspectorSections}
                            values={inspectorValues}
                            assetOptions={document.assets || []}
                            onSectionChange={(component, nextValue) => {
                                if (selectedEntity) {
                                    handleInspectorChange(component, nextValue)
                                } else if (component === 'worldState') {
                                    handleWorldPatch(nextValue)
                                }
                            }}
                            emptyMessage="Select an entity or import an asset to start editing."
                        />
                    )
                } else if (windowState.id === 'outliner') {
                    content = (
                        <BetaOutlinerWindow
                            entities={entities}
                            selectedEntityId={state.selectedEntityId}
                            onSelect={(entityId) => dispatch({ type: 'select-entity', entityId })}
                        />
                    )
                } else if (windowState.id === 'activity') {
                    content = <BetaActivityWindow activity={state.activity} />
                } else if (windowState.id === 'project') {
                    content = (
                        <BetaProjectWindow
                            document={document}
                            displayName={displayName}
                            onDisplayNameChange={(value) => {
                                setDisplayName(value)
                                try {
                                    window.localStorage.setItem(DISPLAY_NAME_KEY, value)
                                } catch {
                                    // ignore
                                }
                            }}
                            onProjectMetaPatch={handleProjectMetaPatch}
                            onWorldStatePatch={handleWorldPatch}
                        />
                    )
                }

                return (
                    <DesktopWindow
                        key={windowState.id}
                        windowState={windowState}
                        title={windowState.title}
                        minTop={workspaceTop}
                        onFocus={() => pushWindowOp(windowState.id, setWindowFocusPatch(windowState, topZIndex + 1), true)}
                        onPatch={(patch) => pushWindowOp(windowState.id, patch)}
                        onClose={() => pushWindowOp(windowState.id, { visible: false })}
                        onToggleMinimize={() => pushWindowOp(windowState.id, { minimized: !windowState.minimized }, true)}
                        onTogglePin={() => pushWindowOp(windowState.id, { pinned: !windowState.pinned }, true)}
                    >
                        {content}
                    </DesktopWindow>
                )
            })}
        </main>
    )
}
