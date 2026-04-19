export default function BetaGraphSurface({
    nodes = [],
    selectedNodeId = null,
    onSelectNode
}) {
    const visibleNodes = nodes.filter((node) => !['core.project', 'world.root', 'view.root'].includes(node.definitionId))

    return (
        <section className="beta-graph-surface">
            <header className="beta-graph-surface-header">
                <span className="beta-window-kicker">Graph</span>
                <h2>Project Node Graph</h2>
                <p>Every authored thing lives here. World and view are just different mounts of the same node graph.</p>
            </header>

            <div className="beta-graph-grid">
                {visibleNodes.length ? visibleNodes.map((node) => (
                    <button
                        key={node.id}
                        type="button"
                        className={`beta-graph-node-card ${node.id === selectedNodeId ? 'is-selected' : ''}`}
                        onClick={() => onSelectNode?.(node.id)}
                    >
                        <strong>{node.label}</strong>
                        <span>{node.definitionId}</span>
                        <small>{node.mount?.surface || 'graph'} / {node.mount?.mode || 'hidden'}</small>
                    </button>
                )) : (
                    <div className="beta-empty-state">Blank graph. Double-click in the world or the view to start authoring.</div>
                )}
            </div>
        </section>
    )
}
