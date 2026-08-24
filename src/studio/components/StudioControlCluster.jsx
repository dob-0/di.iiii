import { useState } from 'react'
import { usePanelDrag } from '../../hooks/usePanelDrag.js'

// Five scene windows, one per job: add things, edit the scene, configure the
// world, ship it, write code — plus Projects, the space-level window for
// hopping between and managing the space's projects without the hub detour.
const PANEL_BUTTONS = [
    { key: 'create', label: 'Create' },
    { key: 'scene', label: 'Objects' },
    { key: 'world', label: 'Scene' },
    { key: 'publish', label: 'Share' },
    { key: 'files', label: 'Code' },
    { key: 'projects', label: 'Projects' },
]

export default function StudioControlCluster({
    spaceName,
    projectName,
    onViewLive,
    canViewLive = false,
    editMode,
    onSetEditMode,
    gizmoMode,
    onSetGizmoMode,
    openPanels,
    onTogglePanel,
    onFullscreen,
    onHideUI,
    onBackToHub,
    onOpenNodeEditor,
    xrState,
    syncState,
    presence,
    snapEdges = false,
    onToggleSnap,
    onTileLayout,
    onStackLeft,
    onStackRight,
    onResetLayout,
    onShowHelp,
    // Jam mode (communal open-jam project): `panelKeys` narrows the Windows
    // row, `minimal` trims power-user chrome (Arrange, Hub, View live), and
    // `onToggleAllTools` renders the escape hatch between Simple ⇄ All tools.
    panelKeys = null,
    minimal = false,
    allTools = false,
    onToggleAllTools = null,
}) {
    const [collapsed, setCollapsed] = useState(false)

    const initialPos = { x: typeof window !== 'undefined' ? window.innerWidth - 400 : 880, y: 90 }
    const { panelRef, dragProps, dragStyle, panelPointerProps } = usePanelDrag(initialPos, { baseZ: 1500, snapEdges })

    const panelButtons = panelKeys
        ? PANEL_BUTTONS.filter(({ key }) => panelKeys.includes(key))
        : PANEL_BUTTONS

    const canVr = xrState?.canEnterVr
    const canAr = xrState?.canEnterAr
    const inXr = xrState?.isPresenting
    const xrMode = xrState?.mode

    return (
        <div ref={panelRef} style={dragStyle} className="scc-wrap" {...panelPointerProps}>
            <div className="scc-cluster">
                <div className="scc-header" {...dragProps}>
                    <span className="scc-space-name">
                        {spaceName || 'Studio'}{projectName ? ` · ${projectName}` : ''}
                    </span>
                    {syncState && (
                        <span
                            className={`scc-sync-dot scc-sync-dot--${syncState.pendingSyncError ? 'error' : (syncState.sceneStreamState || 'idle')}`}
                            // "retrying" was a lie on the path that matters most: a 401
                            // clearTimeout()s the retry and breaks, so nothing is retrying
                            // and the queued edits sit in memory until a reload drops them.
                            // The message the sync layer already wrote says what to do.
                            title={syncState.pendingSyncError || syncState.sceneStreamState}
                        />
                    )}
                    <button className="scc-collapse-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
                        {collapsed ? '▸' : '▾'}
                    </button>
                </div>

                {!collapsed && (
                    <>
                        <div className="scc-section">
                            <div className="scc-section-label">Tools</div>
                            <div className="scc-buttons">
                                <button
                                    className={`scc-btn ${editMode === 'navigate' ? 'active' : ''}`}
                                    onClick={() => onSetEditMode('navigate')}
                                    title="Navigate mode (E)"
                                >
                                    Navigate
                                </button>
                                <button
                                    className={`scc-btn ${editMode === 'edit' ? 'active' : ''}`}
                                    onClick={() => onSetEditMode('edit')}
                                    title="Edit mode (E)"
                                >
                                    Edit
                                </button>
                                {editMode === 'edit' && (
                                    <>
                                        <div className="scc-sep" />
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'translate' ? 'active' : ''}`} onClick={() => onSetGizmoMode('translate')} title="Move (G)">G</button>
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'rotate' ? 'active' : ''}`} onClick={() => onSetGizmoMode('rotate')} title="Rotate (R)">R</button>
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'scale' ? 'active' : ''}`} onClick={() => onSetGizmoMode('scale')} title="Scale (S)">S</button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="scc-section">
                            <div className="scc-section-label">Windows</div>
                            <div className="scc-buttons">
                                {panelButtons.map(({ key, label }) => (
                                    <button
                                        key={key}
                                        className={`scc-btn ${openPanels.has(key) ? 'active' : ''}`}
                                        onClick={() => onTogglePanel(key)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="scc-section">
                            <div className="scc-section-label">Display</div>
                            <div className="scc-buttons">
                                <button className="scc-btn" onClick={onFullscreen} title="Toggle fullscreen">⛶ Fullscreen</button>
                                <button className="scc-btn" onClick={onHideUI} title="Hide UI (H)">Hide UI</button>
                                <button className="scc-btn" onClick={onShowHelp} title="Keyboard shortcuts (Shift+?)">? Help</button>
                                {!minimal && (
                                    <button className="scc-btn" onClick={onBackToHub} title="Back to projects">← Projects</button>
                                )}
                                {!minimal && onOpenNodeEditor && (
                                    <button className="scc-btn" onClick={onOpenNodeEditor} title="Open this project in the node editor">⇄ Nodes</button>
                                )}
                                {!minimal && canViewLive && (
                                    <button className="scc-btn" onClick={onViewLive} title="Open the public space URL in a new tab">↗ View live</button>
                                )}
                                {onToggleAllTools && (
                                    <button
                                        className="scc-btn"
                                        onClick={onToggleAllTools}
                                        title={allTools ? 'Back to the simple jam view' : 'Show the full editor'}
                                    >
                                        {allTools ? '◱ Simple' : '⚒ All tools'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {(canVr || canAr) && (
                            <div className="scc-section">
                                <div className="scc-section-label">XR</div>
                                <div className="scc-buttons">
                                    {canVr && (
                                        <button
                                            className={`scc-btn ${inXr && xrMode === 'vr' ? 'active' : ''}`}
                                            onClick={inXr ? xrState?.onExitXr : xrState?.onEnterVr}
                                        >
                                            {inXr && xrMode === 'vr' ? 'Exit VR' : 'VR'}
                                        </button>
                                    )}
                                    {canAr && (
                                        <button
                                            className={`scc-btn ${inXr && xrMode === 'ar' ? 'active' : ''}`}
                                            onClick={inXr ? xrState?.onExitXr : xrState?.onEnterAr}
                                        >
                                            {inXr && xrMode === 'ar' ? 'Exit AR' : 'AR'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {!minimal && (
                            <div className="scc-section">
                                <div className="scc-section-label">Arrange</div>
                                <div className="scc-buttons">
                                    <button className="scc-btn" onClick={onTileLayout} title="Auto-tile open panels (Shift+A)">⊞ Tile</button>
                                    <button className="scc-btn" onClick={onResetLayout} title="Reset panel positions (Shift+R)">↺ Reset</button>
                                    <button className="scc-btn" onClick={onStackLeft} title="Stack panels left">← Stack</button>
                                    <button className="scc-btn" onClick={onStackRight} title="Stack panels right">Stack →</button>
                                    <button className={`scc-btn ${snapEdges ? 'active' : ''}`} onClick={onToggleSnap} title="Snap to screen edges">⌖ Snap</button>
                                </div>
                            </div>
                        )}

                        {presence?.users?.length > 0 && (
                            <div className="scc-presence">
                                {presence.users.map((u) => (
                                    <span
                                        key={u.socketId || u.userId}
                                        className="scc-presence-dot"
                                        title={u.userName || u.userId || 'User'}
                                    >
                                        {(u.userName || u.userId || '?').slice(0, 1).toUpperCase()}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
