import { useState } from 'react'
import { usePanelDrag } from '../../hooks/usePanelDrag.js'
import StudioSaveLine from './StudioSaveLine.jsx'

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
    // This project's VIEW page as a visitor opens it (an absolute address, built in StudioEditor from the
    // space and the project's slug). Null until the ids are known, and then the button is not drawn.
    previewUrl = null,
    editMode,
    onSetEditMode,
    // Blender's Select Box tool is on (StudioShell viewportSelectTool).
    selectTool = false,
    // The running walk ('walk' | 'fly' | null) and the start / switch / leave call (useWalkNavigation's useWalkMode and
    // requestWalk). Null onWalk draws no buttons.
    walkMode = null,
    onWalk = null,
    gizmoMode,
    onSetGizmoMode,
    gizmoSpace = 'world',
    onSetGizmoSpace,
    openPanels,
    onTogglePanel,
    onFullscreen,
    onHideUI,
    onBackToHub,
    onOpenNodeEditor,
    onOpenProjection,
    xrState,
    syncState,
    // Undo and Redo: the same calls as Ctrl+Z. Null onUndo draws no buttons; canUndo / canRedo say the ends.
    onUndo = null,
    onRedo = null,
    canUndo = false,
    canRedo = false,
    presence,
    snapEdges = false,
    onToggleSnap,
    onTileLayout,
    onStackLeft,
    onStackRight,
    onResetLayout,
    onShowHelp,
    // The real lighting rig mirrored into the room. Null when there is no lighting on
    // this machine — which is every hosted di.iiii — and then the button is not drawn.
    rigMirrorOn = false,
    onToggleRigMirror = null,
    // The project's cues, fired from here as well as from the projection tool
    // — one key, the whole stage. Empty on a project that has none, and then
    // the section is not drawn at all.
    cues = [],
    liveCueId = null,
    onFireCue = null,
    // Positions go back to the desk once, on this. Drawn only while Lights is on, so
    // the room the person is looking at is the room the desk will be told about.
    onSendRigPositions = null,
    // What the last send answered ("3 lamps moved", "no desk on this machine"), for a
    // few seconds. Beside the button, not in the bottom pill: the first-run coach owns
    // that spot and the two stacked on a newcomer's very first press (seen).
    rigPositionsNote = '',
    // Jam mode (communal open-jam project): `panelKeys` narrows the Windows
    // row, `minimal` trims power-user chrome (Arrange, Hub, View live), and
    // `onToggleAllTools` renders the escape hatch between Simple ⇄ All tools.
    panelKeys = null,
    minimal = false,
    allTools = false,
    onToggleAllTools = null,
    // Every project has "⚒ All tools" now (the layers decision, 2026-09-23);
    // outside the jam it says what it does there. Null keeps the jam's words.
    allToolsHint = null,
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
                            className={`scc-sync-dot scc-sync-dot--${syncState.sceneStreamState || 'idle'}`}
                            // The dot is the live scene connection only. Whether work is stored is the
                            // save line below, in words (F089); the red dot and its raw-error tooltip
                            // said the same thing a second time.
                            title={syncState.sceneStreamState}
                        />
                    )}
                    {onUndo && (
                        <button type="button" className="scc-btn scc-undo-btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">Undo</button>
                    )}
                    {onRedo && (
                        <button type="button" className="scc-btn scc-undo-btn" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
                    )}
                    <button className="scc-collapse-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
                        {collapsed ? '▸' : '▾'}
                    </button>
                </div>

                {syncState && <StudioSaveLine syncState={syncState} className="scc-save-line" />}

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
                                <button
                                    className={`scc-btn ${selectTool ? 'active' : ''}`}
                                    onClick={() => onSetEditMode('select')}
                                    aria-pressed={selectTool}
                                    title="Select box: drag on the room to select everything inside (Shift adds, Ctrl removes). B for one box from any mode."
                                >
                                    Select
                                </button>
                                {onWalk && (
                                    <>
                                        <button
                                            className={`scc-btn ${walkMode === 'walk' ? 'active' : ''}`}
                                            data-walk-mode="walk"
                                            onClick={() => onWalk('walk')}
                                            aria-pressed={walkMode === 'walk'}
                                            title="Walk: the camera stays at eye height above the floor; mouse looks, W A S D move, Tab flies; Esc keeps the place, right click returns (Blender: Walk with gravity)"
                                        >
                                            Walk
                                        </button>
                                        <button
                                            className={`scc-btn ${walkMode === 'fly' ? 'active' : ''}`}
                                            data-walk-mode="fly"
                                            onClick={() => onWalk('fly')}
                                            aria-pressed={walkMode === 'fly'}
                                            title="Fly (Shift+`): mouse looks, W A S D move, Q E down/up, Tab walks; Esc keeps the place, right click returns (Blender: Walk without gravity)"
                                        >
                                            Fly
                                        </button>
                                    </>
                                )}
                                {editMode === 'edit' && (
                                    <>
                                        <div className="scc-sep" />
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'translate' ? 'active' : ''}`} onClick={() => onSetGizmoMode('translate')} title="Move — G starts it at once, X / Y / Z constrain">Move G</button>
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'rotate' ? 'active' : ''}`} onClick={() => onSetGizmoMode('rotate')} title="Rotate — R starts it at once">Rotate R</button>
                                        <button className={`scc-btn scc-btn--icon ${gizmoMode === 'scale' ? 'active' : ''}`} onClick={() => onSetGizmoMode('scale')} title="Scale — S starts it at once (S is never Select; Select is the tool, B for one box)">Scale S</button>
                                        <button className={`scc-btn ${gizmoSpace === 'local' ? 'active' : ''}`} aria-pressed={gizmoSpace === 'local'} onClick={() => onSetGizmoSpace?.(gizmoSpace === 'local' ? 'world' : 'local')} title="Local axes — the gizmo follows the object's own axes; off, it moves along the world's (Blender: Transform Orientation, Global / Local)">Local</button>
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
                                {previewUrl && (
                                    <button
                                        className="scc-btn"
                                        onClick={() => window.open(previewUrl, '_blank', 'noopener')}
                                        title="Preview — the scene as visitors see it (new tab)"
                                    >
                                        Preview
                                    </button>
                                )}
                                {!minimal && (
                                    <button className="scc-btn" onClick={onBackToHub} title="Back to projects">← Projects</button>
                                )}
                                {!minimal && onOpenNodeEditor && (
                                    <button className="scc-btn" onClick={onOpenNodeEditor} title="Open this project in the node editor">⇄ Nodes</button>
                                )}
                                {!minimal && onOpenProjection && (
                                    <button className="scc-btn" onClick={onOpenProjection} title="Put this project on a wall">Projection</button>
                                )}
                                {!minimal && onToggleRigMirror && (
                                    <button className={`scc-btn ${rigMirrorOn ? 'active' : ''}`} onClick={onToggleRigMirror} aria-pressed={rigMirrorOn} title="Show the real lighting rig in the room">Lights</button>
                                )}
                                {!minimal && onToggleRigMirror && rigMirrorOn && onSendRigPositions && (
                                    <button className="scc-btn" onClick={onSendRigPositions} title="Move each fixture on the desk's plan to where its lamp stands in this room">Send positions to the desk</button>
                                )}
                                {!minimal && rigMirrorOn && rigPositionsNote && (
                                    <span className="scc-btn" role="status" aria-live="polite">{rigPositionsNote}</span>
                                )}
                                {!minimal && canViewLive && (
                                    <button className="scc-btn" onClick={onViewLive} title="Open the public space URL in a new tab">↗ View live</button>
                                )}
                                {onToggleAllTools && (
                                    <button
                                        className="scc-btn"
                                        onClick={onToggleAllTools}
                                        title={allToolsHint || (allTools ? 'Back to the simple jam view' : 'Show the full editor')}
                                    >
                                        {allTools ? '◱ Simple' : '⚒ All tools'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* The Cues section is gone from the cluster (owner 2026-10-12 06:30, editing MOXIR v2.7 lamps: "the cue
                            things is not necessary, remove that"): firing a cue from the editing panel changes the shared show
                            for everyone watching; looks are previewed in the scene's SHOW chip and run from the desk / cue list. */}
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
