import BetaViewport from './BetaViewport.jsx'

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
    onEnterFullscreen,
    onEnterOverlay,
}) {
    return (
        <div className="beta-world-panel">
            <BetaViewport
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
            />
            <div className="beta-world-panel-actions">
                <button
                    type="button"
                    className="beta-world-panel-btn"
                    onClick={onEnterOverlay}
                    title="World as background"
                    aria-label="World as background"
                >
                    ◫
                </button>
                <button
                    type="button"
                    className="beta-world-panel-btn"
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
