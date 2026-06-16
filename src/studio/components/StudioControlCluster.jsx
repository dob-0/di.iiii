import { useState } from 'react'
import { usePanelDrag } from '../../hooks/usePanelDrag.js'

const PANEL_BUTTONS = [
    { key: 'library', label: 'Library' },
    { key: 'assets', label: 'Assets' },
    { key: 'inspector', label: 'Inspector' },
    { key: 'structure', label: 'Structure' },
    { key: 'present', label: 'Present' },
    { key: 'publish', label: 'Publish' },
    { key: 'activity', label: 'Activity' },
    { key: 'world', label: 'World' },
]

export default function StudioControlCluster({
    spaceName,
    editMode,
    onSetEditMode,
    gizmoMode,
    onSetGizmoMode,
    openPanels,
    onTogglePanel,
    onFullscreen,
    onHideUI,
    onBackToHub,
    xrState,
    syncState,
    presence,
    snapEdges = false,
    onToggleSnap,
    onTileLayout,
    onStackLeft,
    onStackRight,
    onResetLayout,
}) {
    const [collapsed, setCollapsed] = useState(false)

    const initialPos = { x: typeof window !== 'undefined' ? window.innerWidth - 340 : 860, y: 16 }
    const { panelRef, dragProps, dragStyle, panelPointerProps } = usePanelDrag(initialPos, { baseZ: 1500 })

    const canVr = xrState?.canEnterVr
    const canAr = xrState?.canEnterAr
    const inXr = xrState?.isPresenting
    const xrMode = xrState?.mode

    return (
        <div ref={panelRef} style={dragStyle} className="scc-wrap" {...panelPointerProps}>
            <div className="scc-cluster">
                <div className="scc-header" {...dragProps}>
                    <span className="scc-space-name">{spaceName || 'Studio'}</span>
                    {syncState && (
                        <span className={`scc-sync-dot scc-sync-dot--${syncState.sceneStreamState || 'idle'}`} title={syncState.sceneStreamState} />
                    )}
                    <button className="scc-collapse-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
                        {collapsed ? '▸' : '▾'}
                    </button>
                </div>

                {!collapsed && (
                    <>
                        <div className="scc-section">
                            <div className="scc-section-label">Scene</div>
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
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'translate' ? 'active' : ''}`} onClick={() => onSetGizmoMode('translate')} title="Move (T)">T</button>
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'rotate' ? 'active' : ''}`} onClick={() => onSetGizmoMode('rotate')} title="Rotate (R)">R</button>
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'scale' ? 'active' : ''}`} onClick={() => onSetGizmoMode('scale')} title="Scale (S)">S</button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="scc-section">
                            <div className="scc-section-label">Panels</div>
                            <div className="scc-buttons">
                                {PANEL_BUTTONS.map(({ key, label }) => (
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
                                <button className="scc-btn" onClick={onBackToHub} title="Back to hub">← Hub</button>
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
