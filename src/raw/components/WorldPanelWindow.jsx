import RawViewport from './RawViewport.jsx'

export default function WorldPanelWindow({
    document,
    selectedEntityId = null,
    selectedNodeId = null,
    onSelectEntity,
    onSelectNode,
    onClearSelection,
    onWorldDoubleClick,
    onMoveNode,
    cursors = [],
    onCursorMove,
    onCursorLeave,
    nodeScale = 1,
    scopeId,
    worldNode,
    isLive = false,
    onSetLive,
    onEnterFullscreen,
    liveOutputs = null,
}) {
    return (
        // The scope a file dropped ON the room should join. Without it a drop
        // lands in the scope the graph is showing, which for the root World
        // means the node exists but the room stays empty — the model is a card
        // nobody can see.
        <div className="raw-world-panel" data-world-scope-id={scopeId || ''}>
            <RawViewport
                topInset={0}
                document={document}
                selectedEntityId={selectedEntityId}
                selectedNodeId={selectedNodeId}
                onSelectEntity={onSelectEntity}
                onSelectNode={onSelectNode}
                onClearSelection={onClearSelection}
                onWorldDoubleClick={onWorldDoubleClick}
                onMoveNode={onMoveNode}
                cursors={cursors}
                onCursorMove={onCursorMove}
                onCursorLeave={onCursorLeave}
                nodeScale={nodeScale}
                showEmptyHint={false}
                scopeId={scopeId}
                worldNode={worldNode}
                liveOutputs={liveOutputs}
            />
            <div className="raw-world-panel-actions">
                <button
                    type="button"
                    className={`raw-world-panel-btn${isLive ? ' is-live' : ''}`}
                    onClick={onSetLive}
                    title={isLive ? 'Live output for this scope' : 'Mark as live output for this scope'}
                    aria-label={isLive ? 'Live output for this scope' : 'Mark as live output for this scope'}
                    aria-pressed={isLive}
                >
                    ●
                </button>
                <button
                    type="button"
                    className="raw-world-panel-btn"
                    onClick={onEnterFullscreen}
                    title="Fullscreen world"
                    aria-label="Fullscreen world"
                >
                    ⤢
                </button>
            </div>
        </div>
    )
}
